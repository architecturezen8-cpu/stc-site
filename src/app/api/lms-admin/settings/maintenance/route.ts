import { NextResponse } from "next/server";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import {
  getMaintenanceState,
  setMaintenanceState,
} from "@/lib/maintenance";

export const dynamic = "force-dynamic";

/**
 * LMS Admin Studio → Settings → Maintenance mode.
 * GET  — current state (any studio session).
 * POST — toggle + message (any studio session; every studio admin is a
 *        maintainer by design). Writes the site_settings KV row and the
 *        audit log inside setMaintenanceState().
 */
export async function GET() {
  const session = await getLmsAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getMaintenanceState(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: Request) {
  const session = await getLmsAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean | string;
    message?: string;
  };
  const enabled = body.enabled === true || body.enabled === "on";

  try {
    const state = await setMaintenanceState(
      { enabled, message: body.message },
      session.accountId,
    );
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Could not save the maintenance setting." },
      { status: 500 },
    );
  }
}
