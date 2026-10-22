import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { deleteNotice, updateNotice } from "@/lib/portal-classroom";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE one notice — the teacher who posted it, or the class teacher of
 *  the board it sits on (ownership-checked server-side). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await deleteNotice(session.accountId, id);
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not delete the notice." },
      { status: 500 },
    );
  }
}

/**
 * v2.8.49.0 — Phase 1.2: edit a class notice — POSTER ONLY (server-side
 * checked); undefined = unchanged; the board can move to any class the
 * teacher teaches or leads.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        classId?: number;
        title?: string;
        body?: string;
        linkUrl?: string;
        files?: unknown;
      }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await updateNotice(session.accountId, id, body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the notice." },
      { status: 500 },
    );
  }
}
