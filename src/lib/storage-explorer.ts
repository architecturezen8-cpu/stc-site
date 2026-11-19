/**
 * v2.8.85.0 — the B2 Storage Explorer: folder-by-folder browsing of the media
 * bucket plus the per-prefix usage strip, next to the whole-bucket tracker in
 * `bucket-usage.ts` (which is left untouched — this module borrows its shape:
 * `{ ok, error }` degradation, in-memory caches, ?force refreshes).
 *
 * - `explorePrefix(prefix)` — ONE S3 ListObjectsV2 call with Delimiter="/"
 *   against the SAME bucket the uploads use: CommonPrefixes become folders,
 *   Contents become the files directly inside the prefix. 3-minute cache per
 *   prefix; IsTruncated is reported instead of silently paginating.
 * - `prefixStats()` — walks every ACTUAL top-level prefix (discovered from a
 *   delimited root listing, never a hardcoded guess) without a delimiter and
 *   sums the sizes, so the stats strip reflects reality. 15-minute cache.
 * - `deleteStorageObject(key)` — the one mutation the explorer offers, routed
 *   through the provider-neutral `getStorage()` (idempotent per the
 *   MediaStorage contract) with the project's strict key validation.
 *
 * Driver note: listing needs a real S3 endpoint, so "database"/"local" drivers
 * (the sandbox default) degrade to `{ ok: false, error }` — the UI shows a
 * friendly notice instead of crashing. Download/delete still work for those
 * drivers because `getStorage()` serves them.
 */

import "server-only";

import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { getMediaBucketUsage } from "@/lib/bucket-usage";
import { getStorage, getStorageDriver } from "@/lib/storage";
import { assertSafeObjectKey } from "@/lib/storage/local";

/* ── public shapes ─────────────────────────────────────────────────────── */

export type StorageExplorerFolder = {
  /** Last path segment, for display ("lms-work"). */
  name: string;
  /** Full prefix including the trailing slash, for descending. */
  prefix: string;
};

export type StorageExplorerFile = {
  key: string;
  size: number;
  lastModified: string;
};

export type StorageExplorerOk = {
  ok: true;
  provider: "r2" | "minio";
  bucket: string;
  /** Normalized prefix with a trailing slash ("" = bucket root). */
  prefix: string;
  folders: StorageExplorerFolder[];
  files: StorageExplorerFile[];
  /** True when the listing hit the 1000-key page limit — descend to see more. */
  truncated: boolean;
  cachedAt: string;
  cached: boolean;
};

export type StorageExplorerResult = StorageExplorerOk | { ok: false; error: string };

export type StoragePrefixStat = {
  prefix: string;
  name: string;
  bytes: number;
  files: number;
};

export type StoragePrefixStatsOk = {
  ok: true;
  provider: "r2" | "minio";
  bucket: string;
  /** Every top-level prefix that exists, biggest first. */
  prefixes: StoragePrefixStat[];
  totalBytes: number;
  totalFiles: number;
  /** Whole-bucket truth via the shared tracker; null when it is unavailable. */
  bucketBytes: number | null;
  bucketFiles: number | null;
  cachedAt: string;
  cached: boolean;
};

export type StoragePrefixStatsResult = StoragePrefixStatsOk | { ok: false; error: string };

/* ── caches (per-process, same spirit as bucket-usage) ─────────────────── */

const EXPLORE_TTL_MS = 3 * 60 * 1000;
const STATS_TTL_MS = 15 * 60 * 1000;
const EXPLORE_CACHE_MAX = 80;

const exploreCache = new Map<string, { payload: StorageExplorerOk; expires: number }>();
let statsCache: { payload: StoragePrefixStatsOk; expires: number } | null = null;

/** Drop cached listings/stats (called after a delete so the UI stays truthful). */
export function invalidateStorageExplorerCache(key?: string): void {
  statsCache = null;
  if (key == null) {
    exploreCache.clear();
    return;
  }
  const dir = key.includes("/") ? key.slice(0, key.lastIndexOf("/") + 1) : "";
  exploreCache.delete(dir);
  // A root-level file changes the root listing too.
  exploreCache.delete("");
}

/* ── S3 client (own instance — s3.ts stays untouched) ──────────────────── */

type ExplorerS3 = { client: S3Client; bucket: string; provider: "r2" | "minio" };

