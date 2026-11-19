import { NextResponse } from "next/server";
import { guardApi, requireAdminApi } from "@/lib/admin-auth";
import {
  getMaintenanceState,
  setMaintenanceState,
} from "@/lib/maintenance";

export const dynamic = "force-dynamic";

/**
 * MAIN Admin Studio → Settings → Maintenance mode (v2.8.39.0 — moved here
 * from the LMS Admin Studio at the owner's direction: the site-wide curtain
 * belongs to the website back office, not the LMS back office).
 * GET  — current state (any signed-in main admin).
 * POST — toggle + message. Writes the site_settings KV row + audit log
 *        inside setMaintenanceState(). LMS admins keep preview-only access.
 * v2.9.12.1 — POST now requires Settings EDIT (the owner's read-only/viewer
 *        accounts could otherwise flip the whole site's curtain — the only
 *        mutation in the studio that skipped the per-feature guard).
 */
export async function GET() {
  const session = await requireAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getMaintenanceState(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: Request) {
  const session = await guardApi("settings", "edit");
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean | string;
    message?: string;
  };
  const enabled = body.enabled === true || body.enabled === "on";

  try {
    const state = await setMaintenanceState(
      { enabled, message: body.message },
      session.id,
    );
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Could not save the maintenance setting." },
      { status: 500 },
    );
  }
}
