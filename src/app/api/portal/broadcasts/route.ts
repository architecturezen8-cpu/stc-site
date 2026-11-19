import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { getBroadcastsFor } from "@/lib/school-broadcasts";
import { listPurgeRequestsFor } from "@/lib/storage-consent";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.0 — the portal side of SCHOOL BROADCASTS.
 * GET ?filter=all|unread|read → the broadcasts this account's audience
 * allows, each with its read stamp, plus the unread total. The owner's
 * "notification read karana side ekenuth filter karala read karanna"
 * request — the tabs live in the widget, the filtering happens here.
 *
 * v2.8.70.3 — the response also carries the account's OPEN storage-purge
 * consent requests, so the notifications panel is where the "message"
 * from the LMS admin lands.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("filter");
  const filter = raw === "unread" || raw === "read" ? raw : "all";

  try {
    const [data, consents] = await Promise.all([
      getBroadcastsFor(session.accountId, session.role, filter),
      listPurgeRequestsFor(session.accountId),
    ]);
    return NextResponse.json({ ok: true, ...data, consents });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load notifications." },
      { status: 500 },
    );
  }
}
