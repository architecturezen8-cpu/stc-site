import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { saveAssessmentMarks } from "@/lib/portal-classroom";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST the marks register for ONE assessment — TEACHER ONLY.
 * Body: { marks: [{ studentId, score: number|null }, …] } — a BULK save,
 * upserted on the (assessment, student) unique index so re-saving a
 * register simply corrects it. Empty score clears the mark. Every student
 * must be actively enrolled in the assessment's class (403 otherwise).
 */
export async function POST(req: Request, ctx: Ctx) {
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
    | { marks?: unknown }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await saveAssessmentMarks(session.accountId, id, body.marks);
    if (!result.ok) {
      return NextResponse.json(
        result,
        { status: result.error === "not_found" ? 404 : result.error === "not_enrolled" ? 403 : 400 },
      );
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the marks." },
      { status: 500 },
    );
  }
}
