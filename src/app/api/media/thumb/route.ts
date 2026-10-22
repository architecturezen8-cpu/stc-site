import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";

/**
 * Disk-cached thumbnail endpoint for legacy static images (v2.8.24).
 *
 * Admin grids used to load the full `/images/*.jpg` masters (~150–200 KB
 * each) for small cards. This route renders a 480px WebP once, caches it
 * under `.data/thumbs/`, and serves it with immutable caching afterwards.
 * No database involvement — safe for the embedded PGlite instance.
 *
 * GET /api/media/thumb?src=/images/hero.jpg
 */

const THUMB_WIDTH = 480;
const THUMB_QUALITY = 72;

const CACHE_DIR = path.join(process.cwd(), ".data", "thumbs");
const PUBLIC_DIR = path.join(process.cwd(), "public");

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

export async function GET(req: Request) {
  const source = resolveSource(new URL(req.url).searchParams.get("src"));
  if (!source) {
    return NextResponse.json({ error: "Invalid image source." }, { status: 400 });
  }

  const absolute = path.join(PUBLIC_DIR, source);
  if (!existsSync(absolute)) {
    return new NextResponse(null, {
      status: 302,
      headers: { location: source, "cache-control": "no-store" },
    });
  }

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
  } catch {
    // Graceful fallback — let the browser load the original file instead.
    return new NextResponse(null, {
      status: 302,
      headers: { location: source, "cache-control": "no-store" },
    });
  }
}
