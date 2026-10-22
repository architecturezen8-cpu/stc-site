import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createNotice, getTeacherNotices } from "@/lib/portal-classroom";

export const dynamic = "force-dynamic";

/**
 * PHASE 3.1-e — class notices posting.
 * GET  → every notice on the boards of classes the teacher teaches or leads.
 * POST → { classId, title, body } — lands on the class's notice board and
 *        shows up on the student / parent / teacher dashboards instantly.
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
    const notices = await getTeacherNotices(session.accountId);
    return NextResponse.json({ ok: true, notices });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load notices." },
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
    const result = await createNotice(session.accountId, body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the notice." },
      { status: 500 },
    );
  }
}
