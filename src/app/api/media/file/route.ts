import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaBlobs } from "@/db/schema";
import {
  getStorage,
  getStorageDriver,
  getPrivateStorage,
  isPrivateKey,
  S3MediaStorage,
} from "@/lib/storage";
import { assertSafeObjectKey } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  webp: "image/webp",
  avif: "image/avif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function serveBuffer(buffer: Buffer, key: string): Response {
  const extension = key.split(".").pop()?.toLowerCase() || "";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME[extension] || "application/octet-stream",
      "Content-Length": String(buffer.length),
      "Cache-Control": IMMUTABLE_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Serves public media objects.
 *
 * - "local"/"database" drivers: bytes stream from the configured storage
 *   (DB row or .data/media), exactly as before.
 * - S3 drivers (Backblaze B2 / R2 / MinIO, v2.8.65.0): objects the backfill
 *   has verified on the provider (`s3_migrated_at` set) are served as a 302
 *   to the provider — the bytes never transit this server, so app bandwidth
 *   stays at ~zero for images. On a PRIVATE bucket (`R2_PRIVATE_BUCKET=1`,
 *   v2.8.66.0 — Backblaze needs no credit card for private) the target is a
 *   presigned GET URL signed locally per redirect; on public buckets it is
 *   the plain bucket URL. Rows not yet migrated fall back to their database
 *   copy, so the site stays up DURING the backfill.
 *
 * Private school files (lms-work/, lms-people/, lms-chat/) are never served
 * here — they have their own authorization-checked routes in both modes.
 */
export async function GET(req: Request) {
  const driver = getStorageDriver();

  try {
    const value = new URL(req.url).searchParams.get("key") || "";
    const key = assertSafeObjectKey(value);

    if (isPrivateKey(key)) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }

    if (driver === "minio" || driver === "r2") {
      let present = false;
      let migratedAt: Date | null = null;
      try {
        const [row] = await db
          .select({ s3MigratedAt: mediaBlobs.s3MigratedAt })
          .from(mediaBlobs)
          .where(eq(mediaBlobs.key, key))
          .limit(1);
        present = Boolean(row);
        migratedAt = row?.s3MigratedAt ?? null;
      } catch {
        // The s3_migrated_at column may not exist yet on a cold database —
        // treat the row as present-but-unmigrated and let the DB fallback
        // answer (it will 404 honestly if the object was never stored).
        present = true;
      }

      if (!present) {
        return NextResponse.json({ error: "Media not found." }, { status: 404 });
      }

      if (migratedAt) {
        const storage = getStorage();
        if (!(storage instanceof S3MediaStorage)) {
          // Defensive: the driver says S3 but the instance is not — serve the
          // DB copy rather than 302-loop through this same route.
          return serveBuffer(await getPrivateStorage().getObject(key), key);
        }
        const target = storage.privateBucket
          ? await storage.getSignedReadUrl(key)
          : storage.getProviderUrl(key);
        return NextResponse.redirect(target, {
          status: 302,
          // Short on purpose: the presigned target rotates; the image itself
          // is cached long-term by the browser via B2's object metadata.
          headers: { "Cache-Control": "public, max-age=600" },
        });
      }

      // Backfill still pending for this object — serve the DB copy.
      return serveBuffer(await getPrivateStorage().getObject(key), key);
    }

    // "local" / "database" drivers — bytes live server-side.
    return serveBuffer(await getStorage().getObject(key), key);
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
