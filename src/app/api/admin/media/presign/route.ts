import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { guardApi } from "@/lib/admin-auth";
import { getStorage, getStorageDriver } from "@/lib/storage";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
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
      throw new Error("Choose a JPEG, PNG, WebP, AVIF or HEIC image.");
    }
    if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > MAX_BYTES) {
      throw new Error("Images must be 20 MB or smaller.");
    }

    const driver = getStorageDriver();
    // "database" has no presigned uploads — the bytes flow through the
    // multipart proxy just like the local filesystem driver.
    if (driver === "local" || driver === "database") {
      return NextResponse.json({ mode: "proxy", driver });
    }

    const storage = getStorage();
    if (!("createSignedUpload" in storage) || !storage.createSignedUpload) {
      throw new Error("The configured provider does not support signed uploads.");
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
