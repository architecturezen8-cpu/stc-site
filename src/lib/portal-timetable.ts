import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  TIMETABLE_CUSTOM_MAX,
  TIMETABLE_DAYS,
  TIMETABLE_MAX_PERIOD,
  TIMETABLE_MIN_PERIOD,
  TIMETABLE_PERIODS,
  TIMETABLE_ROOM_MAX,
} from "@/lib/timetable-shared";
import {
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsPortalAccounts,
  lmsStudents,
  lmsSubjects,
  lmsTeachers,
  lmsTimetableSlots,
} from "@/db/schema-lms";

/**
 * PHASE 3.1 (v2.8.54.0) — the class timetable.
 *
 * One row in `lms_timetable_slots` = one lesson: class × day × period, with
 * its subject, teacher and room. The 100 demo rows (5 classes × Mon–Fri ×
 * periods 1–4) were seeded earlier; this phase adds the EDITOR (the teacher
 * portal fills the grid, any cell can also be a free period) and the
 * student's full-week read view. Every failure mode degrades to calm empty
 * states — the portal's crash-proof house style.
 *
 * v2.8.55.0 — round 2 on the owner's seven notes:
 * · CUSTOM periods — a slot may carry a free-text name instead of a subject
 *   ("Outside Activity", assemblies…): custom_label on the same row.
 * · THE LMS ADMIN PEN — /lms-admin/timetable writes through the same lib
 *   minus the teacher-ownership check (the admin holds the master pen).
 * · THE TEACHER'S PERSONAL WEEK — derived straight from the class
 *   timetables (every slot where they are the teacher), so office-made
 *   assignments AND relief cover land in the teacher's own timetable and
 *   the students' class grid from ONE source of truth — no second table,
 *   nothing to sync by hand.
 */

/** The school week — Monday (1) to Friday (5). */
export {
  TIMETABLE_DAYS,
  TIMETABLE_MAX_PERIOD,
  TIMETABLE_MIN_PERIOD,
  TIMETABLE_PERIODS,
  TIMETABLE_ROOM_MAX,
};

export type TimetableClassOption = {
  id: number;
  name: string;
  grade: string;
  section: string | null;
  academicYear: string;
  /** v2.8.54.0 — the ownership pen: THIS teacher teaches or leads it. */
  editable: boolean;
};

export type TimetableSlotRow = {
  id: number;
  dayOfWeek: number;
  periodNo: number;
  subjectId: number | null;
  subjectName: string | null;
  subjectCode: string | null;
  teacherId: number | null;
  teacherName: string | null;
  room: string | null;
  /** v2.8.55.0 — set when the period has NO subject (custom activity). */
  customLabel: string | null;
};

export type TimetableTeacherOption = {
  id: number;
  name: string;
  designation: string;
};

export type TimetableSubjectOption = {
  /** lms_class_subjects.id — the class offers this subject. */
  csId: number;
  subjectId: number;
  name: string;
  code: string | null;
  /** The teacher the office assigned to this class×subject (the editor
      pre-picks it when the subject is chosen). */
  teacherId: number | null;
  teacherName: string | null;
};

export type TimetableClassInfo = Omit<TimetableClassOption, "editable">;

export type TimetableWeek = {
  ok: true;
  class: TimetableClassInfo;
  slots: TimetableSlotRow[];
  subjects: TimetableSubjectOption[];
  teachers: TimetableTeacherOption[];
};

async function teacherOptions(): Promise<TimetableTeacherOption[]> {
  const rows = await db
    .select({
      id: lmsTeachers.id,
      name: lmsPortalAccounts.fullName,
      designation: lmsTeachers.designation,
    })
    .from(lmsTeachers)
    .leftJoin(lmsPortalAccounts, eq(lmsTeachers.accountId, lmsPortalAccounts.id))
    .orderBy(asc(lmsPortalAccounts.fullName));
  return rows.map((t) => ({
    id: t.id,
    name: t.name || `Teacher #${t.id}`,
    designation: t.designation || "Teacher",
  }));
}

