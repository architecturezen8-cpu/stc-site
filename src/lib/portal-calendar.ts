import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import {
  lmsAssignments,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsNotices,
  lmsParentChildren,
  lmsStudents,
  lmsSubjects,
  lmsTeachers,
} from "@/db/schema-lms";
import { ensureLmsPerson } from "@/lib/lms-identity";

/**
 * PHASE 2.2 (v2.8.53.0) — the PORTAL CALENDAR (the owner's approved roadmap:
 * "students/parents/teachers see due dates + school events + notices on one
 * calendar … no new tables").
 *
 * Three kinds of day entries, all from EXISTING tables:
 *   · "due"    — lms_assignments.due_at (role-scoped: the classes the viewer
 *                is enrolled in / teaches / has children in);
 *   · "event"  — the site-wide events table (the same school calendar the
 *                public News & Events section renders) — everyone;
 *   · "notice" — lms_notices for the role-scoped classes, dated by the day
 *                they were posted.
 *
 * The window is deliberately WIDE (60 days back, 180 forward) and the rows
 * are few, so the server fetches EVERYTHING in one page load and the client
 * island flips months with zero API calls. `day` is precomputed in
 * Asia/Colombo so the grid NEVER disagrees with the viewer's clock.
 */

export type PortalCalendarItem = {
  kind: "due" | "event" | "notice";
  /** raw ISO instant — sorting + the time label */
  at: string;
  /** the Asia/Colombo calendar day (YYYY-MM-DD) the item sits on */
  day: string;
  title: string;
  /** the quiet sub-line: subject · class / time · place / class */
  sub: string;
  /** where the row leads (null = information only) */
  href: string | null;
};

const WINDOW_PAST_DAYS = 60;
const WINDOW_FUTURE_DAYS = 180;
const MAX_ITEMS = 400;

/** en-CA gives exactly YYYY-MM-DD — in Asia/Colombo, per the school clock. */
const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Colombo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's Colombo date key — the dashboards hand this to the island. */
export function colomboTodayKey(): string {
  return DAY_FMT.format(new Date());
}

function dayOf(date: Date): string {
  return DAY_FMT.format(date);
}

type CalendarScope = {
  classIds: number[];
  /** when set, dues come from THIS teacher's class×subjects instead of classIds */
  teacherId?: number | null;
  /** the student's rows lead into their homework page */
  hrefForAssignment?: (assignmentId: number) => string | null;
};

