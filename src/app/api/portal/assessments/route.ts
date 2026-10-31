import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  createAssessment,
  getTeacherAssessments,
} from "@/lib/portal-classroom";

export const dynamic = "force-dynamic";

/**
 * PHASE 3.1-e — teacher assessments.
 * GET  → every assessment across the teacher's class×subjects (with roll,
 *        marked count and class average).
 * POST → create one: { classSubjectId, title, term?, maxScore? }.
 * Both are teacher-only; anything else gets 401/403.
 */
export async function GET() {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const assessments = await getTeacherAssessments(session.accountId);
    return NextResponse.json({ ok: true, assessments });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load assessments." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        classSubjectId?: number;
        title?: string;
        term?: string;
        maxScore?: number;
      }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await createAssessment(session.accountId, body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the assessment." },
      { status: 500 },
    );
  }
}
