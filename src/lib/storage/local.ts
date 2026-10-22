/**
 * Local filesystem media storage (the default driver).
 *
 * Objects live under `.data/media/<key>` and are served through
 * `/api/media/file?key=…` (see `src/app/api/media/file/route.ts`).
 * Uploads do NOT use presigned URLs — the admin UI posts multipart form data
 * to the proxy endpoint, which calls `processAndStoreImage`.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MediaStorage, PutObjectInput } from "./types";

/** Absolute root directory for locally stored media. */
export const MEDIA_ROOT = path.join(process.cwd(), ".data", "media");

/**
 * Object keys are slash-separated relative paths under MEDIA_ROOT. Each
 * segment must start with an ASCII letter or digit and may only contain
 * `[A-Za-z0-9._-]` afterwards — this rejects empty/hidden/traversal segments,
 * whitespace, separators (backslash, NUL) and any non-allowlisted characters.
 */
const KEY_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_KEY_LENGTH = 512;

export class UnsafeObjectKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`Unsafe media object key ${JSON.stringify(key)}: ${reason}.`);
    this.name = "UnsafeObjectKeyError";
  }
}

/**
 * Validates an object key and returns it unchanged when safe; otherwise throws
 * `UnsafeObjectKeyError`. Used both internally (every storage call) and by
 * `/api/media/file` before any filesystem access, so path traversal can never
 * escape MEDIA_ROOT.
 */
export function assertSafeObjectKey(key: string): string {
  if (typeof key !== "string" || key.length === 0) {
    throw new UnsafeObjectKeyError(String(key), "the key must be a non-empty string");
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new UnsafeObjectKeyError(key, `keys are limited to ${MAX_KEY_LENGTH} characters`);
  }
  if (key.includes("\0")) {
    throw new UnsafeObjectKeyError(key, "NUL bytes are not allowed");
  }
  if (key.includes("\\")) {
    throw new UnsafeObjectKeyError(key, "backslash separators are not allowed");
  }

  for (const segment of key.split("/")) {
    if (segment.startsWith(".")) {
      throw new UnsafeObjectKeyError(key, "hidden and traversal segments are not allowed");
    }
    if (!KEY_SEGMENT_PATTERN.test(segment)) {
      throw new UnsafeObjectKeyError(
        key,
        "segments may only contain A-Z, a-z, 0-9, dot, dash and underscore",
      );
    }
  }

  // Defence in depth: even with the allowlist above, confirm the resolved path
  // stays inside the media root.
  const resolved = path.resolve(MEDIA_ROOT, key);
  if (resolved !== MEDIA_ROOT && !resolved.startsWith(`${MEDIA_ROOT}${path.sep}`)) {
    throw new UnsafeObjectKeyError(key, "the key resolves outside the media root");
  }

  return key;
}

export class LocalMediaStorage implements MediaStorage {
  readonly driver = "local" as const;

  private resolveObjectPath(key: string): string {
    return path.join(MEDIA_ROOT, assertSafeObjectKey(key));
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const target = this.resolveObjectPath(input.key);
    await mkdir(path.dirname(target), { recursive: true });
    // Write to a temporary file in the same directory, then rename — atomic on
    // the same filesystem, so readers never observe a partially written object.
    const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, input.body);
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    // readFile rejects with ENOENT when the object does not exist.
    return readFile(this.resolveObjectPath(key));
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveObjectPath(key), { force: true });
  }

  getPublicUrl(key: string): string {
    return `/api/media/file?key=${encodeURIComponent(assertSafeObjectKey(key))}`;
  }
}
