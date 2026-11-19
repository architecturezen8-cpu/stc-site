import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  deleteAssessment,
  getTeacherAssessmentDetail,
} from "@/lib/portal-classroom";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * One assessment's marks register — TEACHER ONLY (ownership-checked).
 * GET    → the class roster joined LEFT with marks (unmarked students stay
 *          visible with score null).
 * DELETE → removes the assessment AND its marks (the teacher's own class
 *          only).
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
    const detail = await getTeacherAssessmentDetail(session.accountId, id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, detail });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the marks register." },
      { status: 500 },
    );
  }
}

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
    const result = await deleteAssessment(session.accountId, id);
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not delete the assessment." },
      { status: 500 },
    );
  }
}
