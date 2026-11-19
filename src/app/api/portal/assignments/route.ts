import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  createAssignment,
  getTeacherAssignments,
} from "@/lib/portal-assignments";

export const dynamic = "force-dynamic";

/**
 * PHASE 3.1-d — teacher assignment hub.
 * GET  → every assignment the signed-in teacher has posted (with counts).
 * POST → create one: { classSubjectId, title, instructions?, dueAt? }.
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
    const assignments = await getTeacherAssignments(session.accountId);
    return NextResponse.json({ ok: true, assignments });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load assignments." },
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
    const result = await createAssignment({
      accountId: session.accountId,
      classSubjectId: Number(body.classSubjectId),
      title: body.title,
      instructions: body.instructions,
      dueAt: body.dueAt,
      linkUrl: body.linkUrl,
      files: body.files,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the assignment." },
      { status: 500 },
    );
  }
}
