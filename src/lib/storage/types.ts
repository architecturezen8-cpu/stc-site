/**
 * Provider-neutral media storage contract.
 *
 * Consumers (source of truth for this shape):
 * - `src/lib/media-processing.ts`  — putObject / getPublicUrl / driver
 * - `src/app/api/admin/media/presign`  — createSignedUpload (optional capability)
 * - `src/app/api/admin/media/finalize` — getObject / deleteObject
 * - `src/app/api/media/file`  — getObject (local driver only)
 * - `scripts/verify-storage.ts`  — the executable contract check
 */

export type MediaStorageDriver = "database" | "local" | "minio" | "r2";

export type PutObjectInput = {
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
  cacheControl?: string;
};

/** Response consumed by the admin upload UI (`prepare.url`, `prepare.headers`, `prepare.key`). */
export type SignedUpload = {
  key: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export interface MediaStorage {
  /** Which backend backs this instance (persisted on media_assets.provider). */
  readonly driver: MediaStorageDriver;
  /** Store an object. Writes must be atomic — readers never see partial files. */
  putObject(input: PutObjectInput): Promise<void>;
  /** Read an object as a Buffer. Must throw when the object does not exist. */
  getObject(key: string): Promise<Buffer>;
  /** Remove an object. Idempotent — deleting a missing object must not throw. */
  deleteObject(key: string): Promise<void>;
  /** Stable, non-expiring URL for an object. */
  getPublicUrl(key: string): string;
  /**
   * Present only on providers that support direct (presigned PUT) uploads —
   * `src/app/api/admin/media/presign` duck-types this capability with `in`.
   * Local storage intentionally does not implement it (multipart proxy mode).
   */
  createSignedUpload?(
    key: string,
    contentType: string,
    expiresInSeconds?: number,
  ): Promise<SignedUpload>;
}
