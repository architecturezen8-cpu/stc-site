import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { upsertStudentSubmission } from "@/lib/portal-assignments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST the student's answer — STUDENT ONLY.
 * Body: { contentText?, linkUrl?, files? } — any combination counts, as long
 * as ONE of them is present. Idempotent re-submit while ungraded (the whole
 * attachment set is replaced); the late flag is recomputed against the due
 * date on every save; graded work is locked.
 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await getPortalSession("student");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "student") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const assignmentId = Number((await ctx.params).id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | { contentText?: string; linkUrl?: string; files?: unknown }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await upsertStudentSubmission({
      accountId: session.accountId,
      assignmentId,
      contentText: body.contentText,
      linkUrl: body.linkUrl,
      files: body.files,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the submission." },
      { status: 500 },
    );
  }
}
