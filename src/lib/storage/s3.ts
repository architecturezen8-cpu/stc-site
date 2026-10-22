/**
 * S3-compatible media storage for Backblaze B2, MinIO (development) and
 * Cloudflare R2 (production). All three speak the S3 API and support
 * presigned PUT uploads, so the browser uploads directly to the provider
 * and then calls `/api/admin/media/finalize` to run the image pipeline.
 *
 * Backblaze B2 rides the R2_* env block (it is S3-compatible) — see
 * `.env.example` for the exact mapping and the R2_REGION requirement.
 *
 * Serving (v2.8.66.0): `getPublicUrl` returns the stable app path
 * (`/api/media/file?key=…`) for EVERY provider — the same contract as the
 * database/local drivers. The firewall route then 302s browsers to the
 * provider: the plain bucket URL on a public bucket, or a PRESIGNED GET URL
 * (default 6 days) when `R2_PRIVATE_BUCKET=1`. Backblaze only asks for a
 * credit card to create PUBLIC buckets, so the school can run a PRIVATE
 * bucket and still serve every site image with zero app-server bandwidth.
 *
 * Environment variables (see `.env.example` / DEPLOY-VERCEL.md):
 * - MinIO: MINIO_ENDPOINT, MINIO_REGION, MINIO_BUCKET, MINIO_ACCESS_KEY_ID,
 *   MINIO_SECRET_ACCESS_KEY
 * - R2/B2: R2_ACCOUNT_ID, R2_ENDPOINT, R2_REGION, R2_BUCKET,
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PRIVATE_BUCKET
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
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
  /** Private bucket → reads are served through presigned GET URLs. */
  privateBucket: boolean;
  forcePathStyle: boolean;
};

/** Presigned PUT lifetime bounds: 1 minute … 7 days (R2's maximum). */
const MIN_SIGNED_TTL_SECONDS = 60;
const MAX_SIGNED_TTL_SECONDS = 604_800;

/** Presigned GET lifetime for PRIVATE buckets: 6 days (SigV4 caps at 7). */
const SIGNED_READ_TTL_SECONDS = 518_400;

function readBoolEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

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
    privateBucket: readBoolEnv("MINIO_PRIVATE_BUCKET"),
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
    // R2 ignores the region and "auto" is canonical there. Backblaze B2 rides
    // this same config block and NEEDS the bucket's real region (e.g.
    // "us-west-004") for Signature V4 — set R2_REGION when using B2.
    region: process.env.R2_REGION?.trim() || "auto",
    bucket: readRequiredEnv("R2_BUCKET", "R2"),
    accessKeyId: readRequiredEnv("R2_ACCESS_KEY_ID", "R2"),
    secretAccessKey: readRequiredEnv("R2_SECRET_ACCESS_KEY", "R2"),
    // Backblaze B2 private buckets need no credit card — with this flag the
    // media firewall 302s to presigned GET URLs instead of plain bucket URLs.
    privateBucket: readBoolEnv("R2_PRIVATE_BUCKET"),
    // The R2 API endpoint is path-style.
    forcePathStyle: true,
  };
}

export class S3MediaStorage implements MediaStorage {
  readonly driver: Extract<MediaStorageDriver, "minio" | "r2">;
  /** True when the bucket is private → reads go through presigned GET URLs. */
  readonly privateBucket: boolean;

  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(config: S3ProviderConfig) {
    this.driver = config.driver;
    this.bucket = config.bucket;
    this.endpoint = config.endpoint;
    this.privateBucket = config.privateBucket;
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

  /**
   * Stable, non-expiring URL — the same app path the database and local
   * drivers return. Persisting provider URLs would hard-wire CMS content to
   * one provider and 401 on PRIVATE buckets, so every provider serves
   * through the `/api/media/file` firewall, which 302s to the provider
   * (plain or presigned per bucket mode) — see {@link getProviderUrl}.
   */
  getPublicUrl(key: string): string {
    return `/api/media/file?key=${encodeURIComponent(assertSafeObjectKey(key))}`;
  }

  /**
   * Plain bucket URL for PUBLIC buckets — the firewall redirect target.
   * Never store this: only good until the bucket mode or provider changes.
   */
  getProviderUrl(key: string): string {
    const encoded = assertSafeObjectKey(key)
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `${this.endpoint}/${this.bucket}/${encoded}`;
  }

  /**
   * Presigned GET URL for PRIVATE buckets — the firewall redirect target.
   * Pure local HMAC signing (the SDK makes no network call), so minting one
   * per redirect costs nothing and keeps app-server bandwidth at ~zero.
   */
  async getSignedReadUrl(
    key: string,
    expiresInSeconds = SIGNED_READ_TTL_SECONDS,
  ): Promise<string> {
    const safeKey = assertSafeObjectKey(key);
    const ttl = Math.min(
      Math.max(Math.floor(expiresInSeconds) || SIGNED_READ_TTL_SECONDS, MIN_SIGNED_TTL_SECONDS),
      MAX_SIGNED_TTL_SECONDS,
    );
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: safeKey }),
      { expiresIn: ttl },
    );
  }
}

export function createMinioStorage(): S3MediaStorage {
  return new S3MediaStorage(minioConfigFromEnv());
}

export function createR2Storage(): S3MediaStorage {
  return new S3MediaStorage(r2ConfigFromEnv());
}
