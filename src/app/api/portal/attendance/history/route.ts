import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  assertTeacherClassAccess,
  getAttendanceHistory,
  isAttendanceDay,
  type AttendanceHistoryRange,
} from "@/lib/portal-attendance";

export const dynamic = "force-dynamic";

const RANGES: AttendanceHistoryRange[] = ["day", "week", "month", "year"];

/**
 * v2.8.40.0 — attendance history for one class, READ-ONLY.
 * GET /api/portal/attendance/history?classId=1&range=week&anchor=2026-01-30
 * Ranges: day | week | month | year (anchor = any date inside the window).
 * GET-only by design: the owner asked for history that teachers can look at
 * but never rewrite — past registers stay on the class-teacher's desk.
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
  const rangeParam = url.searchParams.get("range") ?? "week";
  const anchor = url.searchParams.get("anchor") ?? "";
  if (
    !Number.isInteger(classId) ||
    classId <= 0 ||
    !isAttendanceDay(anchor) ||
    !(RANGES as string[]).includes(rangeParam)
  ) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    if (!(await assertTeacherClassAccess(session.accountId, classId))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const history = await getAttendanceHistory(
      classId,
      rangeParam as AttendanceHistoryRange,
      anchor,
    );
    if (!history) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    return NextResponse.json(
      { ok: true, history },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
