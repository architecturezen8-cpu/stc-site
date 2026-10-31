/**
 * v2.8.69.0 — the Backblaze B2 bucket tracker for the main Admin Studio's
 * Storage page ("kochchara fill welada thiyenne" — how full the media bucket
 * really is). Walks the bucket via S3 ListObjectsV2 through the SAME
 * R2_* credentials the uploads use, so the number includes every object —
 * originals, variants and any orphan the database never recorded.
 *
 * The walk is cached for 15 minutes (the bucket changes slowly and a school
 * bucket fits in a handful of pages); ?force refreshes on demand.
 */

import {
  createMinioStorage,
  createR2Storage,
  getStorageDriver,
  S3MediaStorage,
} from "@/lib/storage";

export type BucketUsageOk = {
  ok: true;
  provider: "r2" | "minio";
  bucket: string;
  bytes: number;
  files: number;
  /** Soft reference line for the fill bar — env MEDIA_BUCKET_SOFT_QUOTA_GB, default 10 GB. */
  softQuotaBytes: number | null;
  cachedAt: string;
  cached: boolean;
};

export type BucketUsageResult = BucketUsageOk | { ok: false; error: string };

const CACHE_TTL_MS = 15 * 60 * 1000;

let clientByDriver: Partial<Record<"r2" | "minio", S3MediaStorage>> = {};
let cache: { payload: BucketUsageOk; expires: number } | null = null;

function softQuotaBytes(): number | null {
  const raw = Number(process.env.MEDIA_BUCKET_SOFT_QUOTA_GB ?? "");
  if (!Number.isFinite(raw) || raw <= 0) {
    /* B2's free tier is the practical reference when nothing is configured. */
    return 10 * 1024 * 1024 * 1024;
  }
  return raw * 1024 * 1024 * 1024;
}

export async function getMediaBucketUsage(force = false): Promise<BucketUsageResult> {
  const driver = getStorageDriver();
  if (driver !== "r2" && driver !== "minio") {
    return {
      ok: false,
      error:
        "Bucket tracking is available when MEDIA_STORAGE_DRIVER is r2 or minio — the current driver stores media elsewhere.",
    };
  }

  if (!force && cache && cache.expires > Date.now()) {
    return { ...cache.payload, cached: true };
  }

  let client = clientByDriver[driver];
  if (!client) {
    client = driver === "r2" ? createR2Storage() : createMinioStorage();
    clientByDriver = { [driver]: client };
  }

  try {
    const { bytes, files } = await client.getBucketUsage();
    const payload: BucketUsageOk = {
      ok: true,
      provider: driver,
      bucket: client.bucketName,
      bytes,
      files,
      softQuotaBytes: softQuotaBytes(),
      cachedAt: new Date().toISOString(),
      cached: false,
    };
    cache = { payload, expires: Date.now() + CACHE_TTL_MS };
    return payload;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read the bucket usage.",
    };
  }
}
