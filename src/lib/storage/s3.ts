/**
 * S3-compatible media storage for MinIO (development) and Cloudflare R2
 * (production). Both providers speak the S3 API and support presigned PUT
 * uploads, so the browser uploads directly to the provider and then calls
 * `/api/admin/media/finalize` to run the image pipeline.
 *
 * Environment variables (see `.env.example` / README-NEW.md):
 * - MinIO: MINIO_ENDPOINT, MINIO_REGION, MINIO_BUCKET, MINIO_ACCESS_KEY_ID,
 *   MINIO_SECRET_ACCESS_KEY, MINIO_PUBLIC_BASE_URL
 * - R2:    R2_ACCOUNT_ID, R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID,
 *   R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { assertSafeObjectKey } from "./local";
import type { MediaStorage, MediaStorageDriver, PutObjectInput, SignedUpload } from "./types";

type S3ProviderConfig = {
  driver: Extract<MediaStorageDriver, "minio" | "r2">;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public CDN/bucket base URL; falls back to the endpoint when unset. */
  publicBaseUrl: string | null;
  forcePathStyle: boolean;
};

/** Presigned PUT lifetime bounds: 1 minute … 7 days (R2's maximum). */
const MIN_SIGNED_TTL_SECONDS = 60;
const MAX_SIGNED_TTL_SECONDS = 604_800;

/**
 * In-memory CORS preflight verdicts, keyed `${bucket}|${origin}`.
 * v2.8.66.7 — presign probes the provider bucket once per origin and serves
 * the verdict for 10 minutes, so a missing bucket CORS rule costs ONE probe
 * per deployment instead of one failed browser PUT per upload.
 */
const PREFLIGHT_PROBE_TTL_MS = 10 * 60 * 1000;
const preflightProbeCache = new Map<string, { ok: boolean; expires: number }>();

function readRequiredEnv(name: string, provider: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${provider} storage is not configured — set ${name} (and the other ${provider}_* variables) before switching MEDIA_STORAGE_DRIVER.`,
    );
  }
  return value;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export function minioConfigFromEnv(): S3ProviderConfig {
  return {
    driver: "minio",
    endpoint: trimTrailingSlashes(readRequiredEnv("MINIO_ENDPOINT", "MinIO")),
    region: process.env.MINIO_REGION?.trim() || "us-east-1",
    bucket: readRequiredEnv("MINIO_BUCKET", "MinIO"),
    accessKeyId: readRequiredEnv("MINIO_ACCESS_KEY_ID", "MinIO"),
    secretAccessKey: readRequiredEnv("MINIO_SECRET_ACCESS_KEY", "MinIO"),
    publicBaseUrl: process.env.MINIO_PUBLIC_BASE_URL?.trim()
      ? trimTrailingSlashes(process.env.MINIO_PUBLIC_BASE_URL.trim())
      : null,
    // MinIO serves buckets under path-style URLs only.
    forcePathStyle: true,
  };
}

export function r2ConfigFromEnv(): S3ProviderConfig {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() || "";
  const endpoint = process.env.R2_ENDPOINT?.trim() || "";
  if (!endpoint && !accountId) {
    throw new Error(
      "R2 storage is not configured — set R2_ENDPOINT (or R2_ACCOUNT_ID) and the other R2_* variables before switching MEDIA_STORAGE_DRIVER.",
    );
  }
  return {
    driver: "r2",
    endpoint: trimTrailingSlashes(endpoint || `https://${accountId}.r2.cloudflarestorage.com`),
    // R2 ignores the region but the S3 client requires one; "auto" is canonical.
    region: "auto",
    bucket: readRequiredEnv("R2_BUCKET", "R2"),
    accessKeyId: readRequiredEnv("R2_ACCESS_KEY_ID", "R2"),
    secretAccessKey: readRequiredEnv("R2_SECRET_ACCESS_KEY", "R2"),
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL?.trim()
      ? trimTrailingSlashes(process.env.R2_PUBLIC_BASE_URL.trim())
      : null,
    // The R2 API endpoint is path-style.
    forcePathStyle: true,
  };
}

export class S3MediaStorage implements MediaStorage {
  readonly driver: Extract<MediaStorageDriver, "minio" | "r2">;

  /** Public read for the v2.8.69.0 bucket-usage tracker. */
  get bucketName(): string {
    return this.bucket;
  }

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly publicBaseUrl: string | null;

