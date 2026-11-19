import { NextResponse } from "next/server";

import { guardApi } from "@/lib/admin-auth";
import { getStorage } from "@/lib/storage";
import { assertSafeObjectKey } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — Storage Explorer download: streams ONE object back to an admin
 * as an attachment. The key must pass the project's strict object-key rules
 * (same as every upload and /api/media/file), the content type is guessed
 * from the extension, and the filename is the key's basename.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  css: "text/css",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  gif: "image/gif",
  html: "text/html",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  json: "application/json",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  webm: "video/webm",
  webp: "image/webp",
  wav: "audio/wav",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

export async function GET(req: Request) {
  const denied = await guardApi("storage", "read");
  if (denied instanceof NextResponse) return denied;

  const raw = new URL(req.url).searchParams.get("key") ?? "";
  if (!raw.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing key." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  let safeKey: string;
  try {
    safeKey = assertSafeObjectKey(raw);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unsafe object key.",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  let buffer: Buffer;
  try {
    buffer = await getStorage().getObject(safeKey);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Object not found." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const basename = safeKey.split("/").pop() || "download.bin";
  // Attachment names are header values — keep them to a safe printable set.
  const filename = basename.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "download.bin";
  const extension = basename.includes(".") ? basename.split(".").pop()?.toLowerCase() || "" : "";
  const contentType = MIME_BY_EXTENSION[extension] || "application/octet-stream";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="${filename}"`,
      // One-off admin downloads must never come from a cache.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
