import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Disk-cached thumbnail endpoint for legacy static images (v2.8.24).
 *
 * Admin grids used to load the full `/images/*.jpg` masters (~150–200 KB
 * each) for small cards. This route renders a 480px WebP once, caches it,
 * and serves it with immutable caching afterwards.
 * No database involvement — safe for the embedded PGlite instance.
 *
 * GET /api/media/thumb?src=/images/hero.jpg
 *
 * v2.8.66.2 — Vercel hardening:
 *  - the cache lives under os.tmpdir() — serverless filesystems are
 *    read-only outside /tmp, so the old process.cwd()/.data path EROFS'd;
 *  - sharp is imported LAZILY and any failure (native binary missing in a
 *    cold bundle, unsupported format, read-only disk…) degrades to a 302
 *    redirect to the original file — this route can no longer 500;
 *  - every redirect still sends no-store so the browser retries later.
 */

const THUMB_WIDTH = 480;
const THUMB_QUALITY = 72;

const CACHE_DIR = path.join(os.tmpdir(), "stc-thumbs");
const PUBLIC_DIR = path.join(process.cwd(), "public");

type SharpModule = typeof import("sharp");
let sharpPromise: Promise<SharpModule> | null = null;

async function loadSharp(): Promise<SharpModule | null> {
  try {
    // Trace hint (v2.8.66.3): the libvips .so has no JS entry the build's
    // file tracer can follow, so it was dropped from serverless bundles and
    // sharp dlopen failed on Vercel. Importing the package stub here pins
    // the whole package into the traced output. Own try/catch — on
    // non-glibc dev platforms the stub is simply absent.
    // @ts-expect-error — platform binary package without type declarations
    await import("@img/sharp-libvips-linux-x64/lib");
  } catch {
    /* trace hint only — sharp may still load via its own platform binaries */
  }
  try {
    sharpPromise ??= import("sharp");
    return await sharpPromise;
  } catch (error) {
    console.error("[media/thumb] sharp failed to load — serving originals:", error);
    return null;
  }
}

function resolveSource(raw: string | null): string | null {
  if (!raw) return null;
  let source: string;
  try {
    source = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // Only allow site-owned static images — no traversal, no hosts, no queries.
  if (!source.startsWith("/images/")) return null;
  if (source.includes("..") || source.includes("\0") || source.includes("?")) return null;
  if (!/\.(jpe?g|png)$/i.test(source)) return null;
  return source;
}

function redirectToOriginal(source: string) {
  return new NextResponse(null, {
    status: 302,
    headers: { location: source, "cache-control": "no-store" },
  });
}

export async function GET(req: Request) {
  const source = resolveSource(new URL(req.url).searchParams.get("src"));
  if (!source) {
    return NextResponse.json({ error: "Invalid image source." }, { status: 400 });
  }

  const absolute = path.join(PUBLIC_DIR, source);
  if (!existsSync(absolute)) {
    return redirectToOriginal(source);
  }

  // sharp is optional at runtime — without it we still serve the image.
  const sharpModule = await loadSharp();
  if (!sharpModule) {
    return redirectToOriginal(source);
  }
  const sharp = sharpModule.default;

  const key = createHash("sha1").update(source).digest("hex").slice(0, 24);
  const cached = path.join(CACHE_DIR, `${key}.webp`);

  try {
    if (existsSync(cached)) {
      const bytes = await readFile(cached);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const webp = await sharp(absolute)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cached, webp);

    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    // Graceful fallback — let the browser load the original file instead.
    console.error(`[media/thumb] render failed for ${source} — redirecting:`, error);
    return redirectToOriginal(source);
  }
}