  constructor(config: S3ProviderConfig) {
    this.driver = config.driver;
    this.bucket = config.bucket;
    this.endpoint = config.endpoint;
    this.publicBaseUrl = config.publicBaseUrl;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
    });
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeObjectKey(input.key),
        Body: input.body,
        ...(input.contentType ? { ContentType: input.contentType } : {}),
        ...(input.cacheControl ? { CacheControl: input.cacheControl } : {}),
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeObjectKey(key),
      }),
    );
    if (!response.Body) {
      throw new Error(`Object ${assertSafeObjectKey(key)} returned an empty body.`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: assertSafeObjectKey(key),
      }),
    );
  }

  /**
   * v2.8.69.0 — how full is the provider bucket REALLY? Pages through
   * ListObjectsV2 (1000 keys per call) and sums every object's Size — the
   * truthful answer including orphans the DB never recorded. Callers cache;
   * a school bucket is small so a full walk is cheap.
   */
  async getBucketUsage(): Promise<{ bytes: number; files: number }> {
    let bytes = 0;
    let files = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          MaxKeys: 1000,
          ...(token ? { ContinuationToken: token } : {}),
        }),
      );
      for (const object of page.Contents ?? []) {
        bytes += object.Size ?? 0;
        files += 1;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return { bytes, files };
  }

  /**
   * v2.8.66.7 — can THIS browser origin upload directly (presigned PUT)?
   *
   * Direct browser uploads need a bucket CORS rule answering the preflight;
   * B2 buckets ship with none, so the browser PUT used to die with a noisy
   * CORS error before the client-side fallback engaged. Presign now asks this
   * method first (one cached OPTIONS probe per bucket+origin) and routes the
   * upload through the server proxy when the rule is missing — silent for the
   * user, and self-healing: once the CORS rule is added the probe passes and
   * direct uploads (incl. >4.5 MB files) resume automatically.
   */
  async probeDirectUpload(origin: string): Promise<boolean> {
    const cacheKey = `${this.bucket}|${origin}`;
    const hit = preflightProbeCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.ok;

    let ok = false;
    try {
      const response = await fetch(`${this.endpoint}/${this.bucket}/cors-probe`, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          // The client sets Content-Type; AWS SDK v3 may add checksum headers
          // to the signed request, so mirror the rule a fixed bucket would use.
          "Access-Control-Request-Headers": "content-type,x-amz-checksum-crc32,x-amz-sdk-checksum-algorithm",
        },
        signal: AbortSignal.timeout(5_000),
      });
      ok = response.headers.has("access-control-allow-origin");
    } catch {
      // Provider unreachable or probe blocked — prefer the always-works proxy.
      ok = false;
    }
    preflightProbeCache.set(cacheKey, { ok, expires: Date.now() + PREFLIGHT_PROBE_TTL_MS });
    return ok;
  }

  async createSignedUpload(
    key: string,
    contentType: string,
    expiresInSeconds = 600,
  ): Promise<SignedUpload> {
    const safeKey = assertSafeObjectKey(key);
    const ttl = Math.min(
      Math.max(Math.floor(expiresInSeconds) || MIN_SIGNED_TTL_SECONDS, MIN_SIGNED_TTL_SECONDS),
      MAX_SIGNED_TTL_SECONDS,
    );
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
        ContentType: contentType,
      }),
      { expiresIn: ttl },
    );
    return {
      key: safeKey,
      url,
      method: "PUT",
      // Must match the signed command exactly — the browser sets this header.
      headers: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  getPublicUrl(key: string): string {
    const safeKey = assertSafeObjectKey(key);
    if (this.publicBaseUrl) {
      const encoded = safeKey.split("/").map(encodeURIComponent).join("/");
      return `${this.publicBaseUrl}/${encoded}`;
    }
    // No public base URL configured ⇒ the bucket is private (stc-media on B2
    // is allPrivate). A raw endpoint/bucket/key URL can never serve without
    // credentials, so store the proxy path instead — /api/media/file streams
    // the object (and falls back to legacy media_blobs) server-side.
    return `/api/media/file?key=${encodeURIComponent(safeKey)}`;
  }
}

export function createMinioStorage(): S3MediaStorage {
  return new S3MediaStorage(minioConfigFromEnv());
}

export function createR2Storage(): S3MediaStorage {
  return new S3MediaStorage(r2ConfigFromEnv());
}
