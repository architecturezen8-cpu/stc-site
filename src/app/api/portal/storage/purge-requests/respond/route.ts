import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { respondPurgeRequest } from "@/lib/storage-consent";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.3 — the portal owner answers a storage-purge consent request.
 * POST {id, accept:boolean}. Only the request's own account may answer,
 * and only while it is still pending.
 */
export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; accept?: unknown }
    | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0 || typeof body?.accept !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "A request id and an accept flag are required." },
      { status: 400 },
    );
  }

  try {
    const result = await respondPurgeRequest(id, session.accountId, body.accept);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save your answer." },
      { status: 500 },
    );
  }
}
