import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { getBroadcastUnreadCount } from "@/lib/school-broadcasts";
import type { LmsPortalRole } from "@/db/schema-lms";

export const dynamic = "force-dynamic";

/**
 * v2.8.76.0 — the LOGOUT unread counter (owner ask).
 *
 * When a portal user presses Sign out and they still have unread school
 * notifications, the shell pops a small "you have N unread" card BEFORE
 * the session dies. The card shows the NUMBER ONLY — never a title, never
 * a body, never a sender ("habai monada messages kiyala show wenna one
 * na"). This endpoint returns exactly that number and nothing else, so
 * the privacy promise is enforced server-side too: no item list, no
 * titles, no timestamps — just { unread: n }.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const unread = await getBroadcastUnreadCount(
      session.accountId,
      session.role as LmsPortalRole,
    );
    return NextResponse.json({ ok: true, unread });
  } catch {
    return NextResponse.json({ ok: false, error: "count_failed" }, { status: 500 });
  }
}
