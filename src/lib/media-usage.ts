import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mediaUsage, mediaVariants, visualPatches } from "@/db/schema";

/**
 * Phase 2.8 — media_usage synchronisation.
 *
 * Every content mutation that stores an image URL rebuilds the usage rows
 * for that entity, so the Media Library always knows where an asset is used
 * and the trash guard (`DELETE /api/admin/media`) can block unsafe deletes.
 *
 * Only uploaded library assets get usage rows; legacy `/images/…` and
 * external URLs resolve to nothing and stay untracked for now.
 */

function extractImageCandidate(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const src = (record as { src?: unknown }).src;
  return typeof src === "string" && src.trim() ? src.trim() : null;
}

/** Resolve public URLs (any variant URL) back to uploaded asset ids. */
export async function findAssetIdsByUrls(urls: Array<string | null | undefined>) {
  const candidates = Array.from(
    new Set(urls.filter((url): url is string => typeof url === "string" && !!url.trim())),
  );
  if (!candidates.length) return [] as number[];

  const rows = await db
    .select({ assetId: mediaVariants.assetId })
    .from(mediaVariants)
    .where(inArray(mediaVariants.publicUrl, candidates));

  return Array.from(new Set(rows.map((row) => row.assetId)));
}

/**
 * Rebuild usage rows for one structured entity field (news cover, gallery
 * frame …). Existing rows for the entity are replaced in full.
 */
export async function syncEntityMediaUsage(options: {
  entityType: "post" | "gallery" | "event" | "staff" | "setting";
  entityId: string | number;
  fieldName?: string;
  urls: Array<string | null | undefined>;
}) {
  const entityId = String(options.entityId);
  await db
    .delete(mediaUsage)
    .where(
      and(
        eq(mediaUsage.entityType, options.entityType),
        eq(mediaUsage.entityId, entityId),
      ),
    );

  const assetIds = await findAssetIdsByUrls(options.urls);
  if (!assetIds.length) return [];

  await db.insert(mediaUsage).values(
    assetIds.map((assetId) => ({
      assetId,
      entityType: options.entityType,
      entityId,
      fieldName: (options.fieldName || "image").slice(0, 80),
      pagePath: null,
    })),
  );
  return assetIds;
}

/** Remove every usage row for an entity that no longer exists. */
export async function clearEntityMediaUsage(
  entityType: "post" | "gallery" | "event" | "staff" | "setting",
  entityId: string | number,
) {
  await db
    .delete(mediaUsage)
    .where(and(eq(mediaUsage.entityType, entityType), eq(mediaUsage.entityId, String(entityId))));
}

/**
 * Rebuild usage rows for every visual patch on one public page. Both the
 * draft and published `src` values are tracked so an image referenced only
 * by an unpublished draft still cannot be trashed silently.
 */
export async function syncPageMediaUsage(pagePath: string) {
  const patches = await db
    .select({
      selector: visualPatches.selector,
      draftData: visualPatches.draftData,
      publishedData: visualPatches.publishedData,
    })
    .from(visualPatches)
    .where(eq(visualPatches.pagePath, pagePath));

  await db
    .delete(mediaUsage)
    .where(and(eq(mediaUsage.entityType, "page"), eq(mediaUsage.entityId, pagePath)));

  const rows: Array<{ assetId: number; fieldName: string }> = [];
  const seen = new Set<string>();

  for (const patch of patches) {
    const urls = [extractImageCandidate(patch.draftData), extractImageCandidate(patch.publishedData)];
    const assetIds = await findAssetIdsByUrls(urls);
    for (const assetId of assetIds) {
      const fieldName = patch.selector.slice(0, 80) || "element";
      const key = `${assetId}:${fieldName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ assetId, fieldName });
    }
  }

  if (rows.length) {
    await db.insert(mediaUsage).values(
      rows.map((row) => ({
        assetId: row.assetId,
        entityType: "page",
        entityId: pagePath,
        fieldName: row.fieldName,
        pagePath,
      })),
    );
  }
  return rows.length;
}