async function buildCalendar(scope: CalendarScope): Promise<PortalCalendarItem[]> {
  if (!scope.teacherId && scope.classIds.length === 0) return [];

  const from = new Date(Date.now() - WINDOW_PAST_DAYS * 86_400_000);
  const to = new Date(Date.now() + WINDOW_FUTURE_DAYS * 86_400_000);
  const items: PortalCalendarItem[] = [];

  /* ── due dates ─────────────────────────────────────────────────────── */
  const dueConds = [
    eq(lmsAssignments.isActive, true),
    isNotNull(lmsAssignments.dueAt),
    gte(lmsAssignments.dueAt, from),
    lte(lmsAssignments.dueAt, to),
  ];
  if (scope.teacherId) {
    dueConds.push(eq(lmsClassSubjects.teacherId, scope.teacherId));
  } else {
    dueConds.push(inArray(lmsClassSubjects.classId, scope.classIds));
  }
  const dueRows = await db
    .select({
      id: lmsAssignments.id,
      title: lmsAssignments.title,
      dueAt: lmsAssignments.dueAt,
      subject: lmsSubjects.name,
      className: lmsClasses.name,
    })
    .from(lmsAssignments)
    .innerJoin(lmsClassSubjects, eq(lmsClassSubjects.id, lmsAssignments.classSubjectId))
    .innerJoin(lmsClasses, eq(lmsClasses.id, lmsClassSubjects.classId))
    .innerJoin(lmsSubjects, eq(lmsSubjects.id, lmsClassSubjects.subjectId))
    .where(and(...dueConds))
    .orderBy(asc(lmsAssignments.dueAt))
    .limit(MAX_ITEMS);
  for (const r of dueRows) {
    if (!r.dueAt) continue;
    items.push({
      kind: "due",
      at: r.dueAt.toISOString(),
      day: dayOf(r.dueAt),
      title: r.title,
      sub: `${r.subject} · ${r.className}`,
      href: scope.hrefForAssignment ? scope.hrefForAssignment(r.id) : null,
    });
  }

  /* ── school events (everyone) ──────────────────────────────────────── */
  const eventRows = await db
    .select({
      title: events.title,
      category: events.category,
      startsAt: events.startsAt,
      timeLabel: events.timeLabel,
      location: events.location,
    })
    .from(events)
    .where(and(gte(events.startsAt, from), lte(events.startsAt, to)))
    .orderBy(asc(events.startsAt))
    .limit(MAX_ITEMS);
  for (const r of eventRows) {
    items.push({
      kind: "event",
      at: r.startsAt.toISOString(),
      day: dayOf(r.startsAt),
      title: r.title,
      sub: [r.category, r.location].filter(Boolean).join(" · "),
      href: null,
    });
  }

  /* ── class notices (dated by the day they were posted) ─────────────── */
  const noticeRows = await db
    .select({
      title: lmsNotices.title,
      body: lmsNotices.body,
      createdAt: lmsNotices.createdAt,
      className: lmsClasses.name,
    })
    .from(lmsNotices)
    .innerJoin(lmsClasses, eq(lmsClasses.id, lmsNotices.classId))
    .where(
      and(
        inArray(lmsNotices.classId, scope.classIds),
        gte(lmsNotices.createdAt, from),
        lte(lmsNotices.createdAt, to),
      ),
    )
    .orderBy(asc(lmsNotices.createdAt))
    .limit(MAX_ITEMS);
  for (const r of noticeRows) {
    items.push({
      kind: "notice",
      at: r.createdAt.toISOString(),
      day: dayOf(r.createdAt),
      title: r.title,
      sub: r.className,
      href: null,
    });
  }

  items.sort((a, b) => a.at.localeCompare(b.at));
  return items;
}

/** The STUDENT's calendar — dues + notices of their active classes + events. */
export async function getStudentCalendar(accountId: number): Promise<PortalCalendarItem[]> {
  const student = (await ensureLmsPerson("student", accountId)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!student) return [];
  const rows = await db
    .select({ classId: lmsEnrollments.classId })
    .from(lmsEnrollments)
    .where(
      and(eq(lmsEnrollments.studentId, student.id), eq(lmsEnrollments.status, "active")),
    );
  return buildCalendar({
    classIds: [...new Set(rows.map((r) => r.classId))],
    hrefForAssignment: (id) => `/student/homework/${id}`,
  });
}

/** The TEACHER's calendar — their work's dues + notices for their classes + events. */
export async function getTeacherCalendar(accountId: number): Promise<PortalCalendarItem[]> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return [];
  const rows = await db
    .select({ classId: lmsClassSubjects.classId })
    .from(lmsClassSubjects)
    .where(eq(lmsClassSubjects.teacherId, teacher.id));
  return buildCalendar({
    classIds: [...new Set(rows.map((r) => r.classId))],
    teacherId: teacher.id,
  });
}

/** The PARENT's calendar — their children's dues + notices + events. */
export async function getParentCalendar(accountId: number): Promise<PortalCalendarItem[]> {
  const parent = (await ensureLmsPerson("parent", accountId)) as
    | { id: number }
    | null;
  if (!parent) return [];
  const childRows = await db
    .select({ studentId: lmsParentChildren.studentId })
    .from(lmsParentChildren)
    .where(eq(lmsParentChildren.parentId, parent.id));
  if (childRows.length === 0) return [];
  const classRows = await db
    .select({ classId: lmsEnrollments.classId })
    .from(lmsEnrollments)
    .where(
      and(
        inArray(
          lmsEnrollments.studentId,
          childRows.map((r) => r.studentId),
        ),
        eq(lmsEnrollments.status, "active"),
      ),
    );
  return buildCalendar({ classIds: [...new Set(classRows.map((r) => r.classId))] });
}
