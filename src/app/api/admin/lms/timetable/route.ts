import { NextResponse } from "next/server";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import {
  getTimetableWeek,
  writeTimetableSlotAdmin,
  type SlotWrite,
} from "@/lib/portal-timetable";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────
   LMS Admin → Timetable (v2.8.55.0 — owner item 3)

   The studio's timetable endpoint. Same contract as the teacher portal's
   /api/portal/timetable, but the pen belongs to the studio:

     GET  /api/admin/lms/timetable?classId=1 → one class's full week
          payload (slots + subject options + every teacher)
     POST /api/admin/lms/timetable           → upsert ONE lesson
          {classId, dayOfWeek(1–5), periodNo(1–8), subjectId, teacherId,
           room, customLabel?} — subjectId null CLEARS the cell (free
           period) unless customLabel names a subject-less activity.

   Guard: guardPortalOrLmsAdmin — an LMS admin studio session OR a website
   admin with the "portal" module permission. Students and teachers have no
   door here.
   ──────────────────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const auth = await guardPortalOrLmsAdmin("read");
  if (auth instanceof NextResponse) return auth;

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
  const auth = await guardPortalOrLmsAdmin("edit");
  if (auth instanceof NextResponse) return auth;

  let body: Partial<SlotWrite> | null = null;
  try {
    body = (await req.json()) as Partial<SlotWrite>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const result = await writeTimetableSlotAdmin({
    classId: Number(body.classId),
    dayOfWeek: Number(body.dayOfWeek),
    periodNo: Number(body.periodNo),
    subjectId: body.subjectId == null ? null : Number(body.subjectId),
    teacherId: body.teacherId == null ? null : Number(body.teacherId),
    room: typeof body.room === "string" ? body.room : null,
    customLabel: typeof body.customLabel === "string" ? body.customLabel : null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
