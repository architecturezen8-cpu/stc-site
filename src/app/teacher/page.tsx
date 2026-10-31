import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarClock, Clock, ClipboardList, MapPin, NotebookPen, Users, CalendarCheck2, Megaphone } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  EmptyNote,
  HeroRow,
  ListRow,
  MarkingCounter,
  NoticeAttachments,
  Panel,
  PanelFooter,
  PerformanceChart,
  QuickActions,
  StatCards,
  TodayStrip,
} from "@/components/portal/dashboard-widgets";
import { TeacherClassRoster } from "@/components/portal/teacher-roster";
import { requirePortal } from "@/lib/portal-auth";
import { getTeacherDashboard } from "@/lib/portal-dashboard";
import { ledByFilter } from "@/lib/portal-class-teacher";
import { chatUnreadBadge } from "@/lib/portal-questions";
import { colomboTodayKey, getTeacherCalendar } from "@/lib/portal-calendar";
import { PortalCalendar } from "@/components/portal/portal-calendar";
import { PurgeConsentStrip } from "@/components/portal/purge-consent-cards";
import { TeacherPasswordResetCard } from "@/components/portal/teacher-password-reset";
import { getBroadcastUnreadCount } from "@/lib/school-broadcasts";
import { isFreshPortalLogin } from "@/lib/fresh-login";
import { WelcomeBack } from "@/components/portal/welcome-back";
import { db } from "@/db";
import {
  lmsClasses,
  lmsClassSubjects,
  lmsEnrollments,
  lmsPortalAccounts,
  lmsStudents,
  lmsTeachers,
} from "@/db/schema-lms";
import { and, eq, inArray } from "drizzle-orm";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const metadata: Metadata = {
  title: "Teacher Dashboard | St. Thomas' College, Matale",
};

/**
 * Teacher dashboard — v2.8.40.1 layout: the left column pairs Today's
 * Lessons with Teaching Performance and the right column keeps the class
 * rosters + classes (no empty hole), then Teaching Load full width with the
 * Marking Queue and Class Notices closing pair.
 */
