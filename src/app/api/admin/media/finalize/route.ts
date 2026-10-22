import { NextResponse } from "next/server";
import { guardApi } from "@/lib/admin-auth";
import { processAndStoreImage } from "@/lib/media-processing";
import { getStorage, getStorageDriver } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await guardApi("media", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    if (getStorageDriver() === "local" || getStorageDriver() === "database") {
      throw new Error("Server-side uploads should use the multipart endpoint.");
    }
    const body = await req.json();
    const key = String(body.key || "");
    const requiredPrefix = `temporary/${admin.id}/`;
    if (!key.startsWith(requiredPrefix)) {
      throw new Error("This temporary upload does not belong to the current admin.");
    }

    const storage = getStorage();
    const buffer = await storage.getObject(key);
    try {
      const result = await processAndStoreImage({
        buffer,
        filename: String(body.filename || "upload"),
        title: String(body.title || ""),
        altText: String(body.altText || ""),
        caption: String(body.caption || ""),
        folder: String(body.folder || "site-assets"),
        category: String(body.category || "Uncategorised"),
        userId: admin.id,
      });
      return NextResponse.json(result);
    } finally {
      await storage.deleteObject(key).catch(() => undefined);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to finalise upload." },
      { status: 400 },
    );
  }
}
