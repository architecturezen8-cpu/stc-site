import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  mediaAssets,
  mediaVariants,
} from "@/db/schema";
import { getStorage } from "@/lib/storage";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 60_000_000;
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

const VARIANT_SPECS = [
  { name: "thumbnail", width: 320, quality: 72 },
  { name: "small", width: 640, quality: 76 },
  { name: "medium", width: 1280, quality: 79 },
  { name: "large", width: 1920, quality: 81 },
  { name: "master", width: 2560, quality: 83 },
] as const;

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);

function slug(value: string, fallback: string) {
  const clean = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return clean || fallback;
}

function colourHex(value: { r: number; g: number; b: number }) {
  return `#${[value.r, value.g, value.b]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")}`;
}

export type ProcessMediaInput = {
  buffer: Buffer;
  filename: string;
  title?: string;
  altText?: string;
  caption?: string;
  folder?: string;
  category?: string;
  userId: number;
};

export async function processAndStoreImage(input: ProcessMediaInput) {
  if (!input.buffer.length) throw new Error("The uploaded file is empty.");
  if (input.buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Images must be 20 MB or smaller before processing.");
  }

  const hash = createHash("sha256").update(input.buffer).digest("hex");
  const [duplicate] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.contentHash, hash),
        eq(mediaAssets.status, "ready"),
        isNull(mediaAssets.deletedAt),
      ),
    )
    .limit(1);

  if (duplicate) {
    const variants = await db
      .select()
      .from(mediaVariants)
      .where(eq(mediaVariants.assetId, duplicate.id));
    return { asset: duplicate, variants, duplicate: true };
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input.buffer, {
      failOn: "error",
      limitInputPixels: MAX_PIXELS,
      animated: false,
    }).metadata();
  } catch {
    throw new Error("This file is not a valid supported image.");
  }

  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new Error("Supported image types are JPEG, PNG, WebP, AVIF and HEIC.");
  }
  if (!metadata.width || !metadata.height) {
    throw new Error("The image dimensions could not be read.");
  }
  if (metadata.width * metadata.height > MAX_PIXELS) {
    throw new Error("The image contains too many pixels to process safely.");
  }

  const storage = getStorage();
  const folder = slug(input.folder || "site-assets", "site-assets");
  const title = (input.title || path.parse(input.filename).name).trim();
  const baseName = `${slug(title, "image")}-${hash.slice(0, 14)}`;
  const year = new Date().getFullYear();
  const prefix = `images/${folder}/${year}/${baseName}`;

  const oriented = sharp(input.buffer, {
    failOn: "error",
    limitInputPixels: MAX_PIXELS,
    animated: false,
  }).rotate();

  const orientedMeta = await oriented.clone().metadata();
  const sourceWidth =
    metadata.orientation && metadata.orientation >= 5
      ? metadata.height
      : orientedMeta.width || metadata.width;

  const specs = VARIANT_SPECS.filter(
    (spec) =>
      spec.name === "thumbnail" ||
      spec.name === "master" ||
      spec.width < sourceWidth,
  );

  const uploadedKeys: string[] = [];
  const generated: Array<{
    name: string;
    width: number;
    height: number;
    key: string;
    size: number;
    url: string;
  }> = [];

  try {
    for (const spec of specs) {
      const result = await oriented
        .clone()
        .resize({
          width: spec.width,
          withoutEnlargement: true,
          fit: "inside",
        })
        // Metadata is intentionally not retained: this strips EXIF and GPS.
        .webp({ quality: spec.quality, effort: 5, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });

      const key = `${prefix}-${spec.name}.webp`;
      await storage.putObject({
        key,
        body: result.data,
        contentType: "image/webp",
        cacheControl: IMMUTABLE_CACHE,
      });
      uploadedKeys.push(key);
      generated.push({
        name: spec.name,
        width: result.info.width,
        height: result.info.height,
        key,
        size: result.info.size,
        url: storage.getPublicUrl(key),
      });
    }

    const master = generated.find((variant) => variant.name === "master");
    if (!master) throw new Error("The master image variant was not generated.");

    const stats = await oriented.clone().resize({ width: 64 }).stats();
    const blurBuffer = await oriented
      .clone()
      .resize({ width: 24, withoutEnlargement: true })
      .webp({ quality: 35 })
      .toBuffer();

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        title,
        altText: (input.altText || title).trim(),
        caption: input.caption?.trim() || null,
        folder,
        category: input.category?.trim() || "Uncategorised",
        provider: storage.driver,
        objectKey: master.key,
        originalFilename: input.filename.slice(0, 500),
        mimeType: "image/webp",
        width: master.width,
        height: master.height,
        originalSize: input.buffer.length,
        dominantColor: colourHex(stats.dominant),
        blurDataUrl: `data:image/webp;base64,${blurBuffer.toString("base64")}`,
        contentHash: hash,
        status: "ready",
        uploadedBy: input.userId,
      })
      .returning();

    const variants = await db
      .insert(mediaVariants)
      .values(
        generated.map((variant) => ({
          assetId: asset.id,
          variantName: variant.name,
          format: "webp",
          width: variant.width,
          height: variant.height,
          objectKey: variant.key,
          fileSize: variant.size,
          publicUrl: variant.url,
        })),
      )
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: input.userId,
      action: "upload_media",
      entity: "media_asset",
      entityId: String(asset.id),
      details: {
        provider: storage.driver,
        filename: input.filename,
        variants: variants.map((variant) => variant.variantName),
      },
    });

    return { asset, variants, duplicate: false };
  } catch (error) {
    await Promise.all(
      uploadedKeys.map((key) => storage.deleteObject(key).catch(() => undefined)),
    );
    throw error;
  }
}
