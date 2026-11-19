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
/** v2.9.8.0 — videos are stored as-is (no transcoding), so the cap is the
 *  direct-upload budget, not the Vercel body limit. The multipart proxy
 *  keeps its own 20 MB cap; direct presigned PUTs (r2/minio) can carry
 *  videos up to this size into finalize. */
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
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

/**
 * v2.9.8.0 — VIDEO magic-byte sniffing. sharp can never process video, so
 * video uploads take their own storage path (storeOriginalVideo below).
 * Trusts nothing from the client — only the file header itself.
 */
const VIDEO_SNIFFED_FORMATS = [
  {
    // MP4 / M4V / MOV — all "ftyp" box at offset 4, brand in bytes 8..12
    test: (b: Buffer) =>
      b.length >= 12 && b.toString("latin1", 4, 8) === "ftyp",
    mime: "video/mp4",
    ext: "mp4",
  },
  {
    // WebM + MKV — the EBML magic 0x1A 0x45 0xDF 0xA3
    test: (b: Buffer) =>
      b.length > 4 &&
      b[0] === 0x1a &&
      b[1] === 0x45 &&
      b[2] === 0xdf &&
      b[3] === 0xa3,
    mime: "video/webm",
    ext: "webm",
  },
  {
    // Ogg container (ogg/ogv)
    test: (b: Buffer) =>
      b.length > 4 &&
      b[0] === 0x4f &&
      b[1] === 0x67 &&
      b[2] === 0x67 &&
      b[3] === 0x53,
    mime: "video/ogg",
    ext: "ogg",
  },
] as const;

/** Magic-byte sniffing for the no-sharp fallback (below) — trusts nothing
    from the client, only the file header itself. Same accepted set as the
    sharp pipeline: JPEG, PNG, WebP, AVIF, HEIC/HEIF. */
const SNIFFED_FORMATS = [
  {
    // v2.8.67.0 — Windows .ico favicon (the owner's falcon file format)
    test: (b: Buffer) =>
      b.length > 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00,
    mime: "image/x-icon",
    ext: "ico",
  },
  {
    // v2.8.67.0 — SVG (stored as-is, sanitized; sharp can never process these)
    test: (b: Buffer) => {
      if (b.length < 5) return false;
      const head = b.toString("utf8", 0, Math.min(b.length, 512)).toLowerCase().replace(/^\ufeff/, "");
      return head.startsWith("<?xml") || head.startsWith("<svg") || head.includes("<svg");
    },
    mime: "image/svg+xml",
    ext: "svg",
  },
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

/**
 * v2.8.67.0 — SVG hardening BEFORE storage. SVG is an XML document that can
 * carry <script> loaders, event handlers and javascript: URLs; the media
 * route serves bytes same-origin, so anything executable in an SVG is a
 * stored-XSS hole. The upload pipeline strips every executable construct
 * and the serving route adds a CSP sandbox header on top (defence in depth).
 * A stripped file simply renders as the static vector it is meant to be.
 */
export function sanitizeSvgBuffer(input: Buffer): Buffer {
  let text = input.toString("utf8");
  // <script> blocks, self-closing script tags and foreignObject embeds
  text = text.replace(/<script[\s\S]*?<\/script\s*>/gi, "");
  text = text.replace(/<script[^>]*\/>/gi, "");
  text = text.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");
  // inline event handlers (onclick=, onerror=, onload= …)
  text = text.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // javascript: URLs in href/xlink:href/src
  text = text.replace(
    /(href|xlink:href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi,
    "$1=$2#$2",
  );
  // any leftover literal <script becomes inert text
  text = text.replace(/<script/gi, "&lt;script");
  if (!text.includes("<svg")) {
    throw new Error("The SVG file is not valid.");
  }
  return Buffer.from(text, "utf8");
}

function buildPrefix(input: ProcessMediaInput, hash: string, kind: "images" | "videos" = "images") {
  const folder = slug(input.folder || "site-assets", "site-assets");
  const title = (input.title || path.parse(input.filename).name).trim();
  const baseName = `${slug(title, kind === "videos" ? "video" : "image")}-${hash.slice(0, 14)}`;
  const year = new Date().getFullYear();
  return { folder, title, prefix: `${kind}/${folder}/${year}/${baseName}` };
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

/**
 * The ONE entry point every media upload funnels into. v2.9.8.0 — video
 * files are sniffed from their magic bytes FIRST and routed to their own
 * storage path (sharp can never touch video); everything else keeps the
 * exact image pipeline below.
 */
export async function processAndStoreImage(input: ProcessMediaInput) {
  if (!input.buffer.length) throw new Error("The uploaded file is empty.");

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

  // v2.9.8.0 — video dispatch BEFORE the 20 MB image cap: videos have their
  // own 120 MB budget and bypass sharp entirely.
  const videoFormat = VIDEO_SNIFFED_FORMATS.find((format) => format.test(input.buffer));
  if (videoFormat) {
    if (input.buffer.length > MAX_VIDEO_BYTES) {
      throw new Error("Videos must be 120 MB or smaller.");
    }
    return storeOriginalVideo(input, hash, videoFormat);
  }

  if (input.buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("Images must be 20 MB or smaller before processing.");
  }

  // v2.8.67.0 — favicons first: .ico and .svg can NEVER go through sharp.
  // .ico stores as the original bytes; .svg is sanitized (XSS-hardened) and
  // stored as-is, so the browser gets the crisp vector/multi-size icon.
  const faviconFormat = SNIFFED_FORMATS.find(
    (format) =>
      (format.ext === "ico" || format.ext === "svg") && format.test(input.buffer),
  );
  if (faviconFormat) {
    if (faviconFormat.ext === "svg") {
      const sanitized = sanitizeSvgBuffer(input.buffer);
      return storeOriginalImage({ ...input, buffer: sanitized }, createHash("sha256").update(sanitized).digest("hex"));
    }
    return storeOriginalImage(input, hash);
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
    throw new Error("Supported image types are JPEG, PNG, WebP, AVIF, HEIC, ICO and SVG.");
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
 * v2.9.8.0 — the VIDEO storage path. No transcoding, no thumbnails, no
 * dimension extraction (that needs ffprobe, which serverless cannot
 * guarantee): the ORIGINAL bytes are stored as the single "master" variant
 * under `videos/<folder>/<year>/…-master.<ext>`. Browsers render the first
 * frame for library/picker cards via <video preload="metadata">, and
 * /api/media/file answers Range requests so playback + seeking work.
 */
export async function storeOriginalVideo(
  input: ProcessMediaInput,
  hash: string,
  format: { mime: string; ext: string },
) {
  const storage = getStorage();
  const { folder, title, prefix } = buildPrefix(input, hash, "videos");
  const key = `${prefix}-master.${format.ext}`;

  await storage.putObject({
    key,
    body: input.buffer,
    contentType: format.mime,
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
        mimeType: format.mime,
        // Dimensions need ffprobe — null = unknown (cards fall back to
        // <video preload="metadata"> first-frame rendering).
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
        format: format.ext,
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
        mediaKind: "video",
      },
    });

    return { asset, variants: [variant], duplicate: false };
  } catch (error) {
    await storage.deleteObject(key).catch(() => undefined);
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
    throw new Error("Supported image types are JPEG, PNG, WebP, AVIF, HEIC, ICO and SVG.");
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
