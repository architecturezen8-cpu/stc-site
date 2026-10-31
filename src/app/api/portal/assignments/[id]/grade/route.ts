import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { gradeSubmission } from "@/lib/portal-assignments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST a grade for one submission — TEACHER ONLY.
 * Body: { studentId, score?, feedback? }. Re-grading overwrites.
 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const assignmentId = Number((await ctx.params).id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | { studentId?: number; score?: number | string | null; feedback?: string }
    | null;
  if (!body || !Number.isInteger(Number(body.studentId))) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await gradeSubmission({
      accountId: session.accountId,
      assignmentId,
      studentId: Number(body.studentId),
      score: body.score,
      feedback: body.feedback,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the grade." },
      { status: 500 },
    );
  }
}
