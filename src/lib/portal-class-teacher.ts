import { and, eq, or, type SQL } from "drizzle-orm";

import { lmsClasses } from "@/db/schema-lms";

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
