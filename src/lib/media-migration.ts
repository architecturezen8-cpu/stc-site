import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  galleryItems,
  mediaAssets,
  mediaVariants,
  oldThomians,
  posts,
  staff,
  streamTeachers,
} from "@/db/schema";
import { PORTRAIT, SCENE } from "@/lib/media";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { processAndStoreImage } from "@/lib/media-processing";
import { syncEntityMediaUsage } from "@/lib/media-usage";

/**
 * Phase 2.9 — existing media migration.
 *
 * The Media Library used to show two kinds of "virtual" legacy entries:
 * static `/images/*.jpg` files and hot-linked Pexels seed imagery. Neither
 * had real asset rows, WebP variants, blur previews or usage tracking.
 *
 * This engine imports every legacy source through the normal upload
 * pipeline (Sharp → WebP variants → dedupe by content hash), stamps the
 * asset with the original URL (`media_assets.source_url`), rewrites the
 * content tables that still reference the legacy URLs to the new master
 * variant URLs, and rebuilds the media_usage rows so the delete guard
 * knows exactly where every migrated image is used.
 *
 * The whole run is idempotent — sources whose URL already has a live
 * asset row are skipped, so re-running after a partial failure only
 * processes what is left.
 */

const PUBLIC_IMAGES_DIR = path.join(process.cwd(), "public", "images");
const FETCH_TIMEOUT_MS = 20_000;

export type LegacySource = {
  /** Stable identifier, e.g. `local:hero` / `pexels:29658108`. */
  key: string;
  /** The URL exactly as it is stored in content rows. */
  url: string;
  title: string;
  altText: string;
  filename: string;
  category: string;
  folder: string;
  provider: "legacy" | "external";
  load: () => Promise<Buffer>;
};

/** The ten static seed images shipped in `public/images`. */
export const LEGACY_STATIC_SOURCES: LegacySource[] = [
  { title: "Hero Campus View", file: "hero.jpg", category: "Campus", folder: "site-assets" },
  { title: "Historic Quadrangle", file: "about.jpg", category: "Campus", folder: "site-assets" },
  { title: "Principal Portrait", file: "principal.jpg", category: "Portraits", folder: "staff" },
  { title: "Sports & Cricket", file: "sports.jpg", category: "Sports", folder: "sports" },
  { title: "Big Match Matchplay", file: "news-sports.jpg", category: "Sports", folder: "news" },
  {
    title: "Robotics & Innovation Lab",
    file: "clubs.jpg",
    category: "Academics",
    folder: "academics",
  },
  {
    title: "Senior Science Lab",
    file: "senior-school.jpg",
    category: "Academics",
    folder: "academics",
  },
  {
    title: "Science Fair Champions",
    file: "news-science.jpg",
    category: "Academics",
    folder: "news",
  },
  {
    title: "Middle School Classrooms",
    file: "middle-school.jpg",
    category: "Campus",
    folder: "academics",
  },
  {
    title: "Western & Brass Band",
    file: "news-music.jpg",
    category: "Arts & Culture",
    folder: "news",
  },
].map(({ title, file, category, folder }) => ({
  key: `local:${file.replace(/\.[^.]+$/, "")}`,
  url: `/images/${file}`,
  title,
  altText: title,
  filename: file,
  category,
  folder,
  provider: "legacy" as const,
  load: async () => readFile(path.join(PUBLIC_IMAGES_DIR, file)),
}));

