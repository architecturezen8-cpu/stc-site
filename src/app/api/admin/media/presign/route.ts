import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { guardApi } from "@/lib/admin-auth";
import { getStorage, getStorageDriver } from "@/lib/storage";

const MAX_BYTES = 20 * 1024 * 1024;
/** v2.9.8.0 — videos ride the direct presigned PUT, which has no Vercel
 *  body cap; the proxy drivers (local/database) keep the 20 MB budget. */
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
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
  // v2.9.8.0 — videos ("page eke images thiyana than walata videos replace
  // karanna wenawa"): the media library stores + serves them like images.
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
]);
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-matroska",
]);

export async function POST(req: Request) {
  const admin = await guardApi("media", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const { filename, contentType, size } = await req.json();
    if (typeof filename !== "string" || !filename.trim()) {
      throw new Error("A filename is required.");
    }
    if (!ALLOWED.has(String(contentType))) {
      throw new Error("Choose a JPEG, PNG, WebP, AVIF, HEIC, ICO or SVG image, or an MP4, WebM, MOV, OGG or MKV video.");
    }
    const isVideo = VIDEO_TYPES.has(String(contentType));
    const driver = getStorageDriver();
    const limit = isVideo && driver !== "local" && driver !== "database" ? MAX_VIDEO_BYTES : MAX_BYTES;
    if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > limit) {
      throw new Error(
        isVideo
          ? `Videos must be ${Math.round(limit / 1024 / 1024)} MB or smaller.`
          : "Images must be 20 MB or smaller.",
      );
    }
    // "database" has no presigned uploads — the bytes flow through the
    // multipart proxy just like the local filesystem driver.
    if (driver === "local" || driver === "database") {
      return NextResponse.json({ mode: "proxy", driver });
    }

    const storage = getStorage();
    if (!("createSignedUpload" in storage) || !storage.createSignedUpload) {
      throw new Error("The configured provider does not support signed uploads.");
    }

    // v2.8.66.7 — probe the bucket's CORS preflight (cached 10 min/origin).
    // When the bucket has no rule answering the browser (B2's default), answer
    // mode:"proxy" so the client uploads through this server instead of
    // firing a guaranteed-failing presigned PUT — no console CORS noise, and
    // big-file direct uploads resume automatically once the rule is added.
    const origin = req.headers.get("origin")?.trim() || "*";
    if ("probeDirectUpload" in storage && !(await storage.probeDirectUpload(origin))) {
      return NextResponse.json({ mode: "proxy", driver });
    }
    const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const key = `temporary/${admin.id}/${randomUUID()}.${extension}`;
    const signed = await storage.createSignedUpload(key, contentType, 600);
    return NextResponse.json({ mode: "direct", driver, ...signed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare upload." },
      { status: 400 },
    );
  }
}