let explorerS3: ExplorerS3 | null = null;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function readRequiredEnv(name: string, provider: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${provider} storage is not configured — set ${name} (and the other ${provider}_* variables) before using the Storage Explorer.`,
    );
  }
  return value;
}

/**
 * Builds an S3 client from the SAME env vars `src/lib/storage/s3.ts` reads
 * (R2_* in production — which point at Backblaze B2's S3 endpoint — and
 * MINIO_* in development). Kept here so neither storage/s3.ts nor
 * bucket-usage.ts had to change.
 */
function getExplorerS3(): ExplorerS3 {
  if (explorerS3) return explorerS3;
  const driver = getStorageDriver();
  if (driver !== "r2" && driver !== "minio") {
    throw new Error("The Storage Explorer needs the r2 or minio driver.");
  }
  if (driver === "r2") {
    const endpoint = process.env.R2_ENDPOINT?.trim() || "";
    const accountId = process.env.R2_ACCOUNT_ID?.trim() || "";
    if (!endpoint && !accountId) {
      throw new Error(
        "R2 storage is not configured — set R2_ENDPOINT (or R2_ACCOUNT_ID) and the other R2_* variables before using the Storage Explorer.",
      );
    }
    explorerS3 = {
      provider: "r2",
      bucket: readRequiredEnv("R2_BUCKET", "R2"),
      client: new S3Client({
        // B2's S3 endpoint (and R2's) is path-style; region is ignored/"auto".
        region: "auto",
        endpoint: trimTrailingSlashes(endpoint || `https://${accountId}.r2.cloudflarestorage.com`),
        credentials: {
          accessKeyId: readRequiredEnv("R2_ACCESS_KEY_ID", "R2"),
          secretAccessKey: readRequiredEnv("R2_SECRET_ACCESS_KEY", "R2"),
        },
        forcePathStyle: true,
      }),
    };
    return explorerS3;
  }
  explorerS3 = {
    provider: "minio",
    bucket: readRequiredEnv("MINIO_BUCKET", "MinIO"),
    client: new S3Client({
      region: process.env.MINIO_REGION?.trim() || "us-east-1",
      endpoint: trimTrailingSlashes(readRequiredEnv("MINIO_ENDPOINT", "MinIO")),
      credentials: {
        accessKeyId: readRequiredEnv("MINIO_ACCESS_KEY_ID", "MinIO"),
        secretAccessKey: readRequiredEnv("MINIO_SECRET_ACCESS_KEY", "MinIO"),
      },
      forcePathStyle: true,
    }),
  };
  return explorerS3;
}

/* ── prefix sanitisation ───────────────────────────────────────────────── */

/**
 * Normalizes a user-supplied prefix to "folder/sub/" form ("" = root).
 * Returns null for anything unsafe — ".." anywhere, leading "/", NUL,
 * backslashes, control characters, dot-leading segments, or absurd length.
 */
export function sanitizeExplorerPrefix(raw: string | null | undefined): string | null {
  if (raw == null) return "";
  if (typeof raw !== "string") return null;
  let prefix = raw.trim();
  if (prefix === "" || prefix === "/") return "";
  if (prefix.length > 512) return null;
  if (prefix.includes("..") || prefix.includes("\\") || prefix.includes("\0")) return null;
  if (prefix.startsWith("/")) return null;
  // Deliberate regex: reject control characters in prefixes.
  if (/[\u0000-\u001f\u007f]/.test(prefix)) return null;
  prefix = prefix.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (prefix === "") return "";
  for (const segment of prefix.split("/")) {
    if (segment === "" || segment.startsWith(".")) return null;
  }
  return `${prefix}/`;
}

/* ── listing ───────────────────────────────────────────────────────────── */

export async function explorePrefix(
  prefix: string,
  opts?: { force?: boolean },
): Promise<StorageExplorerResult> {
  const driver = getStorageDriver();
  if (driver !== "r2" && driver !== "minio") {
    return {
      ok: false,
      error:
        "Bucket browsing needs the r2 or minio driver — MEDIA_STORAGE_DRIVER is currently set to store media elsewhere, so there is no bucket to explore in this environment.",
    };
  }

  const safePrefix = sanitizeExplorerPrefix(prefix);
  if (safePrefix === null) {
    return { ok: false, error: "Unsafe prefix — it cannot be browsed." };
  }

  if (!opts?.force) {
    const hit = exploreCache.get(safePrefix);
    if (hit && hit.expires > Date.now()) {
      return { ...hit.payload, cached: true };
    }
  }

  try {
    const s3 = getExplorerS3();
    const page = await s3.client.send(
      new ListObjectsV2Command({
        Bucket: s3.bucket,
        ...(safePrefix ? { Prefix: safePrefix } : {}),
        Delimiter: "/",
        MaxKeys: 1000,
      }),
    );

    const folders: StorageExplorerFolder[] = (page.CommonPrefixes ?? [])
      .filter((cp): cp is { Prefix: string } => typeof cp.Prefix === "string" && cp.Prefix !== "")
      .map((cp) => ({
        name: cp.Prefix.slice(safePrefix.length).replace(/\/+$/, "") || cp.Prefix,
        prefix: cp.Prefix,
      }));

    // Zero-byte folder-marker objects (key ends with the delimiter, or equals
    // the current prefix) are navigation, not files.
    const files: StorageExplorerFile[] = (page.Contents ?? [])
      .filter(
        (object): object is { Key: string; Size?: number; LastModified?: Date } =>
          typeof object.Key === "string" && object.Key !== "" &&
          !object.Key.endsWith("/") && object.Key !== safePrefix,
      )
      .map((object) => ({
        key: object.Key,
        size: object.Size ?? 0,
        lastModified: (object.LastModified ?? new Date(0)).toISOString(),
      }));

    const payload: StorageExplorerOk = {
      ok: true,
      provider: s3.provider,
      bucket: s3.bucket,
      prefix: safePrefix,
      folders,
      files,
      truncated: page.IsTruncated === true,
      cachedAt: new Date().toISOString(),
      cached: false,
    };
    exploreCache.set(safePrefix, { payload, expires: Date.now() + EXPLORE_TTL_MS });
    if (exploreCache.size > EXPLORE_CACHE_MAX) {
      const oldest = exploreCache.keys().next().value;
      if (oldest !== undefined) exploreCache.delete(oldest);
    }
    return payload;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not list the bucket.",
    };
  }
}

