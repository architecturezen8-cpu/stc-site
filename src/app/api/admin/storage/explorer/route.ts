import { NextResponse } from "next/server";

import { guardApi } from "@/lib/admin-auth";
import { explorePrefix, prefixStats, sanitizeExplorerPrefix } from "@/lib/storage-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — the Storage Explorer read side (main Admin Studio).
 *
 * GET /api/admin/storage/explorer?prefix=lms-work/&stats=1[&force=1]
 * - ONE delimited ListObjectsV2 listing of the prefix (folders + files),
 *   served from a 3-minute cache unless force=1;
 * - with stats=1, adds the per-top-level-prefix usage breakdown (15-minute
 *   cache) for the strip next to the bucket tracker.
 *
 * Guarded like the other /api/admin routes: a valid admin session with at
 * least "storage" read. The prefix is sanitized (no "..", no leading "/")
 * before it ever reaches S3.
 */
export async function GET(req: Request) {
  const denied = await guardApi("storage", "read");
  if (denied instanceof NextResponse) return denied;

  const url = new URL(req.url);
  const prefix = sanitizeExplorerPrefix(url.searchParams.get("prefix"));
  if (prefix === null) {
    return NextResponse.json(
      { ok: false, error: "Unsafe prefix — it cannot be browsed." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const force = url.searchParams.get("force") === "1";
  const withStats = url.searchParams.get("stats") === "1";

  const listing = await explorePrefix(prefix, { force });
  if (!listing.ok) {
    return NextResponse.json(listing, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }

  let stats = null;
  let statsError: string | null = null;
  if (withStats) {
    const result = await prefixStats({ force });
    if (result.ok) {
      stats = result;
    } else {
      statsError = result.error;
    }
  }

  return NextResponse.json(
    { ...listing, stats, statsError },
    { headers: { "cache-control": "no-store" } },
  );
}
