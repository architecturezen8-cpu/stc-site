import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * Disk-cached thumbnail endpoint for legacy static images (v2.8.24,
 * hardened v2.8.66.2–66.3 for Vercel).
 *
 * Admin grids used to load the full `/images/*.jpg` masters (~150–200 KB
 * each) for small cards. This route renders a 480px WebP once, caches it,
 * and serves it with immutable caching afterwards. No database involvement.
 *
 * Vercel hardening (the two lessons of the 66.x deploys):
 *  - sharp is NEVER imported at module top level. Next 16 dropped sharp from
 *    its default externals list, so a bundled native binary crashed this
 *    route at module init on Vercel (static 500 for every request, even
 *    invalid-src probes). The loader below is lazy + cached + failure-tolerant.
 *  - The cache lives under os.tmpdir() — the serverless filesystem is
 *    read-only outside /tmp, so a cwd-relative cache dir would EROFS.
 *  - EVERY failure degrades to a 302 redirect to the original file — the
 *    route can never 500, worst case the browser loads the unoptimised
 *    original (that is exactly the "serving originals" Vercel log line).
 *
 * GET /api/media/thumb?src=/images/hero.jpg
 */

type SharpModule = typeof import("sharp");

const THUMB_WIDTH = 480;
const THUMB_QUALITY = 72;

const CACHE_DIR = path.join(os.tmpdir(), "stc-thumbs");
const PUBLIC_DIR = path.join(process.cwd(), "public");

let sharpPromise: Promise<SharpModule | null> | null = null;
async function loadSharp(): Promise<SharpModule | null> {
  try {
    sharpPromise ??= import("sharp").then(
      (m) => m,
      (error) => {
        console.error("[media/thumb] sharp failed to load — serving originals:", error);
        sharpPromise = null;
        return null;
      },
    );
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
  if (source.includes("\\")) return null;
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

  const sharpModule = await loadSharp();
  if (!sharpModule) return redirectToOriginal(source);
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

    // Cache writes are best-effort: a tmpdir hiccup must not break the render.
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cached, webp);
    } catch {
      /* cache unavailable — serve without caching */
    }

    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error(`[media/thumb] render failed for ${source} — redirecting:`, error);
    return redirectToOriginal(source);
  }
}
