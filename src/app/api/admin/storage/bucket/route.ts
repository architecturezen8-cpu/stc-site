import { NextResponse } from "next/server";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { getMediaBucketUsage } from "@/lib/bucket-usage";

export const dynamic = "force-dynamic";

/**
 * v2.8.69.0 — the Backblaze B2 bucket tracker for the Storage panels
 * (main Admin Studio reads it; the endpoint answers both studios through the
 * shared guard). ?force=1 walks the bucket again instead of serving the
 * 15-minute cache.
 */
export async function GET(req: Request) {
  const admin = await guardPortalOrLmsAdmin("read");
  if (admin instanceof NextResponse) return admin;

  const force = new URL(req.url).searchParams.get("force") === "1";
  const payload = await getMediaBucketUsage(force);
  return NextResponse.json(payload, {
    status: payload.ok ? 200 : 400,
    headers: { "cache-control": "no-store" },
  });
}
