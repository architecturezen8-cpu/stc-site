/**
 * Database media storage (v2.8.41.0) — the DEFAULT driver.
 *
 * WHY: the sandbox wipes `.data/media` on every restart while the region
 * database (Supabase) survives — so every previously-uploaded image 404'd
 * ("images apply wenne na"). This driver stores the object bytes IN the
 * database itself (`media_blobs`), right next to their metadata rows, so
 * media survives restarts, rollbacks and redeploys exactly like every other
 * table. Objects are served back through `/api/media/file?key=…`, the same
 * URL shape the local driver always produced — existing stored URLs keep
 * working unchanged.
 *
 * Writes go through the multipart proxy endpoint (no presigned uploads —
 * the school's images are processed server-side by sharp anyway).
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { mediaBlobs } from "@/db/schema";
import { assertSafeObjectKey } from "./local";
import type { MediaStorage, PutObjectInput } from "./types";

/** Postgres TOAST handles large binaries; hard cap keeps uploads sane. */
const MAX_OBJECT_BYTES = 24 * 1024 * 1024;

export class DatabaseMediaStorage implements MediaStorage {
  readonly driver = "database" as const;

  async putObject(input: PutObjectInput): Promise<void> {
    const key = assertSafeObjectKey(input.key);
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
    if (body.length > MAX_OBJECT_BYTES) {
      throw new Error(`Object ${key} is too large for database storage (${body.length} bytes).`);
    }
    await db
      .insert(mediaBlobs)
      .values({
        key,
        bytes: body,
        contentType: input.contentType || "application/octet-stream",
        byteSize: body.length,
      })
      .onConflictDoUpdate({
        target: mediaBlobs.key,
        set: {
          bytes: body,
          contentType: input.contentType || "application/octet-stream",
          byteSize: body.length,
        },
      });
  }

  async getObject(key: string): Promise<Buffer> {
    const safeKey = assertSafeObjectKey(key);
    const [row] = await db
      .select({ bytes: mediaBlobs.bytes })
      .from(mediaBlobs)
      .where(eq(mediaBlobs.key, safeKey))
      .limit(1);
    if (!row) {
      throw new Error(`Object ${safeKey} not found in database storage.`);
    }
    return Buffer.from(row.bytes);
  }

  async deleteObject(key: string): Promise<void> {
    const safeKey = assertSafeObjectKey(key);
    await db.delete(mediaBlobs).where(eq(mediaBlobs.key, safeKey));
  }

  /** Bulk helper for migrations/repair jobs. */
  async deleteObjects(keys: string[]): Promise<void> {
    const safe = keys
      .map((k) => {
        try {
          return assertSafeObjectKey(k);
        } catch {
          return null;
        }
      })
      .filter((k): k is string => Boolean(k));
    if (!safe.length) return;
    await db.delete(mediaBlobs).where(inArray(mediaBlobs.key, safe));
  }

  getPublicUrl(key: string): string {
    return `/api/media/file?key=${encodeURIComponent(assertSafeObjectKey(key))}`;
  }
}
