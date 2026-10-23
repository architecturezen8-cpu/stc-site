import { NextResponse } from "next/server";
import { guardApi } from "@/lib/admin-auth";
import { processAndStoreImage } from "@/lib/media-processing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
]);

/**
 * Multipart proxy upload — server-side image processing + storage, zero CORS
 * involvement (the browser never talks to the provider directly).
 *
 * Used by the Media Library / Media Picker:
 * - whenever presign answers mode:"proxy" (drivers "local" + "database"), and
 * - as the AUTOMATIC FALLBACK (v2.8.67.0) when a driver "r2"/"minio" direct
 *   presigned PUT is refused by the browser — most commonly because the
 *   provider bucket has no CORS rules. Vercel caps serverless request bodies
 *   at ~4.5 MB, so the clients only fall back for files up to 4 MB and tell
 *   the user to fix the bucket CORS rules for bigger ones.
 *
 * v2.8.41.1 — this route was deleted by v2.8.41.0 while presign still
 * answered mode:"proxy", so every upload 404'd ("…not valid JSON").
 * v2.8.67.0 — restored again after it vanished once more (sandbox rollback);
 * presign's proxy branch and this route MUST ship together.
 */
export async function POST(req: Request) {
  const admin = await guardApi("media", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("Choose an image file to upload.");
    }
    if (!ALLOWED.has(file.type)) {
      throw new Error("Choose a JPEG, PNG, WebP, AVIF or HEIC image.");
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      throw new Error("Images must be 20 MB or smaller.");
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