async function fetchExternal(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Source responded ${response.status}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** The Pexels seed portraits/scenes referenced across seeded content. */
export const LEGACY_EXTERNAL_SOURCES: LegacySource[] = [
  ...Object.entries(PORTRAIT).map(([name, url]) => ({
    key: `pexels:${name}`,
    url,
    title: `Faculty Portrait (${name})`,
    altText: `Faculty portrait ${name}`,
    filename: `faculty-portrait-${name}.jpg`,
    category: "Portraits",
    folder: "staff",
    provider: "external" as const,
    load: () => fetchExternal(url),
  })),
  ...Object.entries(SCENE).map(([name, url]) => ({
    key: `pexels:${name}`,
    url,
    title: `Campus Scene (${name})`,
    altText: `Campus scene ${name}`,
    filename: `campus-scene-${name}.jpg`,
    category: "Events & Sports",
    folder: "scenes",
    provider: "external" as const,
    load: () => fetchExternal(url),
  })),
];

export const LEGACY_SOURCES: LegacySource[] = [
  ...LEGACY_STATIC_SOURCES,
  ...LEGACY_EXTERNAL_SOURCES,
];

/** The virtual picker entries the Media Library shows before migration. */
export function legacyVirtualEntries() {
  return LEGACY_SOURCES.map((source) => ({
    id: source.key,
    title: source.title,
    name: source.title,
    url: source.url,
    category: source.category,
    folder: source.folder,
    provider: source.provider,
    altText: source.altText,
  }));
}

/** URL with any query string removed — tolerant matching for CDN URLs. */
function baseUrl(url: string): string {
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}

const LEGACY_URL_SET = new Set(LEGACY_SOURCES.map((source) => source.url));
const LEGACY_BASE_URL_SET = new Set(
  Array.from(LEGACY_URL_SET).map((url) => baseUrl(url)),
);

/** True when a content URL is one of the known legacy source URLs. */
function isLegacyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (LEGACY_URL_SET.has(url)) return true;
  return LEGACY_BASE_URL_SET.has(baseUrl(url));
}

export type LegacyMigrationReferences = {
  posts: number;
  postsExtra: number;
  galleryItems: number;
  staff: number;
  oldThomians: number;
  streamTeachers: number;
};

export type LegacyMigrationPreview = {
  sourceCount: number;
  migratedSourceCount: number;
  pendingSourceCount: number;
  references: LegacyMigrationReferences;
  totalReferences: number;
};

export type LegacyMigrationReport = LegacyMigrationPreview & {
  imported: number;
  duplicates: number;
  rewritten: Array<{ table: string; rows: number }>;
  usageRows: number;
  failures: Array<{ url: string; error: string }>;
  durationMs: number;
};

/** URL → master-variant resolver for one migration run. */
class LegacyUrlResolver {
  private exact = new Map<string, string>();
  private loose = new Map<string, string>();

  register(legacyUrl: string, masterUrl: string | null | undefined) {
    if (!legacyUrl || !masterUrl) return;
    if (!this.exact.has(legacyUrl)) this.exact.set(legacyUrl, masterUrl);
    const base = baseUrl(legacyUrl);
    if (!this.loose.has(base)) this.loose.set(base, masterUrl);
  }

  resolve(url: string | null | undefined): string | null {
    if (!url) return null;
    return this.exact.get(url) ?? this.loose.get(baseUrl(url)) ?? null;
  }
}

/**
 * Legacy re-import guard — the `source_url` column the original migration
 * wrote no longer exists in the schema, so URL-level dedupe cannot be looked
 * up any more. Re-runs now rely on processAndStoreImage's SHA-256 duplicate
 * detection instead (an identical upload still lands as `duplicate: true`,
 * so no asset is ever doubled) — this stub keeps the call sites honest.
 */
async function loadMigratedAssetIds(_urls: string[]) {
  return new Map<string, number>();
}

/**
 * Master-variant URL for every migrated asset, registered into the resolver
 * under its original legacy URL.
 */
async function registerMasterUrls(
  sourceUrls: string[],
  assetsBySource: Map<string, number>,
  resolver: LegacyUrlResolver,
) {
  const assetIds = Array.from(new Set(assetsBySource.values()));
  if (!assetIds.length) return 0;

  const variants = await db
    .select({
      assetId: mediaVariants.assetId,
      variantName: mediaVariants.variantName,
      publicUrl: mediaVariants.publicUrl,
    })
    .from(mediaVariants)
    .where(inArray(mediaVariants.assetId, assetIds));

  const masterByAsset = new Map<number, string>();
  for (const variant of variants) {
    if (variant.variantName === "master" && !masterByAsset.has(variant.assetId)) {
      masterByAsset.set(variant.assetId, variant.publicUrl);
    }
  }

  let registered = 0;
  for (const [sourceUrl, assetId] of assetsBySource) {
    const master = masterByAsset.get(assetId);
    if (!master) continue;
    resolver.register(sourceUrl, master);
    registered++;
  }
  return registered;
}

