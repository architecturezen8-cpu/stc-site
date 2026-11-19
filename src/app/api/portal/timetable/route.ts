import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import {
  getTimetableWeek,
  writeTimetableSlot,
  type SlotWrite,
} from "@/lib/portal-timetable";

export const dynamic = "force-dynamic";

/**
 * PHASE 3.1 (v2.8.54.0) — the timetable editor's API. TEACHER-ONLY:
 *
 *   GET  /api/portal/timetable?classId=1  → one class's full week payload
 *        (slots + the class's subject options + every teacher) for the
 *        editor grid.
 *   POST /api/portal/timetable            → upsert ONE lesson
 *        {classId, dayOfWeek(1–5), periodNo(1–8), subjectId, teacherId,
 *         room, customLabel?} — subjectId null CLEARS the cell (free
 *         period) unless customLabel names a subject-less activity
 *         (v2.8.55.0: "Outside Activity" and friends).
 *
 * Session resolution honors the islands' `x-portal-role` hint (one browser
 * may hold several role cookies). Students and parents have no write path
 * here — students read their week through their own SSR page.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const classId = Number(new URL(req.url).searchParams.get("classId"));
  if (!Number.isFinite(classId) || classId <= 0) {
    return NextResponse.json(
      { ok: false, error: "classId query parameter is required." },
      { status: 400 },
    );
  }

  const week = await getTimetableWeek(classId);
  if (!week) {
    return NextResponse.json({ ok: false, error: "Class not found." }, { status: 404 });
  }
  return NextResponse.json(week, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Partial<SlotWrite> | null = null;
  try {
    body = (await req.json()) as Partial<SlotWrite>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const result = await writeTimetableSlot(
    {
      classId: Number(body.classId),
      dayOfWeek: Number(body.dayOfWeek),
      periodNo: Number(body.periodNo),
      subjectId: body.subjectId == null ? null : Number(body.subjectId),
      teacherId: body.teacherId == null ? null : Number(body.teacherId),
      room: typeof body.room === "string" ? body.room : null,
      /* v2.8.55.0 — the free-text name for subject-less (custom) periods. */
      customLabel: typeof body.customLabel === "string" ? body.customLabel : null,
    },
    session.accountId,
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
