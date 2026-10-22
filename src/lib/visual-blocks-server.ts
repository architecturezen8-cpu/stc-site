import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, mediaUsage, mediaVariants, visualBlocks } from "@/db/schema";
import { blockDef, defaultsFor } from "@/lib/visual-block-defs";
import { and, inArray } from "drizzle-orm";

export type VisualBlockRow = typeof visualBlocks.$inferSelect;

export async function getVisualBlocks(
  pagePath: string,
  mode: "draft" | "published" = "published",
): Promise<VisualBlockRow[]> {
  const rows = await db
    .select()
    .from(visualBlocks)
    .where(eq(visualBlocks.pagePath, pagePath))
    .orderBy(asc(visualBlocks.sortOrder), asc(visualBlocks.id));
  if (mode === "draft") return rows;
  return rows.filter((row) => !row.publishedHidden);
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
  userId,
}: {
  pagePath: string;
  blockType: string;
  userId: number;
}) {
  const data = cleanData(blockType, defaultsFor(blockType));
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${visualBlocks.sortOrder}), 0)` })
    .from(visualBlocks)
    .where(eq(visualBlocks.pagePath, pagePath));
  const [created] = await db
    .insert(visualBlocks)
    .values({
      pagePath,
      blockType,
      draftData: data,
      publishedData: {},
      updatedBy: userId,
      sortOrder: (maxOrder ?? 0) + 10,
    })
    .returning();
  await db.insert(adminAuditLogs).values({
    userId,
    action: "create_visual_block",
    entity: "visual_block",
    entityId: String(created.id),
    details: { pagePath, blockType },
  });
  return created;
}

export async function updateVisualBlock({
  id,
  input,
  userId,
}: {
  id: number;
  input: { data?: Record<string, unknown>; hidden?: boolean; sortOrder?: number };
  userId: number;
}) {
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