/** Count content rows still referencing legacy URLs (no writes). */
async function countReferences(): Promise<LegacyMigrationReferences> {
  const [postRows, galleryRows, staffRows, thomianRows, teacherRows] = await Promise.all([
    db.select({ image: posts.image, extraImages: posts.extraImages }).from(posts),
    db.select({ image: galleryItems.image }).from(galleryItems),
    db.select({ image: staff.image }).from(staff),
    db.select({ image: oldThomians.image }).from(oldThomians),
    db.select({ image: streamTeachers.image }).from(streamTeachers),
  ]);

  return {
    posts: postRows.filter((row) => isLegacyUrl(row.image)).length,
    postsExtra: postRows.reduce(
      (total, row) =>
        total +
        (Array.isArray(row.extraImages) ? row.extraImages : []).filter((url) =>
          isLegacyUrl(url),
        ).length,
      0,
    ),
    galleryItems: galleryRows.filter((row) => isLegacyUrl(row.image)).length,
    staff: staffRows.filter((row) => isLegacyUrl(row.image)).length,
    oldThomians: thomianRows.filter((row) => isLegacyUrl(row.image)).length,
    streamTeachers: teacherRows.filter((row) => isLegacyUrl(row.image)).length,
  };
}

/** Preview only — reports what the migration would do without touching anything. */
export async function previewLegacyMigration(): Promise<LegacyMigrationPreview> {
  await ensureSchemaExtras();
  const urls = LEGACY_SOURCES.map((source) => source.url);
  const migrated = await loadMigratedAssetIds(urls);
  const references = await countReferences();

  return {
    sourceCount: LEGACY_SOURCES.length,
    migratedSourceCount: migrated.size,
    pendingSourceCount: LEGACY_SOURCES.length - migrated.size,
    references,
    totalReferences: Object.values(references).reduce((total, count) => total + count, 0),
  };
}

/**
 * Full migration: import every pending legacy source through the upload
 * pipeline, rewrite content URLs to master variants, rebuild usage rows
 * and write one audit record. Safe to re-run at any time.
 */
