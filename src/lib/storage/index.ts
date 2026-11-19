/**
 * Provider-neutral media storage — factory + driver selection.
 *
 * Drivers (via `MEDIA_STORAGE_DRIVER`):
 * - "database" (DEFAULT) — object bytes live in the region database
 *   (`media_blobs`), served through `/api/media/file?key=…`. Survives sandbox
 *   restarts — the local filesystem driver lost every uploaded image on each
 *   reset while the DB rows survived (v2.8.41.0).
 * - "local" — filesystem under `.data/media`, served through
 *   `/api/media/file?key=…`; uploads use the multipart proxy endpoint.
 * - "minio" — S3-compatible MinIO (development), presigned PUT uploads.
 * - "r2" — Cloudflare R2 (production), presigned PUT uploads.
 *
 * NOTE: this module intentionally does NOT import "server-only": it is imported
 * directly by `scripts/verify-storage.ts`, which runs under Bun outside Next.js
 * (the `server-only` package throws when imported outside a React Server
 * bundler context). Callers inside Next should keep it server-side.
 */

import { assertSafeObjectKey, LocalMediaStorage, MEDIA_ROOT } from "./local";
import { DatabaseMediaStorage } from "./database";
import { createMinioStorage, createR2Storage, S3MediaStorage } from "./s3";
import type { MediaStorageDriver } from "./types";

export type {
  MediaStorage,
  MediaStorageDriver,
  PutObjectInput,
  SignedUpload,
} from "./types";
export { assertSafeObjectKey, LocalMediaStorage, MEDIA_ROOT } from "./local";
export { DatabaseMediaStorage } from "./database";
export { createMinioStorage, createR2Storage, S3MediaStorage } from "./s3";

/** Concrete storage instances returned by {@link getStorage}. */
export type MediaStorageInstance = LocalMediaStorage | DatabaseMediaStorage | S3MediaStorage;

const KNOWN_DRIVERS = new Set<string>(["database", "local", "minio", "r2"]);

let cached: { driver: MediaStorageDriver; storage: MediaStorageInstance } | null = null;

/** Resolve the configured driver; unknown values fall back to the default. */
export function getStorageDriver(): MediaStorageDriver {
  const raw = process.env.MEDIA_STORAGE_DRIVER?.trim().toLowerCase();
  // "database" is the default: the bytes live in the region DB next to the
  // media metadata, so images survive the sandbox's periodic resets.
  if (!raw) return "database";
  if (KNOWN_DRIVERS.has(raw)) return raw as MediaStorageDriver;
  console.warn(`[storage] Unknown MEDIA_STORAGE_DRIVER "${raw}" — falling back to "database".`);
  return "database";
}

function createStorage(driver: MediaStorageDriver): MediaStorageInstance {
  switch (driver) {
    case "database":
      return new DatabaseMediaStorage();
    case "local":
      return new LocalMediaStorage();
    case "minio":
      return createMinioStorage();
    case "r2":
      return createR2Storage();
  }
}

/**
 * Process-wide storage singleton for the configured driver. MinIO/R2
 * configuration is validated here, so a missing configuration throws the first
 * time storage is used rather than at import time.
 */
export function getStorage(): MediaStorageInstance {
  const driver = getStorageDriver();
  if (cached && cached.driver === driver) return cached.storage;
  const storage = createStorage(driver);
  cached = { driver, storage };
  return storage;
}

/** Drop the cached singleton (used by scripts/tests to re-read the environment). */
export function resetStorage(): void {
  cached = null;
}