export default async function TeacherDashboardPage() {
  const session = await requirePortal("teacher");
  const [data, chatBadge, calendar, resetGroups, broadcastUnread, freshLogin] = await Promise.all([
    getTeacherDashboard(session.email, session.accountId, session.fullName),
    /* v2.8.51.0 — the Chat nav badge: unread student questions. */
    chatUnreadBadge("teacher", session.accountId),
    /* v2.8.53.0 — Phase 2.2: the calendar rows. */
    getTeacherCalendar(session.accountId),
    /* v2.8.67.0 — D.1 teacher fallback: roster for password resets. */
    getTeacherResetRoster(session.accountId),
    /* v2.8.70.0 — the School notifications nav badge. */
    getBroadcastUnreadCount(session.accountId, "teacher"),
    /* v2.8.70.2 — the welcome-back popup. */
    isFreshPortalLogin(session.accountId),
  ]);

  const hasChart = data.weekly.some((v) => v > 0);

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      bellUnread={broadcastUnread}
      nav={[
        { label: "Dashboard", href: "/teacher", active: true },
        { label: "Calendar", href: "#calendar" },
        { label: "Attendance", href: "/teacher/attendance" },
        { label: "Assignments", href: "/teacher/assignments" },
        /* v2.8.51.0 — the dedicated Chat section with the unread badge */
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        /* v2.8.45.0 — Phase 3.1-e: marks / materials / notices pages. */
        { label: "Marks", href: "/teacher/marks" },
        { label: "Report card", href: "/teacher/report-card" },
        { label: "Notifications", href: "/teacher/notifications", badge: broadcastUnread },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Classes", href: "#classes" },
        { label: "Marking", href: "#marking" },
        { label: "My Storage", href: "/teacher/storage" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        {/* v2.8.70.2 — welcome back + storage warning on a fresh login. */}
        <WelcomeBack name={session.fullName} roleLabel="Teacher Portal" theme="portal" freshLogin={freshLogin} storageKind="personal" />
        <HeroRow
          overline="Track your teaching here"
          firstName={data.firstName}
          secondaryLabel="Teaching Load"
          secondaryValue={
            data.classes.length > 0
              ? `${data.classes.length} classes · ${data.studentCount} students`
              : data.designation
          }
          ctaLabel="Today's Lessons"
          ctaHref="#timetable"
        />

        {/* v2.8.71.0 — storage-purge consent requests (the office asks before deleting). School notices live in the header bell + the Notifications page now. */}
        <PurgeConsentStrip portalRole="teacher" />

        {/* v2.8.58.0 — Phase 5.2: the four everyday doors, right under the
            hero (attendance / assignment / notice + marks). */}
        <QuickActions
          actions={[
            {
              label: "Mark attendance",
              sub: "Today's register",
              href: "/teacher/attendance",
              icon: <CalendarCheck2 size={17} aria-hidden="true" />,
            },
            {
              label: "Post assignment",
              sub: "Homework to a class",
              href: "/teacher/assignments",
              icon: <ClipboardList size={17} aria-hidden="true" />,
            },
            {
              label: "Post a notice",
              sub: "Tell your classes",
              href: "/teacher/notices",
              icon: <Megaphone size={17} aria-hidden="true" />,
            },
            {
              label: "Enter marks",
              sub: "Assessments & registers",
              href: "/teacher/marks",
              icon: <NotebookPen size={17} aria-hidden="true" />,
            },
          ]}
        />

        {/* v2.8.58.0 — Phase 5.2: the day at the door (same styling as the
            student's strip). */}
        <TodayStrip
          dayLabel={data.dayLabel}
          dateLabel={data.dateLabel}
          slots={data.slots}
          ctaLabel="Full week →"
          ctaHref="/teacher/timetable"
          chipHref="#timetable"
        />

        {/* Reference-style stat cards */}
        <StatCards
          stats={[
            {
              value: String(data.classes.length),
              label: "My Classes",
              icon: <BookOpen size={17} aria-hidden="true" />,
              href: "#classes",
            },
            {
              value: String(data.subjectCount),
              label: "Subjects",
              icon: <ClipboardList size={17} aria-hidden="true" />,
              /* v2.8.61.0 — lands on the classes wall where every class ·
                  subject pairing is listed. */
              href: "#classes",
            },
            {
              value: String(data.studentCount),
              label: "Students",
              icon: <Users size={17} aria-hidden="true" />,
              href: "#rosters",
            },
            {
              /* v2.8.58.0 — the pending count moved to its own honest strip
                 (MarkingCounter) below; the 4th card shows today's load. */
              value: String(data.slots.length),
              label: "Lessons Today",
              icon: <Clock size={17} aria-hidden="true" />,
              href: "#timetable",
            },
          ]}
        />

        {/* v2.8.58.0 — Phase 5.2: the pending-marking counter — one honest
            number in its own strip before the grid. */}
        <MarkingCounter count={data.ungradedCount} href="#marking" />

        {/* v2.8.67.0 — D.1: the teacher fallback for student password resets
            (kids without a reachable email). Hidden when no roster. */}
        {resetGroups.length > 0 && (
          <div id="password-resets" className="pt-rise pt-d1 scroll-mt-24">
            <TeacherPasswordResetCard groups={resetGroups} />
          </div>
        )}

        {/* v2.8.53.0 — Phase 2.2: the portal calendar — the teacher's own
            work's due dates + notices for their classes + school events. */}
        <div id="calendar" className="pt-rise pt-d1 scroll-mt-24">
          <Panel title="Calendar" subtitle="Due dates · school events · notices">
            <PortalCalendar items={calendar} today={colomboTodayKey()} />
          </Panel>
        </div>

        {/* v2.8.40.1 — rebalanced on the owner's screenshot: the left column
            now pairs Today's Lessons with Teaching Performance so BOTH
            columns carry two cards (the lone 330px lessons card used to
            leave an awkward hole on the left). Rosters and classes keep the
            wide right column. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Today's lessons + teaching performance */}
          <div className="space-y-5">
            <div id="timetable" className="pt-rise pt-d1 scroll-mt-24">
              <Panel
                title="Today's Lessons"
                subtitle={`${data.dayLabel} · ${data.dateLabel}`}
              >
                {data.slots.length === 0 ? (
                  <EmptyNote>
                    {data.classes.length > 0
                      ? `No lessons scheduled for ${data.dayLabel}.`
                      : "Lessons appear here once the timetable is published."}
                  </EmptyNote>
                ) : (
                  <div className="pt-scrollbar max-h-[300px] space-y-2.5 overflow-y-auto pr-0.5">
                    {data.slots.map((slot, i) => (
                      <ListRow
                        key={i}
                        icon={<Clock size={15} />}
                        title={slot.subject}
                        desc={slot.teacher}
                        meta={[
                          { text: `Period ${slot.period}` },
                          ...(slot.room
                            ? [{ icon: <MapPin size={11} />, text: slot.room }]
                            : []),
                        ]}
                      />
                    ))}
                  </div>
                )}
                {/* v2.8.61.0 — replaces the dead Search/Filter circles: a real
                    door to the full-week grid (mirrors the student panel). */}
                <Link
                  href="/teacher/timetable"
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
                >
                  <CalendarClock size={13} aria-hidden="true" />
                  Open the full week
                </Link>
              </Panel>
            </div>

            <div className="pt-rise pt-d3">
              <Panel title="Teaching Performance" subtitle="This term so far" action="period">
                <PerformanceChart
                  points={data.weekly}
                  highlightIndex={hasChart ? 4 : -1}
                  chipValue={hasChart ? `${data.ungradedCount} open` : ""}
                  chipLabel="Marking queue"
                  emptyNote={
                    hasChart
                      ? undefined
                      : "Activity fills in as assignments and submissions arrive."
                  }
                />
              </Panel>
            </div>
          </div>

          {/* Rosters + classes */}
          <div className="space-y-5">
            <div id="rosters" className="pt-rise pt-d2 scroll-mt-24">
              <Panel
                title="My Class Rosters"
                subtitle="Select a class to see every student"
              >
                <TeacherClassRoster rosters={data.rosters} />
              </Panel>
            </div>

            <div id="classes" className="pt-rise pt-d3 scroll-mt-24">
              <Panel title="My Classes" subtitle="Assigned this year">
                {data.classes.length === 0 ? (
                  <EmptyNote>
                    Your classes appear here once the school office assigns
                    subjects to you for this year.
                  </EmptyNote>
                ) : (
                  <div className="pt-scrollbar max-h-[320px] space-y-2.5 overflow-y-auto pr-0.5">
                    {data.classes.map((c) => (
                      <ListRow
                        key={c.id}
                        icon={<BookOpen size={15} />}
                        title={c.name}
                        desc={c.subject}
                        meta={[
                          {
                            icon: <Users size={11} />,
                            text: `${c.students} student${c.students === 1 ? "" : "s"}`,
                          },
                        ]}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </div>

        {/* v2.8.40.0 owner order — teaching load first, then the marking queue */}
        <div className="pt-rise pt-d3">
          <Panel title="Teaching Load" subtitle="This academic year">
            {data.classes.length === 0 ? (
              <EmptyNote>
                Your load summary appears once class assignments are set.
              </EmptyNote>
            ) : (
              <PanelFooter
                left={
                  <p className="text-[12.5px] text-[var(--pt-body)]">
                    {data.studentCount} students across {data.classes.length}{" "}
                    class{data.classes.length === 1 ? "" : "es"}.
                  </p>
                }
                right={
                  <span className="rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--pt-chip-text)]">
                    {data.designation}
                  </span>
                }
              />
            )}
          </Panel>
        </div>

        {/* v2.8.40.1 — the closing pair: marking queue beside class notices
            (teaching performance moved up to fill the left column above). */}
        <div className="grid gap-5 md:grid-cols-2">
          <div id="marking" className="pt-rise pt-d4 scroll-mt-24">
            <Panel title="Marking Queue" subtitle="Submissions to grade">
              {data.ungraded.length === 0 ? (
                <EmptyNote>
                  Nothing to grade — student submissions will queue up here.
                </EmptyNote>
              ) : (
                <div className="pt-scrollbar max-h-[320px] space-y-0.5 overflow-y-auto pr-0.5">
                  {/* v2.8.42.0 — each row opens the grading register */}
                  {data.ungraded.map((u, i) => (
                    <Link
                      key={i}
                      href={`/teacher/assignments?focus=${u.assignmentId}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-[var(--pt-panel-soft)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                          {u.assignment}
                        </p>
                        <p className="truncate text-[11.5px] text-[var(--pt-body)]">
                          {u.student} · {u.whenLabel}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--pt-warn-bg)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--pt-warn-text)]">
                        To grade
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div id="notices" className="pt-rise pt-d5 scroll-mt-24">
            <Panel title="Class Notices" subtitle="Posted to your classes">
              {data.notices.length === 0 ? (
                <EmptyNote>
                  Notices you post to your classes will show up here.
                </EmptyNote>
              ) : (
                <div className="space-y-2.5">
                  {/* v2.8.59.0 — attachments ride under each notice. */}
                  {data.notices.map((n, i) => (
                    <div
                      key={n.id ?? i}
                      className="rounded-xl border border-[var(--pt-border)] px-3.5 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-[var(--pt-muted)]">
                          {n.whenLabel}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--pt-body)]">
                        {n.body}
                      </p>
                      <NoticeAttachments
                        noticeId={n.id}
                        linkUrl={n.linkUrl}
                        files={n.files}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

/**
 * v2.8.67.0 — D.1 teacher fallback roster: students with portal accounts
 * in the classes this teacher teaches (any subject) or is class teacher
 * of, grouped by class. Empty when the teacher has no such students —
 * the card simply never renders.
 */
async function getTeacherResetRoster(teacherAccountId: number) {
  await ensureSchemaExtras();
  const [teacher] = await db
    .select({ id: lmsTeachers.id })
    .from(lmsTeachers)
    .where(eq(lmsTeachers.accountId, teacherAccountId))
    .limit(1);
  if (!teacher) return [];

  const taughtClassIds = (
    await db
      .selectDistinct({ classId: lmsClassSubjects.classId })
      .from(lmsClassSubjects)
      .where(eq(lmsClassSubjects.teacherId, teacher.id))
  ).map((r) => r.classId);
  const ledClasses = await db
    .select({ id: lmsClasses.id })
    .from(lmsClasses)
    .where(ledByFilter(teacher.id)); // v2.8.83.0 — class teacher OR assistant, ALL their classes
  for (const row of ledClasses) {
    if (!taughtClassIds.includes(row.id)) taughtClassIds.push(row.id);
  }
  if (taughtClassIds.length === 0) return [];

  const [classes, rows] = await Promise.all([
    db
      .select({ id: lmsClasses.id, name: lmsClasses.name })
      .from(lmsClasses)
      .where(inArray(lmsClasses.id, taughtClassIds)),
    db
      .select({
        classId: lmsEnrollments.classId,
        accountId: lmsPortalAccounts.id,
        name: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
      .innerJoin(lmsPortalAccounts, eq(lmsStudents.accountId, lmsPortalAccounts.id))
      .where(
        and(
          inArray(lmsEnrollments.classId, taughtClassIds),
          eq(lmsEnrollments.status, "active"),
          eq(lmsPortalAccounts.active, true),
        ),
      ),
  ]);

  const nameById = new Map(classes.map((c) => [c.id, c.name] as const));
  type RosterRow = { accountId: number; name: string; admissionNo: string };
  const groups = new Map<string, RosterRow[]>();
  for (const row of rows) {
    const className = nameById.get(row.classId) || `Class #${row.classId}`;
    const list = groups.get(className) || [];
    list.push({
      accountId: row.accountId,
      name: row.name,
      admissionNo: row.admissionNo,
    });
    groups.set(className, list);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([className, students]) => ({
      className,
      students: students.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