async function classOptions(): Promise<Omit<TimetableClassOption, "editable">[]> {
  const rows = await db
    .select({
      id: lmsClasses.id,
      name: lmsClasses.name,
      grade: lmsClasses.grade,
      section: lmsClasses.section,
      academicYear: lmsClasses.academicYear,
    })
    .from(lmsClasses)
    .orderBy(asc(lmsClasses.grade), asc(lmsClasses.section), asc(lmsClasses.id));
  /* grade is TEXT — "10" sorts before "6" alphabetically, so re-order
     numerically here (non-numeric grades like QA keep their relative end). */
  const gradeNum = (g: string): number => {
    const n = parseInt(g, 10);
    return Number.isFinite(n) ? n : 999;
  };
  return rows
    .filter((c) => !c.name.toLowerCase().startsWith("qa "))
    .sort(
      (a, b) =>
        gradeNum(a.grade) - gradeNum(b.grade) ||
        (a.section ?? "").localeCompare(b.section ?? "") ||
        a.id - b.id,
    );
}

/** v2.8.55.0 — the LMS ADMIN's class list: EVERY class is editable (the
    studio holds the master pen; the same grade order applies). */
export async function listTimetableClassesForAdmin(): Promise<
  TimetableClassOption[]
> {
  try {
    await ensureSchemaExtras();
    const base = await classOptions();
    return base.map((c) => ({ ...c, editable: true }));
  } catch {
    return [];
  }
}

/** Every class the editor can open — newest register first is not a thing
    here; grade order reads like the school's own hand timetable. Each row
    carries whether THIS teacher holds the pen (teaches or leads it). */
export async function listTimetableClasses(
  accountId: number,
): Promise<TimetableClassOption[]> {
  try {
    await ensureSchemaExtras();
    const base = await classOptions();
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    if (!teacher) return base.map((c) => ({ ...c, editable: false }));
    const [taught, led] = await Promise.all([
      db
        .select({ classId: lmsClassSubjects.classId })
        .from(lmsClassSubjects)
        .where(eq(lmsClassSubjects.teacherId, teacher.id)),
      db
        .select({ id: lmsClasses.id })
        .from(lmsClasses)
        .where(eq(lmsClasses.classTeacherId, teacher.id)),
    ]);
    const pen = new Set<number>([
      ...taught.map((t) => t.classId),
      ...led.map((l) => l.id),
    ]);
    return base.map((c) => ({ ...c, editable: pen.has(c.id) }));
  } catch {
    return [];
  }
}

async function weekFor(classId: number): Promise<TimetableWeek | null> {
  const [cls] = await db
    .select({
      id: lmsClasses.id,
      name: lmsClasses.name,
      grade: lmsClasses.grade,
      section: lmsClasses.section,
      academicYear: lmsClasses.academicYear,
    })
    .from(lmsClasses)
    .where(eq(lmsClasses.id, classId))
    .limit(1);
  if (!cls) return null;

  const [slots, subjects, teachers] = await Promise.all([
    db
      .select({
        id: lmsTimetableSlots.id,
        dayOfWeek: lmsTimetableSlots.dayOfWeek,
        periodNo: lmsTimetableSlots.periodNo,
        subjectId: lmsTimetableSlots.subjectId,
        subjectName: lmsSubjects.name,
        subjectCode: lmsSubjects.code,
        teacherId: lmsTimetableSlots.teacherId,
        room: lmsTimetableSlots.room,
        teacherName: lmsPortalAccounts.fullName,
        customLabel: lmsTimetableSlots.customLabel,
      })
      .from(lmsTimetableSlots)
      .leftJoin(lmsSubjects, eq(lmsTimetableSlots.subjectId, lmsSubjects.id))
      .leftJoin(lmsTeachers, eq(lmsTimetableSlots.teacherId, lmsTeachers.id))
      .leftJoin(lmsPortalAccounts, eq(lmsTeachers.accountId, lmsPortalAccounts.id))
      .where(eq(lmsTimetableSlots.classId, classId))
      .orderBy(asc(lmsTimetableSlots.periodNo), asc(lmsTimetableSlots.dayOfWeek)),
    db
      .select({
        csId: lmsClassSubjects.id,
        subjectId: lmsSubjects.id,
        name: lmsSubjects.name,
        code: lmsSubjects.code,
        teacherId: lmsClassSubjects.teacherId,
        teacherName: lmsPortalAccounts.fullName,
      })
      .from(lmsClassSubjects)
      .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
      .leftJoin(lmsTeachers, eq(lmsClassSubjects.teacherId, lmsTeachers.id))
      .leftJoin(lmsPortalAccounts, eq(lmsTeachers.accountId, lmsPortalAccounts.id))
      .where(eq(lmsClassSubjects.classId, classId))
      .orderBy(asc(lmsSubjects.name)),
    teacherOptions(),
  ]);

  return {
    ok: true,
    class: cls,
    slots: slots.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      periodNo: s.periodNo,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      teacherId: s.teacherId,
      teacherName: s.teacherName,
      room: s.room,
      customLabel: s.customLabel,
    })),
    subjects,
    teachers,
  };
}

