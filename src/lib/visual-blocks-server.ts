import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, mediaUsage, mediaVariants, visualBlocks } from "@/db/schema";
import { blockDef, defaultsFor } from "@/lib/visual-block-defs";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { and, inArray } from "drizzle-orm";

export type VisualBlockRow = typeof visualBlocks.$inferSelect;
/** v2.8.98.0 — where a block renders on its page. */
export type BlockPosition = "top" | "bottom";

/* v2.9.7.0 — PERF: every public page render reads its visual blocks (top +
   bottom) — a remote round trip each. 5 s in-process cache for PUBLISHED
   rows; the admin block routes call invalidateVisualBlocksCache() on every
   write, so edits land on the next render. Draft reads stay uncached. */
const BLOCKS_TTL_MS = 5_000;

const globalForBlocks = globalThis as typeof globalThis & {
  __stcBlocksPub?: Map<string, { at: number; rows: VisualBlockRow[] }>;
};

export function invalidateVisualBlocksCache() {
  globalForBlocks.__stcBlocksPub = undefined;
}

export function normalisePosition(value: unknown): BlockPosition {
  return value === "top" ? "top" : "bottom";
}

export async function getVisualBlocks(
  pagePath: string,
  mode: "draft" | "published" = "published",
): Promise<VisualBlockRow[]> {
  if (mode === "published") {
    const cached = globalForBlocks.__stcBlocksPub?.get(pagePath);
    if (cached && Date.now() - cached.at < BLOCKS_TTL_MS) return cached.rows;
  }

  /* Late-added columns (visual_blocks.position) must exist before the first
     select — memoised, so this is a no-op after the first call. */
  await ensureSchemaExtras().catch(() => 0);
  const rows = await db
    .select()
    .from(visualBlocks)
    .where(eq(visualBlocks.pagePath, pagePath))
    .orderBy(asc(visualBlocks.sortOrder), asc(visualBlocks.id));
  if (mode === "draft") return rows;
  const published = rows.filter((row) => !row.publishedHidden);
  (globalForBlocks.__stcBlocksPub ??= new Map()).set(pagePath, {
    at: Date.now(),
    rows: published,
  });
  return published;
}

function cleanData(type: string, input: unknown) {
  const def = blockDef(type);
  if (!def) throw new Error("Unknown block type.");
  const source = (input ?? {}) as Record<string, unknown>;
  const data: Record<string, string> = {};
  for (const field of def.fields) {
    const fallback = def.defaults[field.key] ?? "";
    const value =
      typeof source[field.key] === "string" && String(source[field.key]).trim()
        ? String(source[field.key]).trim()
        : fallback;
    if (field.type === "image" && value && !value.startsWith("/") && !value.startsWith("https://")) {
      throw new Error(`${field.label} must be a local /path or HTTPS URL.`);
    }
    if (field.type === "url" && value && !value.startsWith("/") && !value.startsWith("https://") && !value.startsWith("#")) {
      throw new Error(`${field.label} must be a local path, anchor or HTTPS URL.`);
    }
    data[field.key] = value.slice(0, 4000);
  }
  return data;
}

async function syncBlockUsage(blockId: number, pagePath: string, urls: string[]) {
  const entityId = `block-${blockId}`;
  await db
    .delete(mediaUsage)
    .where(and(eq(mediaUsage.entityType, "page"), eq(mediaUsage.entityId, entityId)));

  const candidates = urls.filter(Boolean);
  if (!candidates.length) return;
  const variants = await db
    .select({ assetId: mediaVariants.assetId })
    .from(mediaVariants)
    .where(inArray(mediaVariants.publicUrl, candidates));
  const ids = Array.from(new Set(variants.map((row) => row.assetId)));
  if (!ids.length) return;
  await db.insert(mediaUsage).values(
    ids.map((assetId) => ({
      assetId,
      entityType: "page",
      entityId,
      fieldName: "block-image",
      pagePath,
    })),
  );
}

function imageUrls(type: string, data: Record<string, string>) {
  const def = blockDef(type);
  if (!def) return [];
  return def.fields.filter((f) => f.type === "image").map((f) => data[f.key] ?? "");
}

