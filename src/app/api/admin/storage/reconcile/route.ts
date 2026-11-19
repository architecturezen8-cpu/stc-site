import { NextResponse } from "next/server";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { getStorageReconciliation } from "@/lib/storage-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.9.15.6 — the Storage page's TRUTH CHECK: bucket ↔ database
 * reconciliation for the profile-photo family. GET
 * /api/admin/storage/reconcile?force=1 re-walks immediately; otherwise a
 * 5-minute cache answers. Guarded at the storage READ level for BOTH
 * studios (the main admin studio and the LMS-admin studio feed off this
 * route, exactly like /api/admin/storage does).
 */
export async function GET(req: Request) {
  const session = await guardPortalOrLmsAdmin("read", "storage");
  if (session instanceof NextResponse) return session;

  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await getStorageReconciliation(force);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
