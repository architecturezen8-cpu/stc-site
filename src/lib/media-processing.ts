import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import type { Metadata } from "sharp";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  mediaAssets,
  mediaVariants,
} from "@/db/schema";
import { getStorage } from "@/lib/storage";

/**
 * v2.8.66.2 — sharp loads LAZILY: a top-level import of a native module
 * crashes the whole route at module-init when the binary is missing/broken
 * (the Vercel thumb-500 lesson). Every caller awaits getSharp() instead.
 */
type SharpFactory = typeof import("sharp").default;
let sharpPromise: Promise<SharpFactory> | null = null;
async function getSharp(): Promise<SharpFactory> {
  try {
    // Trace hint (v2.8.66.3): pins the libvips binary package into the
    // serverless bundle — sharp's binding dlopens libvips-cpp.so from this
    // sibling and the file tracer drops packages without a JS entry point.
    // Own try/catch — on non-glibc dev platforms the stub is simply absent.
    // @ts-expect-error — platform binary package without type declarations
    await import("@img/sharp-libvips-linux-x64/lib");
  } catch {
    /* trace hint only — sharp may still load via its own platform binaries */
  }
  try {
    sharpPromise ??= import("sharp").then((m) => m.default);
    return await sharpPromise;
  } catch (error) {
    throw new Error("Image processing is unavailable on this server.", { cause: error });
  }
}

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

/** Magic-byte sniffing for the no-sharp fallback (below) — trusts nothing
    from the client, only the file header itself. Same accepted set as the
    sharp pipeline: JPEG, PNG, WebP, AVIF, HEIC/HEIF. */
const SNIFFED_FORMATS = [
  {
    test: (b: Buffer) =>
      b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    mime: "image/jpeg",
    ext: "jpg",
  },
  {
    test: (b: Buffer) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    mime: "image/png",
    ext: "png",
  },
  {
    test: (b: Buffer) =>
      b.length >= 12 &&
      b.toString("latin1", 0, 4) === "RIFF" &&
      b.toString("latin1", 8, 12) === "WEBP",
    mime: "image/webp",
    ext: "webp",
  },
  {
    test: (b: Buffer) =>
      b.length >= 12 &&
      b.toString("latin1", 4, 8) === "ftyp" &&
      ["avif", "avis"].includes(b.toString("latin1", 8, 12)),
    mime: "image/avif",
    ext: "avif",
  },
  {
    test: (b: Buffer) =>
      b.length >= 12 &&
      b.toString("latin1", 4, 8) === "ftyp" &&
      ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(
        b.toString("latin1", 8, 12),
      ),
    mime: "image/heif",
    ext: "heic",
  },
] as const;

function buildPrefix(input: ProcessMediaInput, hash: string) {
  const folder = slug(input.folder || "site-assets", "site-assets");
  const title = (input.title || path.parse(input.filename).name).trim();
  const baseName = `${slug(title, "image")}-${hash.slice(0, 14)}`;
  const year = new Date().getFullYear();
  return { folder, title, prefix: `images/${folder}/${year}/${baseName}` };
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

  // v2.8.66.4 — degrade instead of fail: if the native pipeline cannot load
  // (broken/missing binaries on the host — the Vercel lesson), store the
  // ORIGINAL file as the master variant rather than killing the upload.
  // The upload loop becomes network/CORS-sensitive only. Images saved this
  // way carry "unknown" dimensions and no blur/dominant colour until the
  // native pipeline returns (a redeploy), and EXIF is NOT stripped here —
  // accepted trade-off of the emergency path, documented for the audit log.
  const sharp = await getSharp().catch(() => null);
  if (!sharp) return storeOriginalImage(input, hash);

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
  const { folder, title, prefix } = buildPrefix(input, hash);

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

/**
 * v2.8.66.4 — the no-sharp emergency path. Stores the ORIGINAL bytes as the
 * single "master" variant after a magic-byte sniff (JPEG/PNG/WebP/AVIF/HEIC
 * only — the same accepted set as the sharp pipeline, but judged from the
 * file header, never from client headers). No resize, no WebP, no EXIF
 * strip, no blur/dominant colour, dimensions unknown. Exported so a sandbox
 * probe can exercise it directly without forcing sharp to fail.
 */
export async function storeOriginalImage(input: ProcessMediaInput, hash: string) {
  const sniffed = SNIFFED_FORMATS.find((format) => format.test(input.buffer));
  if (!sniffed) {
    throw new Error("Supported image types are JPEG, PNG, WebP, AVIF and HEIC.");
  }

  const storage = getStorage();
  const { folder, title, prefix } = buildPrefix(input, hash);
  const key = `${prefix}-master.${sniffed.ext}`;

  await storage.putObject({
    key,
    body: input.buffer,
    contentType: sniffed.mime,
    cacheControl: IMMUTABLE_CACHE,
  });

  try {
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        title,
        altText: (input.altText || title).trim(),
        caption: input.caption?.trim() || null,
        folder,
        category: input.category?.trim() || "Uncategorised",
        provider: storage.driver,
        objectKey: key,
        originalFilename: input.filename.slice(0, 500),
        mimeType: sniffed.mime,
        // Dimensions/blur/dominant need the native pipeline — null = unknown.
        width: null,
        height: null,
        originalSize: input.buffer.length,
        dominantColor: null,
        blurDataUrl: null,
        contentHash: hash,
        status: "ready",
        uploadedBy: input.userId,
      })
      .returning();

    const [variant] = await db
      .insert(mediaVariants)
      .values({
        assetId: asset.id,
        variantName: "master",
        format: sniffed.ext,
        // media_variants.width/height are NOT NULL — 0 reads as "unknown"
        // everywhere (orientation() and friends treat falsy as unknown).
        width: 0,
        height: 0,
        objectKey: key,
        fileSize: input.buffer.length,
        publicUrl: storage.getPublicUrl(key),
      })
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: input.userId,
      action: "upload_media",
      entity: "media_asset",
      entityId: String(asset.id),
      details: {
        provider: storage.driver,
        filename: input.filename,
        variants: ["master"],
        processing: "original-stored",
        reason: "sharp-unavailable",
      },
    });

    return { asset, variants: [variant], duplicate: false };
  } catch (error) {
    await storage.deleteObject(key).catch(() => undefined);
    throw error;
  }
}
