import { NextResponse } from "next/server";
import { guardApi } from "@/lib/admin-auth";
import { processAndStoreImage } from "@/lib/media-processing";

/**
 * v2.8.68.4 — the ONE multipart media-upload handler, shared by TWO routes:
 *
 *   POST /api/admin/media          ← canonical (route.ts has served the media
 *                                     library GET since forever and has never
 *                                     vanished — uploads now live there too)
 *   POST /api/admin/media/upload   ← compat alias (kept for older deploys)
 *
 * WHY: /api/admin/media/upload disappeared FOUR times (v2.8.41.0 refactor,
 * two sandbox rollbacks, and accidentally in the v2.8.68.1 commit), and every
 * time the media gallery 404'd with the useless "Image processing failed."
 * message. Extracting the body here means both routes share one
 * implementation (no drift) and the canonical endpoint can never silently
 * disappear without taking the whole media library down with it.
 *
 * Used by the Media Library / Media Picker:
 * - whenever presign answers mode:"proxy" (drivers "local" + "database"), and
 * - as the AUTOMATIC FALLBACK (v2.8.67.0) when a driver "r2"/"minio" direct
 *   presigned PUT is refused by the browser — most commonly because the
 *   provider bucket has no CORS rules. Vercel caps serverless request bodies
 *   at ~4.5 MB, so the clients only fall back for files up to 4 MB and tell
 *   the user to fix the bucket CORS rules for bigger ones.
 */

const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  // v2.8.67.0 — favicon formats (the browser-tab icon)
  "image/x-icon",
  "image/svg+xml",
  // v2.9.8.0 — videos via the multipart proxy (20 MB is the proxy budget;
  // bigger videos ride the direct presigned PUT in the picker flow).
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
]);

export async function handleAdminMediaMultipart(req: Request): Promise<Response> {
  const admin = await guardApi("media", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("Choose an image or video file to upload.");
    }
    if (!ALLOWED.has(file.type)) {
      throw new Error("Choose a JPEG, PNG, WebP, AVIF, HEIC, ICO or SVG image, or an MP4, WebM, MOV, OGG or MKV video.");
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new Error("Server uploads must be 20 MB or smaller — larger videos upload directly to the bucket from the picker.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processAndStoreImage({
      buffer,
      filename: file.name || "upload",
      title: String(form.get("title") || ""),
      altText: String(form.get("altText") || ""),
      caption: String(form.get("caption") || ""),
      folder: String(form.get("folder") || "site-assets"),
      category: String(form.get("category") || "Uncategorised"),
      userId: admin.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process the upload." },
      { status: 400 },
    );
  }
}
