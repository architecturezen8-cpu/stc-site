import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  lmsAttendance,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsStudentRecords,
  lmsStudents,
  lmsSubjects,
  lmsTeachers,
} from "@/db/schema-lms";

/* ────────────────────────────────────────────────────────────────────────
   PHASE 3.1-c — ATTENDANCE (v2.8.37.0)

   Teachers mark the daily register for the classes they teach (via
   lms_class_subjects) or lead as class teacher (lms_classes.class_teacher_id).
   One row per (class, student, day) — the unique index makes every save an
   idempotent upsert, so re-marking a day simply corrects it.

   Like every portal read model, all failures degrade to calm empty states.
   ──────────────────────────────────────────────────────────────────────── */

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export function isAttendanceDay(value: unknown): value is string {
  return typeof value === "string" && DAY_RE.test(value);
}

/** Counts present + late as "attended" — the same rule the dashboards use. */
export function attendedCount(statuses: readonly string[]): number {
  return statuses.filter((s) => s === "present" || s === "late").length;
}

/* ── Teacher → markable classes ──────────────────────────────────────── */

export type TeacherClass = {
  id: number;
  name: string;
  grade: string;
  subject: string;
  students: number;
};

export async function getTeacherMarkableClasses(accountId: number): Promise<TeacherClass[]> {
  try {
    await ensureSchemaExtras();
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    if (!teacher) return [];

    const taught = await db
      .select({
        classId: lmsClasses.id,
        name: lmsClasses.name,
        grade: lmsClasses.grade,
        subjectName: lmsSubjects.name,
      })
      .from(lmsClassSubjects)
      .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
      .leftJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
      .where(eq(lmsClassSubjects.teacherId, teacher.id));

    const led = await db
      .select({ classId: lmsClasses.id, name: lmsClasses.name, grade: lmsClasses.grade })
      .from(lmsClasses)
      .where(eq(lmsClasses.classTeacherId, teacher.id));

    const merged = new Map<number, TeacherClass>();
    for (const row of taught) {
      const existing = merged.get(row.classId);
      if (existing) {
        if (row.subjectName && !existing.subject.includes(row.subjectName)) {
          existing.subject = existing.subject ? `${existing.subject}, ${row.subjectName}` : row.subjectName;
        }
      } else {
        merged.set(row.classId, {
          id: row.classId,
          name: row.name,
          grade: row.grade,
          subject: row.subjectName || "Class register",
          students: 0,
        });
      }
    }
    for (const row of led) {
      if (!merged.has(row.classId)) {
        merged.set(row.classId, {
          id: row.classId,
          name: row.name,
          grade: row.grade,
          subject: "Class register",
          students: 0,
        });
      }
    }
    const classes = [...merged.values()];
    if (classes.length === 0) return [];

    const counts = await db
      .select({ classId: lmsEnrollments.classId, count: sql<number>`count(*)::int` })
      .from(lmsEnrollments)
      .where(
        and(
          inArray(
            lmsEnrollments.classId,
            classes.map((c) => c.id),
          ),
          eq(lmsEnrollments.status, "active"),
        ),
      )
      .groupBy(lmsEnrollments.classId);
    for (const c of counts) {
      const entry = merged.get(c.classId);
      if (entry) entry.students = c.count;
    }

    return classes.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  } catch {
    return [];
  }
}

/** May this teacher account open (and mark) this class register? */
export async function assertTeacherClassAccess(accountId: number, classId: number): Promise<boolean> {
  try {
    await ensureSchemaExtras();
    if (!Number.isInteger(classId) || classId <= 0) return false;
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    if (!teacher) return false;

    const [taught] = await db
      .select({ id: lmsClassSubjects.id })
      .from(lmsClassSubjects)
      .where(and(eq(lmsClassSubjects.classId, classId), eq(lmsClassSubjects.teacherId, teacher.id)))
      .limit(1);
    if (taught) return true;

    const [led] = await db
      .select({ id: lmsClasses.id })
      .from(lmsClasses)
      .where(and(eq(lmsClasses.id, classId), eq(lmsClasses.classTeacherId, teacher.id)))
      .limit(1);
    return !!led;
  } catch {
    return false;
  }
}

