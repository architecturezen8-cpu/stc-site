import { NextResponse } from "next/server";
import { DatabaseMediaStorage, getStorage, getStorageDriver } from "@/lib/storage";
import { assertSafeObjectKey } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* v2.9.7.0 — PERF: every logo/site asset request streams from the remote
   bucket through this route, and the first-hit latency (1.5–2 s in dev
   logs) lands on EVERY visitor that shares the object. A small bounded
   in-memory LRU keeps hot small objects (logos, site assets, card images)
   in the server process: first visitor pays the fetch, everyone after is
   served from memory. Size-bounded so it can never OOM the process —
   large videos/PDFs (over 3 MB) are never cached, total 48 MB cap with
   oldest-entry eviction, 10 min TTL (objects are content-stamped by new
   uploads anyway, so staleness is not a real risk). */
const MEDIA_LRU_MAX_BYTES = 48 * 1024 * 1024;
const MEDIA_LRU_ITEM_MAX = 3 * 1024 * 1024;
const MEDIA_LRU_TTL_MS = 10 * 60 * 1000;

const globalForMedia = globalThis as typeof globalThis & {
  __stcMediaLru?: Map<string, { buffer: Buffer; at: number }>;
};

function mediaLru(): Map<string, { buffer: Buffer; at: number }> {
  return (globalForMedia.__stcMediaLru ??= new Map());
}

function mediaLruStore(key: string, buffer: Buffer) {
  if (buffer.length > MEDIA_LRU_ITEM_MAX) return;
  const cache = mediaLru();
  cache.delete(key); // refresh insertion order
  cache.set(key, { buffer, at: Date.now() });
  let total = 0;
  for (const entry of cache.values()) total += entry.buffer.length;
  while (total > MEDIA_LRU_MAX_BYTES && cache.size > 0) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    total -= cache.get(oldest)!.buffer.length;
    cache.delete(oldest);
  }
}

function mediaLruGet(key: string): Buffer | null {
  const entry = mediaLru().get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > MEDIA_LRU_TTL_MS) {
    mediaLru().delete(key);
    return null;
  }
  // refresh recency
  mediaLru().delete(key);
  mediaLru().set(key, entry);
  return entry.buffer;
}

const MIME: Record<string, string> = {
  webp: "image/webp",
  avif: "image/avif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
  // v2.8.67.0 — favicon formats
  ico: "image/x-icon",
  svg: "image/svg+xml",
  // v2.9.8.0 — videos: correct types + Range support below so <video>
  // playback and seeking work through this proxy route.
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

/**
 * Public media streaming route.
 *
 * - "database" + "local" drivers: bytes live server-side, this IS the
 *   canonical serving path.
 * - "minio" + "r2" drivers (v2.8.67.0): the bucket is private, so objects are
 *   streamed through here instead of raw provider URLs. If the object is not
 *   in the provider bucket (uploaded under an older "database"-era driver),
 *   fall back to `media_blobs` — that rescued every pre-B2 image on Vercel,
 *   which had been hard-404ing `/api/media/file` ever since the driver
 *   switched to r2 (all logo/site images dead on production).
 */
export async function GET(req: Request) {
  const driver = getStorageDriver();

  try {
    const value = new URL(req.url).searchParams.get("key") || "";
    const key = assertSafeObjectKey(value);

    let buffer = mediaLruGet(key);
    if (!buffer) {
      try {
        buffer = await getStorage().getObject(key);
      } catch (storageError) {
        // S3-based drivers keep nothing in media_blobs for NEW uploads, but
        // legacy rows uploaded under the "database" driver still live there.
        if (driver === "r2" || driver === "minio") {
          buffer = await new DatabaseMediaStorage().getObject(key);
        } else {
          throw storageError;
        }
      }
      mediaLruStore(key, buffer);
    }

    const extension = key.split(".").pop()?.toLowerCase() || "";
    const mime = MIME[extension] || "application/octet-stream";
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    };
    // v2.8.67.0 — SVG is an XML document: sandbox it so even a smuggled
    // script can never execute same-origin (uploads are also sanitized).
    if (mime === "image/svg+xml") {
      headers["Content-Security-Policy"] =
        "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    // v2.9.8.0 — Range requests (video playback/seeking): serve 206 slices
    // from the already-buffered object. Browsers send `bytes=start-end` and
    // treat a full 200 as "whole file" — fine for playback, but seeking
    // needs the 206 contract, and Chrome refuses to even start some mp4s
    // when the server never advertises Accept-Ranges.
    const rangeHeader = req.headers.get("range");
    if (rangeHeader && mime.startsWith("video/")) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (match) {
        const total = buffer.length;
        let start = match[1] === "" ? null : Number(match[1]);
        let end = match[2] === "" ? null : Number(match[2]);
        if (start === null && end !== null) {
          // suffix range: bytes=-N → the final N bytes
          start = Math.max(0, total - end);
          end = total - 1;
        } else if (start !== null) {
          if (start >= total) {
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${total}` },
            });
          }
          end = end === null || end >= total ? total - 1 : end;
        }
        if (start !== null && end !== null && end >= start) {
          const slice = buffer.subarray(start, end + 1);
          return new Response(new Uint8Array(slice), {
            status: 206,
            headers: {
              ...headers,
              "Content-Type": mime,
              "Content-Length": String(slice.length),
              "Content-Range": `bytes ${start}-${end}/${total}`,
              "Accept-Ranges": "bytes",
            },
          });
        }
      }
    }
    if (mime.startsWith("video/")) headers["Accept-Ranges"] = "bytes";
    return new Response(new Uint8Array(buffer), { headers });
  } catch {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }
}
