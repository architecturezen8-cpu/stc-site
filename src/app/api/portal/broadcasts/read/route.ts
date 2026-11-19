import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { markAllBroadcastsRead, markBroadcastRead } from "@/lib/school-broadcasts";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.0 — mark school broadcasts read. POST {id} marks one (the card
 * the user opened); POST {all:true} is the "mark all read" button.
 */
export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; all?: unknown }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    if (body.all === true) {
      const marked = await markAllBroadcastsRead(session.accountId, session.role);
      return NextResponse.json({ ok: true, marked });
    }
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "A broadcast id (or all:true) is required." },
        { status: 400 },
      );
    }
    await markBroadcastRead(session.accountId, session.role, id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the read state." },
      { status: 500 },
    );
  }
}