export async function createVisualBlock({
  pagePath,
  blockType,
  position,
  userId,
}: {
  pagePath: string;
  blockType: string;
  /** v2.8.98.0 — chosen landing spot: under the navbar or above the footer. */
  position?: unknown;
  userId: number;
}) {
  invalidateVisualBlocksCache();
  const data = cleanData(blockType, defaultsFor(blockType));
  const where = normalisePosition(position);
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${visualBlocks.sortOrder}), 0)` })
    .from(visualBlocks)
    .where(
      and(eq(visualBlocks.pagePath, pagePath), eq(visualBlocks.position, where)),
    );
  const [created] = await db
    .insert(visualBlocks)
    .values({
      pagePath,
      blockType,
      draftData: data,
      publishedData: {},
      position: where,
      updatedBy: userId,
      sortOrder: (maxOrder ?? 0) + 10,
    })
    .returning();
  await db.insert(adminAuditLogs).values({
    userId,
    action: "create_visual_block",
    entity: "visual_block",
    entityId: String(created.id),
    details: { pagePath, blockType, position: where },
  });
  return created;
}

export async function updateVisualBlock({
  id,
  input,
  userId,
}: {
  id: number;
  input: {
    data?: Record<string, unknown>;
    hidden?: boolean;
    sortOrder?: number;
    position?: unknown;
  };
  userId: number;
}) {
  invalidateVisualBlocksCache();
  const [existing] = await db.select().from(visualBlocks).where(eq(visualBlocks.id, id)).limit(1);
  if (!existing) throw new Error("Block not found.");

  const patch: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  let nextData = existing.draftData as Record<string, string>;
  if (input.data !== undefined) {
    nextData = cleanData(existing.blockType, {
      ...(existing.draftData as Record<string, string>),
      ...input.data,
    });
    patch.draftData = nextData;
  }
  if (input.hidden !== undefined) patch.draftHidden = Boolean(input.hidden);
  if (input.sortOrder !== undefined) patch.sortOrder = Number(input.sortOrder) || 0;
  /* v2.8.98.0 — moving a block between the page top and bottom takes effect
     immediately (position is not drafted; only content + visibility are). */
  if (input.position !== undefined) {
    patch.position = normalisePosition(input.position);
  }

  const [updated] = await db
    .update(visualBlocks)
    .set(patch)
    .where(eq(visualBlocks.id, id))
    .returning();

  await syncBlockUsage(id, existing.pagePath, imageUrls(existing.blockType, nextData));
  await db.insert(adminAuditLogs).values({
    userId,
    action: "update_visual_block",
    entity: "visual_block",
    entityId: String(id),
  });
  return updated;
}

export async function deleteVisualBlock(id: number, userId: number) {
  invalidateVisualBlocksCache();
  const [removed] = await db.delete(visualBlocks).where(eq(visualBlocks.id, id)).returning();
  await db
    .delete(mediaUsage)
    .where(and(eq(mediaUsage.entityType, "page"), eq(mediaUsage.entityId, `block-${id}`)));
  await db.insert(adminAuditLogs).values({
    userId,
    action: "delete_visual_block",
    entity: "visual_block",
    entityId: String(id),
  });
  return removed;
}

export async function publishVisualBlocks(pagePath: string, userId: number) {
  const rows = await db.select().from(visualBlocks).where(eq(visualBlocks.pagePath, pagePath));
  await Promise.all(
    rows.map((row) =>
      db
        .update(visualBlocks)
        .set({
          publishedData: row.draftData,
          publishedHidden: row.draftHidden,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(visualBlocks.id, row.id)),
    ),
  );
  return rows.length;
}

export async function discardVisualBlockDrafts(pagePath: string, userId: number) {
  const rows = await db.select().from(visualBlocks).where(eq(visualBlocks.pagePath, pagePath));
  await Promise.all(
    rows.map((row) =>
      db
        .update(visualBlocks)
        .set({
          draftData: row.publishedData,
          draftHidden: row.publishedHidden,
          updatedBy: userId,
        })
        .where(eq(visualBlocks.id, row.id)),
    ),
  );
  return rows.length;
}