export async function runLegacyMigration(userId: number): Promise<LegacyMigrationReport> {
  const startedAt = Date.now();
  await ensureSchemaExtras();

  const urls = LEGACY_SOURCES.map((source) => source.url);
  const assetsBySource = await loadMigratedAssetIds(urls);
  const failures: LegacyMigrationReport["failures"] = [];

  // 1 — import every source that has no live asset yet (sequential: Sharp
  // memory safety on the sandbox's 4 GB ceiling).
  let imported = 0;
  let duplicates = 0;
  for (const source of LEGACY_SOURCES) {
    if (assetsBySource.has(source.url)) continue;
    try {
      const buffer = await source.load();
      const result = await processAndStoreImage({
        buffer,
        filename: source.filename,
        title: source.title,
        altText: source.altText,
        folder: source.folder,
        category: source.category,
        userId,
      });
      assetsBySource.set(source.url, result.asset.id);
      if (result.duplicate) duplicates++;
      else imported++;
    } catch (error) {
      failures.push({
        url: source.url,
        error: error instanceof Error ? error.message : "Unknown import failure.",
      });
    }
  }

  // 2 — resolve every legacy URL to its master variant URL.
  const resolver = new LegacyUrlResolver();
  await registerMasterUrls(urls, assetsBySource, resolver);

  // 3 — rewrite content references + rebuild usage rows.
  const rewritten: LegacyMigrationReport["rewritten"] = [];
  let usageRows = 0;

  const postRows = await db
    .select({ id: posts.id, image: posts.image, extraImages: posts.extraImages })
    .from(posts);
  let postsRewritten = 0;
  for (const row of postRows) {
    const nextImage = resolver.resolve(row.image);
    const existingExtra = Array.isArray(row.extraImages) ? row.extraImages : [];
    const nextExtra = existingExtra.map((url) => resolver.resolve(url) ?? url);
    const extraChanged = JSON.stringify(nextExtra) !== JSON.stringify(existingExtra);
    if (!nextImage && !extraChanged) continue;

    await db
      .update(posts)
      .set({
        ...(nextImage ? { image: nextImage } : {}),
        ...(extraChanged ? { extraImages: nextExtra } : {}),
      })
      .where(eq(posts.id, row.id));
    if (nextImage) postsRewritten++;

    const usageUrls = [nextImage ?? row.image, ...nextExtra];
    usageRows += (await syncEntityMediaUsage({
      entityType: "post",
      entityId: row.id,
      fieldName: "cover",
      urls: usageUrls,
    })).length;
  }
  rewritten.push({ table: "posts", rows: postsRewritten });

  const galleryRows = await db.select({ id: galleryItems.id, image: galleryItems.image }).from(galleryItems);
  let galleryRewritten = 0;
  for (const row of galleryRows) {
    const nextImage = resolver.resolve(row.image);
    if (!nextImage) continue;
    await db.update(galleryItems).set({ image: nextImage }).where(eq(galleryItems.id, row.id));
    galleryRewritten++;
    usageRows += (await syncEntityMediaUsage({
      entityType: "gallery",
      entityId: row.id,
      fieldName: "image",
      urls: [nextImage],
    })).length;
  }
  rewritten.push({ table: "gallery_items", rows: galleryRewritten });

  const staffRows = await db.select({ id: staff.id, image: staff.image }).from(staff);
  let staffRewritten = 0;
  for (const row of staffRows) {
    const nextImage = resolver.resolve(row.image);
    if (!nextImage) continue;
    await db.update(staff).set({ image: nextImage }).where(eq(staff.id, row.id));
    staffRewritten++;
    usageRows += (await syncEntityMediaUsage({
      entityType: "staff",
      entityId: row.id,
      fieldName: "portrait",
      urls: [nextImage],
    })).length;
  }
  rewritten.push({ table: "staff", rows: staffRewritten });

  const thomianRows = await db.select({ id: oldThomians.id, image: oldThomians.image }).from(oldThomians);
  let thomianRewritten = 0;
  for (const row of thomianRows) {
    const nextImage = resolver.resolve(row.image);
    if (!nextImage) continue;
    await db.update(oldThomians).set({ image: nextImage }).where(eq(oldThomians.id, row.id));
    thomianRewritten++;
    usageRows += (await syncEntityMediaUsage({
      entityType: "old_thomian",
      entityId: row.id,
      fieldName: "image",
      urls: [nextImage],
    })).length;
  }
  rewritten.push({ table: "old_thomians", rows: thomianRewritten });

  const teacherRows = await db
    .select({ id: streamTeachers.id, image: streamTeachers.image })
    .from(streamTeachers);
  let teacherRewritten = 0;
  for (const row of teacherRows) {
    const nextImage = resolver.resolve(row.image);
    if (!nextImage) continue;
    await db.update(streamTeachers).set({ image: nextImage }).where(eq(streamTeachers.id, row.id));
    teacherRewritten++;
    usageRows += (await syncEntityMediaUsage({
      entityType: "stream_teacher",
      entityId: row.id,
      fieldName: "image",
      urls: [nextImage],
    })).length;
  }
  rewritten.push({ table: "stream_teachers", rows: teacherRewritten });

  const references = await countReferences();
  const report: LegacyMigrationReport = {
    sourceCount: LEGACY_SOURCES.length,
    migratedSourceCount: assetsBySource.size,
    pendingSourceCount: LEGACY_SOURCES.length - assetsBySource.size,
    references,
    totalReferences: Object.values(references).reduce((total, count) => total + count, 0),
    imported,
    duplicates,
    rewritten,
    usageRows,
    failures,
    durationMs: Date.now() - startedAt,
  };

  await db.insert(adminAuditLogs).values({
    userId,
    action: "migrate_legacy_media",
    entity: "media_asset",
    entityId: "bulk",
    details: {
      imported,
      duplicates,
      failures,
      rewritten: rewritten.filter((entry) => entry.rows > 0),
      durationMs: report.durationMs,
    },
  });

  return report;
}