/* ── Roster (one school day) ─────────────────────────────────────────── */

export type RosterEntry = {
  studentId: number;
  admissionNo: string;
  registerNo: string | null;
  fullName: string;
  status: AttendanceStatus | null;
};

export async function getAttendanceRoster(classId: number, day: string): Promise<RosterEntry[]> {
  try {
    await ensureSchemaExtras();
    if (!Number.isInteger(classId) || classId <= 0 || !isAttendanceDay(day)) return [];
    /* v2.8.40.0 — register number joined from the office admission register
       so teachers can search the roll by admission OR register number. */
    const rows = await db
      .select({
        studentId: lmsStudents.id,
        admissionNo: lmsStudents.admissionNo,
        registerNo: lmsStudentRecords.registerNo,
        fullName: lmsStudents.fullName,
        status: lmsAttendance.status,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
      .leftJoin(lmsStudentRecords, eq(lmsStudentRecords.admissionNo, lmsStudents.admissionNo))
      .leftJoin(
        lmsAttendance,
        and(
          eq(lmsAttendance.studentId, lmsStudents.id),
          eq(lmsAttendance.classId, classId),
          eq(lmsAttendance.day, day),
        ),
      )
      .where(and(eq(lmsEnrollments.classId, classId), eq(lmsEnrollments.status, "active")))
      .orderBy(asc(lmsStudents.fullName));
    return rows.map((row) => ({
      ...row,
      status: isAttendanceStatus(row.status) ? row.status : null,
    }));
  } catch {
    return [];
  }
}

/* ── Save (upsert) ───────────────────────────────────────────────────── */

export type SaveAttendanceInput = {
  classId: number;
  day: string;
  records: { studentId: number; status: string }[];
  markedByAccountId: number;
};

export type SaveAttendanceResult =
  | { ok: true; saved: number }
  | { ok: false; error: "bad_request" | "not_enrolled" | "server_error" };

export async function saveAttendance(input: SaveAttendanceInput): Promise<SaveAttendanceResult> {
  try {
    await ensureSchemaExtras();
    const { classId, day, records, markedByAccountId } = input;
    if (
      !Number.isInteger(classId) ||
      classId <= 0 ||
      !isAttendanceDay(day) ||
      !Array.isArray(records) ||
      records.length === 0 ||
      records.length > 200 ||
      !Number.isInteger(markedByAccountId)
    ) {
      return { ok: false, error: "bad_request" };
    }

    const clean = new Map<number, AttendanceStatus>();
    for (const record of records) {
      const studentId = Number(record?.studentId);
      if (!Number.isInteger(studentId) || studentId <= 0 || !isAttendanceStatus(record?.status)) {
        return { ok: false, error: "bad_request" };
      }
      clean.set(studentId, record.status as AttendanceStatus);
    }

    /* Every marked student must be actively enrolled in THIS class — the
       register can never be stretched over students from another class. */
    const enrolled = await db
      .select({ studentId: lmsEnrollments.studentId })
      .from(lmsEnrollments)
      .where(
        and(
          eq(lmsEnrollments.classId, classId),
          eq(lmsEnrollments.status, "active"),
          inArray(lmsEnrollments.studentId, [...clean.keys()]),
        ),
      );
    if (enrolled.length !== clean.size) {
      return { ok: false, error: "not_enrolled" };
    }

    const rows = [...clean.entries()].map(([studentId, status]) => ({
      classId,
      studentId,
      day,
      status,
      markedByAccountId,
    }));
    await db
      .insert(lmsAttendance)
      .values(rows)
      .onConflictDoUpdate({
        target: [lmsAttendance.classId, lmsAttendance.studentId, lmsAttendance.day],
        set: {
          status: sql`excluded.status`,
          markedByAccountId: sql`excluded.marked_by_account_id`,
        },
      });

    return { ok: true, saved: rows.length };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/* ── Student detail (dashboard panel) ────────────────────────────────── */

export type AttendanceDayView = {
  day: string;
  label: string;
  status: AttendanceStatus;
};

export type AttendanceDetail = {
  pct: number | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  monthPct: number | null;
  recent: AttendanceDayView[];
};

export function emptyAttendanceDetail(): AttendanceDetail {
  return { pct: null, present: 0, absent: 0, late: 0, excused: 0, monthPct: null, recent: [] };
}

export function dayLabelFrom(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(date);
}

export async function getStudentAttendanceDetail(studentId: number): Promise<AttendanceDetail> {
  try {
    await ensureSchemaExtras();
    const rows = await db
      .select({ day: lmsAttendance.day, status: lmsAttendance.status })
      .from(lmsAttendance)
      .where(eq(lmsAttendance.studentId, studentId))
      .orderBy(desc(lmsAttendance.day))
      .limit(180);
    if (rows.length === 0) return emptyAttendanceDetail();

    const detail = emptyAttendanceDetail();
    for (const row of rows) {
      if (row.status === "present") detail.present += 1;
      else if (row.status === "absent") detail.absent += 1;
      else if (row.status === "late") detail.late += 1;
      else if (row.status === "excused") detail.excused += 1;
    }
    detail.pct = Math.round(((detail.present + detail.late) / rows.length) * 100);

    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
    const monthRows = rows.filter((r) => r.day >= monthStart);
    if (monthRows.length > 0) {
      detail.monthPct = Math.round(
        (attendedCount(monthRows.map((r) => r.status)) / monthRows.length) * 100,
      );
    }

    detail.recent = rows.slice(0, 12).map((row) => ({
      day: row.day,
      label: dayLabelFrom(row.day),
      status: isAttendanceStatus(row.status) ? row.status : "excused",
    }));
    return detail;
  } catch {
    return emptyAttendanceDetail();
  }
}

/* ── Parent detail (per child) ───────────────────────────────────────── */

export type ChildAttendanceSummary = {
  pct: number | null;
  absences: number;
  lastAbsentLabel: string | null;
};

export async function getChildAttendanceSummary(studentId: number): Promise<ChildAttendanceSummary> {
  try {
    await ensureSchemaExtras();
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        attended: sql<number>`sum(case when ${lmsAttendance.status} in ('present','late') then 1 else 0 end)::int`,
        absences: sql<number>`sum(case when ${lmsAttendance.status} = 'absent' then 1 else 0 end)::int`,
      })
      .from(lmsAttendance)
      .where(eq(lmsAttendance.studentId, studentId));
    const [lastAbsent] = await db
      .select({ day: lmsAttendance.day })
      .from(lmsAttendance)
      .where(and(eq(lmsAttendance.studentId, studentId), eq(lmsAttendance.status, "absent")))
      .orderBy(desc(lmsAttendance.day))
      .limit(1);

    const total = totals?.total ?? 0;
    return {
      pct: total > 0 ? Math.round(((totals?.attended ?? 0) / total) * 100) : null,
      absences: totals?.absences ?? 0,
      lastAbsentLabel: lastAbsent ? dayLabelFrom(lastAbsent.day) : null,
    };
  } catch {
    return { pct: null, absences: 0, lastAbsentLabel: null };
  }
}

/* ── Class history (v2.8.40.0 — READ-ONLY) ───────────────────────────── */

export type AttendanceHistoryRange = "day" | "week" | "month" | "year";

export type AttendanceHistoryDay = {
  day: string;
  label: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number | null;
};

export type AttendanceHistoryStudent = {
  studentId: number;
  fullName: string;
  admissionNo: string;
  registerNo: string | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number | null;
};

export type AttendanceHistory = {
  range: AttendanceHistoryRange;
  classId: number;
  from: string;
  to: string;
  totals: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    marked: number;
    pct: number | null;
  };
  days: AttendanceHistoryDay[];
  students: AttendanceHistoryStudent[];
};

/** Inclusive from/to window (UTC-safe string math on YYYY-MM-DD Colombo days). */
function historyWindow(range: AttendanceHistoryRange, anchor: string): { from: string; to: string } {
  const base = new Date(`${anchor}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return { from: anchor, to: anchor };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (range === "day") return { from: anchor, to: anchor };
  if (range === "week") {
    const dow = (base.getUTCDay() + 6) % 7; // Monday = 0
    const monday = new Date(base);
    monday.setUTCDate(base.getUTCDate() - dow);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: iso(monday), to: iso(sunday) };
  }
  if (range === "month") {
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    return { from: iso(first), to: iso(last) };
  }
  const first = new Date(Date.UTC(base.getUTCFullYear(), 0, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), 11, 31));
  return { from: iso(first), to: iso(last) };
}

/**
 * Aggregated attendance history for one class over a day/week/month/year
 * window. Strictly a READ MODEL — nothing here can mutate the register;
 * the history route is GET-only and never calls saveAttendance.
 */
export async function getAttendanceHistory(
  classId: number,
  range: AttendanceHistoryRange,
  anchor: string,
): Promise<AttendanceHistory | null> {
  try {
    await ensureSchemaExtras();
    if (!Number.isInteger(classId) || classId <= 0 || !isAttendanceDay(anchor)) return null;
    const { from, to } = historyWindow(range, anchor);

    const rows = await db
      .select({
        day: lmsAttendance.day,
        status: lmsAttendance.status,
        studentId: lmsStudents.id,
        fullName: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
        registerNo: lmsStudentRecords.registerNo,
      })
      .from(lmsAttendance)
      .innerJoin(lmsStudents, eq(lmsAttendance.studentId, lmsStudents.id))
      .leftJoin(lmsStudentRecords, eq(lmsStudentRecords.admissionNo, lmsStudents.admissionNo))
      .where(
        and(
          eq(lmsAttendance.classId, classId),
          sql`${lmsAttendance.day} >= ${from}`,
          sql`${lmsAttendance.day} <= ${to}`,
        ),
      )
      .orderBy(asc(lmsAttendance.day));

    const totals = { present: 0, absent: 0, late: 0, excused: 0, marked: 0 };
    const dayMap = new Map<string, AttendanceHistoryDay>();
    const studentMap = new Map<number, AttendanceHistoryStudent>();

    for (const row of rows) {
      if (!isAttendanceStatus(row.status)) continue;
      totals[row.status] += 1;
      totals.marked += 1;

      let dayEntry = dayMap.get(row.day);
      if (!dayEntry) {
        dayEntry = {
          day: row.day,
          label: dayLabelFrom(row.day),
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          pct: null,
        };
        dayMap.set(row.day, dayEntry);
      }
      dayEntry[row.status] += 1;

      let student = studentMap.get(row.studentId);
      if (!student) {
        student = {
          studentId: row.studentId,
          fullName: row.fullName,
          admissionNo: row.admissionNo,
          registerNo: row.registerNo ?? null,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          pct: null,
        };
        studentMap.set(row.studentId, student);
      }
      student[row.status] += 1;
    }

    for (const dayEntry of dayMap.values()) {
      const sum = dayEntry.present + dayEntry.absent + dayEntry.late + dayEntry.excused;
      dayEntry.pct = sum > 0 ? Math.round(((dayEntry.present + dayEntry.late) / sum) * 100) : null;
    }
    for (const student of studentMap.values()) {
      const sum = student.present + student.absent + student.late + student.excused;
      student.pct = sum > 0 ? Math.round(((student.present + student.late) / sum) * 100) : null;
    }

    return {
      range,
      classId,
      from,
      to,
      totals: {
        ...totals,
        pct: totals.marked > 0 ? Math.round(((totals.present + totals.late) / totals.marked) * 100) : null,
      },
      days: [...dayMap.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
      students: [...studentMap.values()].sort((a, b) =>
        a.fullName.localeCompare(b.fullName, "en", { numeric: true }),
      ),
    };
  } catch {
    return null;
  }
}
