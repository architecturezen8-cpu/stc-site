import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  getTeacherAssignmentDetail,
  updateAssignment,
} from "@/lib/portal-assignments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET one assignment's register — TEACHER ONLY.
 * Returns the class roster joined with submissions: who submitted, when,
 * the late flag, the text, and any grade already recorded.
 */
export async function GET(_req: Request, ctx: Ctx) {
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
    const detail = await getTeacherAssignmentDetail(session.accountId, id);
    if (!detail) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, detail });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the submissions." },
      { status: 500 },
    );
  }
}

/**
 * v2.8.49.0 — Phase 1.2: edit a posted assignment. Every field is optional
 * (undefined = unchanged); the server re-checks ownership and locks the
 * class×subject move once students have submitted.
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
        classSubjectId?: number;
        title?: string;
        instructions?: string;
        dueAt?: string;
        linkUrl?: string;
        files?: unknown;
      }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await updateAssignment({
      accountId: session.accountId,
      assignmentId: id,
      classSubjectId: body.classSubjectId,
      title: body.title,
      instructions: body.instructions,
      dueAt: body.dueAt,
      linkUrl: body.linkUrl,
      files: body.files,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the assignment." },
      { status: 500 },
    );
  }
}
