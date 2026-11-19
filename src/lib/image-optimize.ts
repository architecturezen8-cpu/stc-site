import "server-only";

/**
 * v2.9.15.11 — THE PROFILE-IMAGE OPTIMIZER, now WebP-first (owner: "profile
 * photo ekak daddi eka webp walata convert karoth hodai ne optimize wenna").
 *
 * The media library's engine is sharp (src/lib/media-processing.ts) — this
 * module reuses the SAME lazy-loading pattern (a top-level sharp import
 * crashes the whole route when the native binary is missing — the Vercel
 * thumb-500 lesson) and gives the four profile/avatar store helpers ONE
 * choke point:
 *
 *   · EXIF orientation applied, EXIF block stripped (no GPS leaks),
 *   · resized to fit inside 1024×1024 (never upscaled),
 *   · re-encoded WEBP quality 80 — roughly 25–35% lighter than the JPEG
 *     q82 it replaces at the same visual quality, and alpha survives
 *     (transparent PNGs stay transparent, no white-flatten needed),
 *   · raw bytes passthrough when sharp is unavailable (degraded, same as
 *     the media library's own fallback).
 *
 * Every profile photo path rides this: register photos (lms-people/),
 * portal avatars (portal-avatars/), admin (admin-avatars/) and lms-admin
 * (lms-admin-avatars/) — so a 6 MB phone shot lands as a ~60 KB WebP no
 * matter which door it came through. The serving routes derive their
 * content-type from the key's extension (MIME_BY_EXT maps already know
 * image/webp), so no reader had to change.
 */

type SharpFactory = typeof import("sharp").default;
let sharpPromise: Promise<SharpFactory> | null = null;

async function getSharp(): Promise<SharpFactory | null> {
  try {
    // Trace hint — pins the libvips binary package into the serverless
    // bundle (same reasoning as media-processing.ts).
    // @ts-expect-error — platform binary package without type declarations
    await import("@img/sharp-libvips-linux-x64/lib");
  } catch {
    /* trace hint only */
  }
  try {
    sharpPromise ??= import("sharp").then((m) => m.default);
    return await sharpPromise;
  } catch {
    return null;
  }
}

export type OptimizedImage = {
  bytes: Buffer;
  contentType: "image/webp" | "image/jpeg" | "image/png";
  width: number;
  height: number;
};

export const PROFILE_IMAGE_MAX_EDGE = 1024;
export const PROFILE_IMAGE_WEBP_QUALITY = 80;

/** Optimize one profile/avatar image; null = store the original as-is. */
export async function optimizeProfileImage(
  input: Buffer,
): Promise<OptimizedImage | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(input)
      .rotate() // bake EXIF orientation, then strip
      .resize({
        width: PROFILE_IMAGE_MAX_EDGE,
        height: PROFILE_IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: PROFILE_IMAGE_WEBP_QUALITY }) // alpha-safe, no flatten
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: out.data,
      contentType: "image/webp",
      width: out.info.width,
      height: out.info.height,
    };
  } catch {
    /* a corrupt/weird image must never break the upload — original wins */
    return null;
  }
}

export function extForImageMime(mime: string): string {
  if (mime === "image/webp") return "webp";
  return mime === "image/png" ? "png" : "jpg";
}
