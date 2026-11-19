import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { assertTeacherClassAccess, getAttendanceRoster, isAttendanceDay } from "@/lib/portal-attendance";

export const dynamic = "force-dynamic";

/**
 * Class register for one school day — TEACHER ONLY.
 * GET /api/portal/attendance/roster?classId=1&day=2026-10-18
 * The session's teacher must teach (or lead) the class; anything else is 403.
 */
export async function GET(req: Request) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const classId = Number(url.searchParams.get("classId"));
  const day = url.searchParams.get("day") ?? "";
  if (!Number.isInteger(classId) || classId <= 0 || !isAttendanceDay(day)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    if (!(await assertTeacherClassAccess(session.accountId, classId))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const students = await getAttendanceRoster(classId, day);
    return NextResponse.json(
      { ok: true, classId, day, students },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