/** The signed-in teacher's person id (the editor rings THEIR lessons). */
export async function getTeacherPersonId(
  accountId: number,
): Promise<number | null> {
  try {
    const [t] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    return t?.id ?? null;
  } catch {
    return null;
  }
}

/** The editor payload for one class (teacher portal). */
export async function getTimetableWeek(
  classId: number,
): Promise<TimetableWeek | null> {
  try {
    await ensureSchemaExtras();
    return await weekFor(classId);
  } catch {
    return null;
  }
}

export type StudentTimetableView = {
  ok: true;
  class: { id: number; name: string; academicYear: string | null } | null;
  week: TimetableWeek | null;
};

/** The signed-in student's own class week (student portal, read-only). */
export async function getStudentTimetable(
  accountId: number,
): Promise<StudentTimetableView> {
  const empty: StudentTimetableView = { ok: true, class: null, week: null };
  try {
    await ensureSchemaExtras();
    const [student] = await db
      .select({ id: lmsStudents.id })
      .from(lmsStudents)
      .where(eq(lmsStudents.accountId, accountId))
      .limit(1);
    if (!student) return empty;

    const [enrollment] = await db
      .select({
        classId: lmsClasses.id,
        name: lmsClasses.name,
        academicYear: lmsClasses.academicYear,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsClasses, eq(lmsEnrollments.classId, lmsClasses.id))
      .where(
        and(
          eq(lmsEnrollments.studentId, student.id),
          eq(lmsEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (!enrollment) return empty;

    const week = await weekFor(enrollment.classId);
    return {
      ok: true,
      class: {
        id: enrollment.classId,
        name: enrollment.name,
        academicYear: enrollment.academicYear,
      },
      week,
    };
  } catch {
    return empty;
  }
}

/* ── v2.8.55.0 — the teacher's PERSONAL teaching week ─────────────────── */

export type TeachingWeekSlot = {
  dayOfWeek: number;
  periodNo: number;
  /** Subject name, or the custom label for subject-less periods. */
  label: string | null;
  isCustom: boolean;
  className: string | null;
  room: string | null;
};

export type TeachingWeek = {
  ok: true;
  slots: TeachingWeekSlot[];
};

/**
 * The signed-in teacher's OWN timetable, DERIVED (owner item 4: the office
 * — the LMS admin — creates the class timetables, so the teacher's week is
 * computed from every slot where they are the named teacher). Relief cover
 * assigned by the office lands here automatically too — one source of
 * truth, nothing to sync by hand (owner item 7).
 */
export async function getTeacherTeachingWeek(
  accountId: number,
): Promise<TeachingWeek> {
  const empty: TeachingWeek = { ok: true, slots: [] };
  try {
    await ensureSchemaExtras();
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    if (!teacher) return empty;

    const rows = await db
      .select({
        dayOfWeek: lmsTimetableSlots.dayOfWeek,
        periodNo: lmsTimetableSlots.periodNo,
        subjectName: lmsSubjects.name,
        customLabel: lmsTimetableSlots.customLabel,
        className: lmsClasses.name,
        room: lmsTimetableSlots.room,
      })
      .from(lmsTimetableSlots)
      .leftJoin(lmsSubjects, eq(lmsTimetableSlots.subjectId, lmsSubjects.id))
      .innerJoin(lmsClasses, eq(lmsTimetableSlots.classId, lmsClasses.id))
      .where(eq(lmsTimetableSlots.teacherId, teacher.id))
      .orderBy(
        asc(lmsTimetableSlots.dayOfWeek),
        asc(lmsTimetableSlots.periodNo),
      );

    return {
      ok: true,
      slots: rows.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        periodNo: r.periodNo,
        label: r.subjectName || r.customLabel || null,
        isCustom: !r.subjectName && !!r.customLabel,
        className: r.className,
        room: r.room,
      })),
    };
  } catch {
    return empty;
  }
}

/* ── Mutation ──────────────────────────────────────────────────────────── */

export type SlotWrite = {
  classId: number;
  dayOfWeek: number;
  periodNo: number;
  /** null clears the cell — UNLESS customLabel is set (custom period). */
  subjectId: number | null;
  teacherId: number | null;
  room: string | null;
  /** v2.8.55.0 — the free-text name for a subject-less period. */
  customLabel?: string | null;
};

export type SlotWriteResult =
  | { ok: true; cleared: boolean; slot: TimetableSlotRow | null }
  | { ok: false; status: number; error: string };

/**
 * THE OWNERSHIP CONTRACT (the recorded work-list: "class-teachers edit
 * their own (server-checked)"): a teacher may write a class's timetable
 * only when they TEACH it (a class_subjects row) or LEAD it
 * (class_teacher_id). Browsing (GET) stays open to every teacher —
 * timetables are not secret — but the pen is server-checked.
 */
export async function canEditTimetable(
  accountId: number,
  classId: number,
): Promise<boolean> {
  try {
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    if (!teacher) return false;
    const [taught] = await db
      .select({ id: lmsClassSubjects.id })
      .from(lmsClassSubjects)
      .where(
        and(
          eq(lmsClassSubjects.classId, classId),
          eq(lmsClassSubjects.teacherId, teacher.id),
        ),
      )
      .limit(1);
    if (taught) return true;
    const [led] = await db
      .select({ id: lmsClasses.id })
      .from(lmsClasses)
      .where(
        and(
          eq(lmsClasses.id, classId),
          eq(lmsClasses.classTeacherId, teacher.id),
        ),
      )
      .limit(1);
    return Boolean(led);
  } catch {
    return false;
  }
}

/** The shared write path — existence, validation and the upsert, WITHOUT
    any ownership decision. Both callers (teacher pen, admin pen) run this
    after their own authorization, so the contract stays identical. */
async function applySlotWrite(input: SlotWrite): Promise<SlotWriteResult> {
  try {
    await ensureSchemaExtras();

    const classId = Math.trunc(input.classId);
    const dayOfWeek = Math.trunc(input.dayOfWeek);
    const periodNo = Math.trunc(input.periodNo);

    if (!Number.isFinite(classId) || classId <= 0)
      return { ok: false, status: 400, error: "Invalid class." };

    const [cls] = await db
      .select({ id: lmsClasses.id })
      .from(lmsClasses)
      .where(eq(lmsClasses.id, classId))
      .limit(1);
    if (!cls) return { ok: false, status: 404, error: "Class not found." };

    if (!TIMETABLE_DAYS.some((d) => d.dow === dayOfWeek))
      return { ok: false, status: 400, error: "Day must be Monday–Friday (1–5)." };
    if (!TIMETABLE_PERIODS.includes(periodNo as (typeof TIMETABLE_PERIODS)[number]))
      return {
        ok: false,
        status: 400,
        error: `Period must be ${TIMETABLE_MIN_PERIOD}–${TIMETABLE_MAX_PERIOD}.`,
      };

    const room =
      typeof input.room === "string"
        ? input.room.trim().slice(0, TIMETABLE_ROOM_MAX) || null
        : null;
    const customLabel =
      typeof input.customLabel === "string"
        ? input.customLabel.trim().slice(0, TIMETABLE_CUSTOM_MAX) || null
        : null;

    /* Resolve + validate the teacher (optional on every path — relief
        cover, office-run periods and custom activities may name nobody). */
    let teacherId: number | null = null;
    if (input.teacherId != null) {
      teacherId = Math.trunc(input.teacherId);
      const [teacher] = await db
        .select({ id: lmsTeachers.id })
        .from(lmsTeachers)
        .where(eq(lmsTeachers.id, teacherId))
        .limit(1);
      if (!teacher) return { ok: false, status: 400, error: "Unknown teacher." };
    }

    /* No subject: a CUSTOM period (label required) or a CLEAR — the row
        goes away entirely; dashboards then show "Free". */
    if (input.subjectId == null) {
      if (!customLabel) {
        await db
          .delete(lmsTimetableSlots)
          .where(
            and(
              eq(lmsTimetableSlots.classId, classId),
              eq(lmsTimetableSlots.dayOfWeek, dayOfWeek),
              eq(lmsTimetableSlots.periodNo, periodNo),
            ),
          );
        return { ok: true, cleared: true, slot: null };
      }

      const [row] = await db
        .insert(lmsTimetableSlots)
        .values({
          classId,
          dayOfWeek,
          periodNo,
          subjectId: null,
          teacherId,
          room,
          customLabel,
        })
        .onConflictDoUpdate({
          target: [
            lmsTimetableSlots.classId,
            lmsTimetableSlots.dayOfWeek,
            lmsTimetableSlots.periodNo,
          ],
          set: { subjectId: null, teacherId, room, customLabel },
        })
        .returning({ id: lmsTimetableSlots.id });

      const teacherName =
        teacherId != null ? await teacherNameFor(teacherId) : null;
      return {
        ok: true,
        cleared: false,
        slot: {
          id: row?.id ?? 0,
          dayOfWeek,
          periodNo,
          subjectId: null,
          subjectName: null,
          subjectCode: null,
          teacherId,
          teacherName,
          room,
          customLabel,
        },
      };
    }

    const subjectId = Math.trunc(input.subjectId);
    const [subject] = await db
      .select({ id: lmsSubjects.id, name: lmsSubjects.name, code: lmsSubjects.code })
      .from(lmsSubjects)
      .where(eq(lmsSubjects.id, subjectId))
      .limit(1);
    if (!subject) return { ok: false, status: 400, error: "Unknown subject." };

    const [row] = await db
      .insert(lmsTimetableSlots)
      .values({ classId, dayOfWeek, periodNo, subjectId, teacherId, room })
      .onConflictDoUpdate({
        target: [
          lmsTimetableSlots.classId,
          lmsTimetableSlots.dayOfWeek,
          lmsTimetableSlots.periodNo,
        ],
        set: { subjectId, teacherId, room, customLabel: null },
      })
      .returning({ id: lmsTimetableSlots.id });

    const teacherName = teacherId != null ? await teacherNameFor(teacherId) : null;

    return {
      ok: true,
      cleared: false,
      slot: {
        id: row?.id ?? 0,
        dayOfWeek,
        periodNo,
        subjectId,
        subjectName: subject.name,
        subjectCode: subject.code,
        teacherId,
        teacherName,
        room,
        customLabel: null,
      },
    };
  } catch {
    return { ok: false, status: 500, error: "Could not save the slot." };
  }
}

async function teacherNameFor(teacherId: number): Promise<string | null> {
  const [t] = await db
    .select({ name: lmsPortalAccounts.fullName })
    .from(lmsTeachers)
    .leftJoin(lmsPortalAccounts, eq(lmsTeachers.accountId, lmsPortalAccounts.id))
    .where(eq(lmsTeachers.id, teacherId))
    .limit(1);
  return t?.name ?? null;
}

/** Upsert one lesson (or clear the cell) — the TEACHER path. Existence is
    checked first (honest 404), then the ownership pen (403). */
export async function writeTimetableSlot(
  input: SlotWrite,
  editorAccountId: number,
): Promise<SlotWriteResult> {
  try {
    await ensureSchemaExtras();
    const classId = Math.trunc(input.classId);
    if (!Number.isFinite(classId) || classId <= 0)
      return { ok: false, status: 400, error: "Invalid class." };
    if (!(await canEditTimetable(editorAccountId, classId)))
      return {
        ok: false,
        status: 403,
        error: "You can only edit timetables for classes you teach or lead.",
      };
    return await applySlotWrite(input);
  } catch {
    return { ok: false, status: 500, error: "Could not save the slot." };
  }
}

/** Upsert one lesson — the LMS ADMIN path (owner item 3: the office is the
    one creating timetables most of the time). Same validation, no teacher
    ownership pen: the studio holds the master pen for EVERY class. */
export async function writeTimetableSlotAdmin(
  input: SlotWrite,
): Promise<SlotWriteResult> {
  return applySlotWrite(input);
}

/** Guard used by the API route: which of the given class ids actually exist?
    (Nothing else needs it today; kept tiny on purpose.) */
export async function filterExistingClassIds(ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  try {
    const rows = await db
      .select({ id: lmsClasses.id })
      .from(lmsClasses)
      .where(inArray(lmsClasses.id, ids));
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}
