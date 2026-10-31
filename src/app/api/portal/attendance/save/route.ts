import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { assertTeacherClassAccess, saveAttendance } from "@/lib/portal-attendance";

export const dynamic = "force-dynamic";

/**
 * Save (upsert) one class register for one school day — TEACHER ONLY.
 * POST { classId, day, records: [{ studentId, status }] }
 * Statuses: present | absent | late | excused. Re-marking a day corrects it.
 */
export async function POST(req: Request) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: {
    classId?: number;
    day?: string;
    records?: { studentId?: number; status?: string }[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const classId = Number(body.classId);
  const day = typeof body.day === "string" ? body.day : "";
  if (!Number.isInteger(classId) || classId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    if (!(await assertTeacherClassAccess(session.accountId, classId))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const result = await saveAttendance({
      classId,
      day,
      records: (body.records ?? []).map((r) => ({
        studentId: Number(r?.studentId),
        status: String(r?.status ?? ""),
      })),
      markedByAccountId: session.accountId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.error === "bad_request" ? 400 : 403 },
      );
    }
    return NextResponse.json(
      { ok: true, saved: result.saved, classId, day },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