/* ── per-prefix usage stats ────────────────────────────────────────────── */

/**
 * Per-top-level-prefix byte/file totals for the stats strip. The prefix list
 * is discovered from a delimited root listing (so it always matches reality),
 * then each prefix is walked WITHOUT a delimiter (every descendant object
 * counts toward it, like the whole-bucket walk does). 15-minute cache.
 */
export async function prefixStats(
  opts?: { force?: boolean; prefixes?: string[] },
): Promise<StoragePrefixStatsResult> {
  const driver = getStorageDriver();
  if (driver !== "r2" && driver !== "minio") {
    return {
      ok: false,
      error:
        "Prefix stats need the r2 or minio driver — MEDIA_STORAGE_DRIVER is currently set to store media elsewhere.",
    };
  }

  if (!opts?.force && statsCache && statsCache.expires > Date.now()) {
    return { ...statsCache.payload, cached: true };
  }

  try {
    const s3 = getExplorerS3();

    let discovered = opts?.prefixes;
    if (!discovered || discovered.length === 0) {
      const root = await explorePrefix("", opts?.force ? { force: true } : undefined);
      if (!root.ok) return { ok: false, error: root.error };
      discovered = root.folders.map((f) => f.prefix);
    }

    const prefixes = discovered
      .map((p) => sanitizeExplorerPrefix(p))
      .filter((p): p is string => p !== null);

    const stats: StoragePrefixStat[] = [];
    for (const prefix of prefixes) {
      let bytes = 0;
      let files = 0;
      let token: string | undefined;
      let pages = 0;
      do {
        const page = await s3.client.send(
          new ListObjectsV2Command({
            Bucket: s3.bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ...(token ? { ContinuationToken: token } : {}),
          }),
        );
        for (const object of page.Contents ?? []) {
          bytes += object.Size ?? 0;
          files += 1;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        pages += 1;
        // Runaway guard: 200 pages = 200k objects per prefix, far beyond a
        // school bucket — mirrors the "a full walk is cheap" assumption.
      } while (token && pages < 200);
      stats.push({
        prefix,
        name: prefix.replace(/\/+$/, "").split("/").pop() || prefix,
        bytes,
        files,
      });
    }
    stats.sort((a, b) => b.bytes - a.bytes);

    const usage = await getMediaBucketUsage(opts?.force === true);

    const payload: StoragePrefixStatsOk = {
      ok: true,
      provider: s3.provider,
      bucket: s3.bucket,
      prefixes: stats,
      totalBytes: stats.reduce((sum, s) => sum + s.bytes, 0),
      totalFiles: stats.reduce((sum, s) => sum + s.files, 0),
      bucketBytes: usage.ok ? usage.bytes : null,
      bucketFiles: usage.ok ? usage.files : null,
      cachedAt: new Date().toISOString(),
      cached: false,
    };
    statsCache = { payload, expires: Date.now() + STATS_TTL_MS };
    return payload;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not measure the prefixes.",
    };
  }
}

/* ── the one mutation ──────────────────────────────────────────────────── */

/**
 * Deletes ONE object through the provider-neutral storage (idempotent per the
 * MediaStorage contract — deleting a missing object must not throw) after the
 * project's strict key validation, then drops the affected caches.
 */
export async function deleteStorageObject(key: string): Promise<void> {
  const safeKey = assertSafeObjectKey(key);
  await getStorage().deleteObject(safeKey);
  invalidateStorageExplorerCache(safeKey);
}
