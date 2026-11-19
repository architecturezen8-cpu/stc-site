import { and, eq, isNotNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { lmsClassSubjects, lmsClasses, lmsTeachers, lmsTimetableSlots } from "@/db/schema-lms";

/**
 * v2.8.83.0 — the assistant class teacher circle-of-trust.
 *
 * A class may now carry a SECOND staff member (assistant class teacher) who
 * shares the class teacher's everyday powers — attendance register, class
 * notices, timetable pen, student password resets — but NOT report-card
 * generation, unless the owner switches the per-class
 * assistant_report_card_access option on.
 *
 * Every place that used to compare lmsClasses.classTeacherId alone now goes
 * through these three helpers so the rule lives in exactly ONE file:
 *
 *   ledByFilter(id)            → Drizzle WHERE: class teacher OR assistant
 *   leadsClass(cls, id)        → TS-side check on a loaded class row
 *   reportCardClassesFilter(id)→ Drizzle WHERE: class teacher, or assistant
 *                                WITH the report-card option on
 *   canGenerateReportCards(...)→ TS-side report-card circle check
 *
 * The printed report-card SIGNATORY stays the class teacher: the sheet keeps
 * showing the class teacher's name and only they upload their signature.
 *
 * v2.9.13.3 — THE PLACEMENT CIRCLE (owner: "lms admin eken timetable eken
 * wena class ekakatath ugannana damma … eth materials, notices, assignment,
 * marks ehema danna ba"). The class×subject SEAT (lms_class_subjects — one
 * row per class×subject, unique index) can hold a single name, but subjects
 * are genuinely SHARED: Sasika keeps five 6-A ICT lessons while Sumudu takes
 * Monday's — placed through the timetable. From this version everyone
 * standing in front of the class for a subject carries the classroom powers
 * (assignments, materials, marks, notices, attendance) — the seat OR the
 * placement, one rule, these helpers:
 *
 *   teachesByPlacement(id)     → Drizzle EXISTS: this teacher has a timetable
 *                                slot for the correlated class×subject row
 *   placementOnlyCsRows(id)    → class×subject rows reached ONLY by placement
 *                                (option lists merge them with seat rows)
 *   placementClassIds(id)      → classes reached by ANY placement (custom
 *                                relief included) — class-level reach
 */

/** Drizzle WHERE fragment: the teacher leads OR assists the class. */
export function ledByFilter(teacherId: number): SQL | undefined {
  return or(
    eq(lmsClasses.classTeacherId, teacherId),
    eq(lmsClasses.assistantClassTeacherId, teacherId),
  );
}

/** TS-side twin of ledByFilter for rows already loaded from lms_classes. */
export function leadsClass(
  cls: { classTeacherId: number | null; assistantClassTeacherId: number | null },
  teacherId: number,
): boolean {
  return cls.classTeacherId === teacherId || cls.assistantClassTeacherId === teacherId;
}

/** Drizzle WHERE for the report-card dashboard: class teacher always; the
    assistant only when the class carries the report-card option. */
export function reportCardClassesFilter(teacherId: number): SQL | undefined {
  return or(
    eq(lmsClasses.classTeacherId, teacherId),
    and(
      eq(lmsClasses.assistantClassTeacherId, teacherId),
      eq(lmsClasses.assistantReportCardAccess, true),
    ),
  );
}

/** TS-side twin of reportCardClassesFilter — the single report-card gate. */
export function canGenerateReportCards(
  cls: {
    classTeacherId: number | null;
    assistantClassTeacherId: number | null;
    assistantReportCardAccess: boolean;
  },
  teacherId: number,
): boolean {
  if (cls.classTeacherId === teacherId) return true;
  return cls.assistantClassTeacherId === teacherId && cls.assistantReportCardAccess;
}

/* ── v2.9.13.3 — the placement circle ──────────────────────────────────── */

/**
 * Drizzle EXISTS fragment for queries that already touch
 * lms_class_subjects: TRUE when THIS teacher has at least one timetable
 * slot for the row's class×subject. Composed next to the seat check
 * (`eq(lmsClassSubjects.teacherId, t)`) so BOTH routes to "I teach this"
 * open the same door.
 */
export function teachesByPlacement(teacherId: number): SQL {
  return sql`exists (select 1 from ${lmsTimetableSlots} where ${lmsTimetableSlots.classId} = ${lmsClassSubjects.classId} and ${lmsTimetableSlots.subjectId} = ${lmsClassSubjects.subjectId} and ${lmsTimetableSlots.teacherId} = ${teacherId})`;
}

/**
 * Classes reached by ANY timetable placement of this teacher — subject
 * lessons AND custom relief alike. Class-level reach (notices, attendance,
 * dashboard rosters) follows the grid: whoever takes the class today can
 * reach the class.
 */
export async function placementClassIds(teacherId: number): Promise<number[]> {
  try {
    const rows = await db
      .selectDistinct({ classId: lmsTimetableSlots.classId })
      .from(lmsTimetableSlots)
      .where(eq(lmsTimetableSlots.teacherId, teacherId));
    return rows.map((r) => r.classId);
  } catch {
    return [];
  }
}

/** Every teacher id placed on this class's subject lessons — the timetable
    editor's staffed pool merges these with the seat holders so a SHARED
    subject can keep being staffed with each of its teachers. */
export async function placementTeacherIdsForClass(
  classId: number,
): Promise<Map<number, number[]>> {
  const bySubject = new Map<number, number[]>();
  try {
    const rows = await db
      .select({
        subjectId: lmsTimetableSlots.subjectId,
        teacherId: lmsTimetableSlots.teacherId,
      })
      .from(lmsTimetableSlots)
      .where(
        and(
          eq(lmsTimetableSlots.classId, classId),
          isNotNull(lmsTimetableSlots.subjectId),
          isNotNull(lmsTimetableSlots.teacherId),
        ),
      );
    for (const r of rows) {
      if (r.subjectId == null || r.teacherId == null) continue;
      const list = bySubject.get(r.subjectId) ?? [];
      if (!list.includes(r.teacherId)) list.push(r.teacherId);
      bySubject.set(r.subjectId, list);
    }
  } catch {
    return bySubject;
  }
  return bySubject;
}

/* ── v2.9.13.3 — the surfaced class-teacher role ───────────────────────── */

export type LedClassSummary = {
  id: number;
  name: string;
  role: "Class teacher" | "Assistant class teacher";
};

/** The classes this account LEADS (class teacher / assistant), with the
    seat they hold — the portal surfaces these even when the teacher has no
    teaching subjects, so the class-teacher powers are visible (owner:
    "class teacherta thiyana powers apply wela na"). */
export async function getTeacherLedClasses(
  accountId: number,
): Promise<LedClassSummary[]> {
  try {
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    if (!teacher) return [];
    const rows = await db
      .select({
        id: lmsClasses.id,
        name: lmsClasses.name,
        classTeacherId: lmsClasses.classTeacherId,
        assistantClassTeacherId: lmsClasses.assistantClassTeacherId,
      })
      .from(lmsClasses)
      .where(ledByFilter(teacher.id));
    return rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        role:
          r.classTeacherId === teacher.id
            ? ("Class teacher" as const)
            : ("Assistant class teacher" as const),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
