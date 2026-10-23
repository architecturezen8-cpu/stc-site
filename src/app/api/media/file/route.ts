import { NextResponse } from "next/server";
import { DatabaseMediaStorage, getStorage, getStorageDriver } from "@/lib/storage";
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

/**
 * Public media streaming route.
 *
 * - "database" + "local" drivers: bytes live server-side, this IS the
 *   canonical serving path.
 * - "minio" + "r2" drivers (v2.8.67.0): the bucket is private, so objects are
 *   streamed through here instead of raw provider URLs. If the object is not
 *   in the provider bucket (uploaded under an older "database"-era driver),
 *   fall back to `media_blobs` — that rescued every pre-B2 image on Vercel,
 *   which had been hard-404ing `/api/media/file` ever since the driver
 *   switched to r2 (all logo/site images dead on production).
 */
export async function GET(req: Request) {
  const driver = getStorageDriver();

  try {
    const value = new URL(req.url).searchParams.get("key") || "";
    const key = assertSafeObjectKey(value);

    let buffer: Buffer;
    try {
      buffer = await getStorage().getObject(key);
    } catch (storageError) {
      // S3-based drivers keep nothing in media_blobs for NEW uploads, but
      // legacy rows uploaded under the "database" driver still live there.
      if (driver === "r2" || driver === "minio") {
        buffer = await new DatabaseMediaStorage().getObject(key);
      } else {
        throw storageError;
      }
    }

    const extension = key.split(".").pop()?.toLowerCase() || "";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME[extension] || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
