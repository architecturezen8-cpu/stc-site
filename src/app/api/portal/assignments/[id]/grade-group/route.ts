import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { gradeGroupSubmission } from "@/lib/portal-assignments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST a grade for ONE GROUP — TEACHER ONLY (Phase 4.1).
 * Body: { groupId, score?, feedback?, adjustments?: [{studentId, adjustment}] }.
 * The score is the group's mark; the optional per-student adjustments are
 * deltas applied on top of it for each member's final mark. Re-grading
 * overwrites.
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
    | {
        groupId?: number;
        score?: number | string | null;
        feedback?: string;
        adjustments?: { studentId: number; adjustment?: number | string | null }[];
      }
    | null;
  if (!body || !Number.isInteger(Number(body.groupId))) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await gradeGroupSubmission({
      accountId: session.accountId,
      assignmentId,
      groupId: Number(body.groupId),
      score: body.score,
      feedback: body.feedback,
      adjustments: body.adjustments,
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
