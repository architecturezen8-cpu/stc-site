import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CalendarClock, CheckCircle2, Clock, GraduationCap, MapPin, NotebookPen, Trophy } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  BadgeStrip,
  CelebrationBanner,
  EmptyNote,
  HeroRow,
  ListRow,
  NoticeAttachments,
  Panel,
  PanelFooter,
  PerformanceChart,
  StatCards,
  SubjectCards,
  TodayStrip,
} from "@/components/portal/dashboard-widgets";
import { StudentHomework } from "@/components/portal/student-homework";
import {
  FileChipList,
  LinkRow,
} from "@/components/portal/assignment-file-ui";
import { requirePortal } from "@/lib/portal-auth";
import { getStudentDashboard } from "@/lib/portal-dashboard";
import {
  getStudentHomework,
  type StudentHomeworkItem,
} from "@/lib/portal-assignments";
import { chatUnreadBadge } from "@/lib/portal-questions";
import { colomboTodayKey, getStudentCalendar } from "@/lib/portal-calendar";
import { PortalCalendar } from "@/components/portal/portal-calendar";
import { gradeChipClass, gradeForScore } from "@/lib/grades-shared";

export const metadata: Metadata = {
  title: "Student Dashboard | St. Thomas' College, Matale",
};

const ATTENDANCE_CHIP: Record<string, string> = {
  present: "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
  absent: "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]",
  late: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  excused: "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]",
};

const ATTENDANCE_LABEL: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

/** v2.8.55.0 (owner item 5) — the dashboard keeps ONLY the urgent slice:
    pending work that is overdue or due within 72h ("ikmanata iwara
    karanna ona homewors tika witharak"). The whole list lives on
    /student/homework now. Module-level on purpose — the clock is read
    here, not inside the component body. */
const URGENT_WINDOW_MS = 72 * 60 * 60 * 1000;

function urgentHomeworkOf(items: StudentHomeworkItem[]): StudentHomeworkItem[] {
  const nowMs = Date.now();
  return items
    .filter((h) => h.status === "pending" && h.dueAt != null)
    .filter(
      (h) =>
        h.duePassed ||
        new Date(h.dueAt as string).getTime() - nowMs <= URGENT_WINDOW_MS,
    )
    .sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))
    .slice(0, 4);
}

/**
 * Student dashboard — v2.8.39.0 rebuild on the owner's reference structure:
 * rounded stat cards up top (attendance, marks, homework, subjects), the
 * learning chart, then today's timetable, the attendance register summary,
 * homework, marks and notices.
 *
 * v2.8.53.0 — Phase 2.2: the #calendar section (due dates + school events
 * + class notices on one grid, no new tables) sits right under the stats.
 */
export default async function StudentDashboardPage() {
  const session = await requirePortal("student");
  const [data, homework, chatBadge, calendar] = await Promise.all([
    getStudentDashboard(session.email, session.accountId, session.fullName),
    getStudentHomework(session.accountId),
    /* v2.8.51.0 — the Chat nav badge: unread teacher replies. */
    chatUnreadBadge("student", session.accountId),
    /* v2.8.53.0 — Phase 2.2: the calendar rows. */
    getStudentCalendar(session.accountId),
  ]);

  const hasChart = data.weekly.some((v) => v > 0);
  /* v2.8.42.0 — the Homework % now comes from the SAME richer list the
     interactive panel renders, so the stat and the list never disagree. */
  const homeworkDone = homework.filter((h) => h.status !== "pending").length;
  const homeworkPct =
    homework.length > 0 ? Math.round((homeworkDone / homework.length) * 100) : null;

  /* v2.8.55.0 (owner item 5) — the urgent slice only (see the helper). */
  const urgentHomework = urgentHomeworkOf(homework);

  return (
    <PortalShell
      role="student"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/student", active: true },
        { label: "Calendar", href: "#calendar" },
        { label: "Timetable", href: "/student/timetable" },
        { label: "Homework", href: "/student/homework" },
        /* v2.8.51.0 — the dedicated Chat section with the unread badge */
        { label: "Chat", href: "/student/chat", badge: chatBadge },
        { label: "Marks", href: "#marks" },
        { label: "Notices", href: "#notices" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Track your progress here"
          firstName={data.firstName}
          secondaryLabel={data.className ? "My Class" : "Admission No"}
          secondaryValue={
            data.className
              ? `${data.className} · ${data.academicYear ?? ""}`
              : data.admissionNo
          }
          ctaLabel="Today's Timetable"
          ctaHref="#timetable"
        />

        {/* v2.8.58.0 — Phase 5.1: the day at the door — every period as a
            sideways-scrolling chip. The full grid stays in #timetable. */}
        <TodayStrip
          dayLabel={data.dayLabel}
          dateLabel={data.dateLabel}
          slots={data.slots}
          ctaLabel="Full week →"
          ctaHref="/student/timetable"
        />

        {/* Reference-style stat cards — Phase 5.1: the three rates read as
            progress rings; subjects stays a count card. */}
        <StatCards
          stats={[
            {
              value: data.attendancePct != null ? `${data.attendancePct}%` : "—",
              label: "Attendance",
              icon: <CheckCircle2 size={17} aria-hidden="true" />,
              pct: data.attendancePct,
              href: "#attendance",
            },
            {
              value: data.marksAvgPct != null ? `${data.marksAvgPct}%` : "—",
              label: "Average Mark",
              icon: <GraduationCap size={17} aria-hidden="true" />,
              pct: data.marksAvgPct,
              href: "#marks",
            },
            {
              value: homeworkPct != null ? `${homeworkPct}%` : "—",
              label: "Homework Done",
              icon: <NotebookPen size={17} aria-hidden="true" />,
              pct: homeworkPct,
              href: "#homework",
            },
            {
              value: String(data.subjectCount),
              label: "Subjects",
              icon: <BookOpen size={17} aria-hidden="true" />,
            },
          ]}
        />

        {/* v2.8.58.0 — Phase 5.1: earned badges (derived, honest, subtle). */}
        <BadgeStrip
          badges={[
            ...(data.attendancePct != null && data.attendancePct >= 95
              ? [{ icon: <CheckCircle2 size={13} aria-hidden="true" />, label: "Attendance Star" }]
              : []),
            ...(data.marksAvgPct != null && data.marksAvgPct >= 75
              ? [{ icon: <Trophy size={13} aria-hidden="true" />, label: "A Average" }]
              : []),
            ...(homeworkPct != null && homeworkPct === 100 && homework.length > 0
              ? [{ icon: <NotebookPen size={13} aria-hidden="true" />, label: "Homework Hero" }]
              : []),
          ]}
        />

        {/* v2.8.53.0 — Phase 2.2: the portal calendar (due dates + school
            events + class notices; the rows are server-fetched, the island
            flips months with no API). */}
        <div id="calendar" className="pt-rise pt-d1 scroll-mt-24">
          <Panel title="Calendar" subtitle="Due dates · school events · notices">
            <PortalCalendar items={calendar} today={colomboTodayKey()} />
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
          {/* Timetable + attendance */}
          <div className="space-y-5">
            <div id="timetable" className="pt-rise pt-d1 scroll-mt-24">
              <Panel
                title="Today's Timetable"
                subtitle={`${data.dayLabel} · ${data.dateLabel}`}
                action="search-filter"
              >
                {data.slots.length === 0 ? (
                  <EmptyNote>
                    {data.className
                      ? `No lessons are scheduled for ${data.dayLabel}. Enjoy the break!`
                      : "Your timetable appears here once the school office publishes this year's classes."}
                  </EmptyNote>
                ) : (
                  <div className="pt-scrollbar max-h-[430px] space-y-2.5 overflow-y-auto pr-0.5">
                    {data.slots.map((slot, i) => (
                      <ListRow
                        key={i}
                        icon={<BookOpen size={15} />}
                        title={slot.subject}
                        desc={slot.teacher || undefined}
                        meta={[
                          { icon: <Clock size={11} />, text: `Period ${slot.period}` },
                          ...(slot.room
                            ? [{ icon: <MapPin size={11} />, text: slot.room }]
                            : []),
                        ]}
                      />
                    ))}
                  </div>
                )}
                {/* v2.8.54.0 — Phase 3.1: the full week lives on its own page now. */}
                <Link
                  href="/student/timetable"
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
                >
                  <CalendarClock size={13} aria-hidden="true" />
                  Open the full week
                </Link>
              </Panel>
            </div>

            {/* Attendance register summary (Phase 3.1-c) */}
            <div id="attendance" className="pt-rise pt-d3 scroll-mt-24">
              <Panel title="My Attendance" subtitle="From the class register">
                {data.attendanceDetail.pct == null ? (
                  <EmptyNote>
                    Attendance appears here once your class teacher starts
                    marking the daily register.
                  </EmptyNote>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="font-display text-[34px] font-semibold leading-none text-[var(--pt-heading)]">
                          {data.attendanceDetail.pct}
                          <span className="ml-0.5 text-[16px] text-[var(--pt-accent-text)]">%</span>
                        </p>
                        <p className="mt-1 text-[11.5px] text-[var(--pt-body)]">
                          of school days attended
                        </p>
                      </div>
                      {data.attendanceDetail.monthPct != null && (
                        <span className="rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-chip-text)]">
                          This month {data.attendanceDetail.monthPct}%
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["present", data.attendanceDetail.present],
                          ["absent", data.attendanceDetail.absent],
                          ["late", data.attendanceDetail.late],
                          ["excused", data.attendanceDetail.excused],
                        ] as const
                      ).map(([key, count]) => (
                        <span
                          key={key}
                          className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${ATTENDANCE_CHIP[key]}`}
                        >
                          {ATTENDANCE_LABEL[key]} {count}
                        </span>
                      ))}
                    </div>

                    {data.attendanceDetail.recent.length > 0 && (
                      <div className="pt-scrollbar max-h-[220px] space-y-0.5 overflow-y-auto pr-0.5">
                        {data.attendanceDetail.recent.map((row) => (
                          <div
                            key={row.day}
                            className="flex items-center justify-between gap-3 py-1.5"
                          >
                            <p className="text-[12px] font-medium text-[var(--pt-heading)]">
                              {row.label}
                            </p>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${ATTENDANCE_CHIP[row.status]}`}
                            >
                              {ATTENDANCE_LABEL[row.status]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* Performance + work */}
          <div className="space-y-5">
            <div className="pt-rise pt-d2">
              <Panel
                title="Learning Performance"
                subtitle="This term so far"
                action="period"
              >
                <PerformanceChart
                  points={data.weekly}
                  highlightIndex={hasChart ? 4 : -1}
                  chipValue={hasChart ? `${Math.min(6, data.weekly.length)} items` : ""}
                  chipLabel="Learning activity this week"
                  emptyNote={
                    hasChart
                      ? undefined
                      : "Your chart fills in as attendance and marks are recorded."
                  }
                />
              </Panel>
            </div>

            {/* v2.8.59.0 — the owner: "Recent Marks grid ekata yatin mada loku
                space ekak thiyanawa ... grids tika lassanata align karanawada.
                Both cells now STRETCH to the same height (h-full chain), the
                marks rows fill their card, and a term-average footer pins the
                bottom — no more floating gap under the row. */}
            <div className="grid items-stretch gap-5 md:grid-cols-2">
              <div id="homework" className="pt-rise pt-d3 h-full scroll-mt-24">
                <Panel
                  title="Homework — Due Soon"
                  subtitle="Only what needs finishing fast"
                  className="flex h-full flex-col"
                >
                  {/* PHASE 3.1-d — interactive: open → read → submit → grade.
                      v2.8.55.0 — the urgent slice only; the full list has
                      its own page now (owner item 5). */}
                  {/* v2.8.58.0 — Phase 5.1: the celebration fires when EVERY
                      visible piece of work has been handed in. */}
                  {homework.length > 0 && homeworkDone === homework.length ? (
                    <div className="mb-3">
                      <CelebrationBanner
                        title="All caught up — every piece submitted!"
                        note="New work lands here the moment a teacher sets it."
                      />
                    </div>
                  ) : null}
                  {/* v2.8.59.0 — the rows grow to fill the tall card so the
                      two cells never disagree about where the floor is. */}
                  <div className="flex-1">
                  {urgentHomework.length > 0 ? (
                    <StudentHomework items={urgentHomework} />
                  ) : (
                    <p className="rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-6 text-center text-[12.5px] text-[var(--pt-body)]">
                      {homework.some((h) => h.status === "pending")
                        ? "Nothing due in the next 3 days — you're on top of it."
                        : "No homework right now — new assignments land here the moment a teacher sets them."}
                    </p>
                  )}
                  </div>
                  <Link
                    href="/student/homework"
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
                  >
                    <NotebookPen size={13} aria-hidden="true" />
                    Open all homework
                    {homework.length > 0 ? ` (${homework.length})` : ""}
                  </Link>
                </Panel>
              </div>

              {/* Marks — v2.8.59.0: the card stretches to match homework,
                  rows spread down the card, the term-average footer closes
                  the bottom edge. */}
              <div id="marks" className="pt-rise pt-d4 h-full scroll-mt-24">
                <Panel title="Recent Marks" subtitle="Latest assessments" className="flex h-full flex-col">
                  {data.recentMarks.length === 0 ? (
                    <EmptyNote>
                      Marks show up here as soon as a teacher publishes an
                      assessment.
                    </EmptyNote>
                  ) : (
                    <div className="flex-1 space-y-0.5">
                      {data.recentMarks.map((m, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                              {m.title}
                            </p>
                            <p className="truncate text-[11.5px] text-[var(--pt-body)]">
                              {m.subject} · {m.whenLabel}
                            </p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="font-display text-[14px] font-semibold text-[var(--pt-accent-text)]">
                              {m.score != null ? `${m.score}/${m.max}` : "—"}
                            </span>
                            {/* v2.8.56.0 — Phase 3.2: the letter beside every mark. */}
                            {m.score != null ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gradeChipClass(gradeForScore(m.score, m.max))}`}
                              >
                                {gradeForScore(m.score, m.max)}
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto pt-3">
                    <PanelFooter
                      left={
                        <p className="text-[12.5px] text-[var(--pt-body)]">
                          {data.marksAvgPct != null
                            ? `Term average ${data.marksAvgPct}% across the latest ${data.recentMarks.length}.`
                            : "Your term average appears once the first mark lands."}
                        </p>
                      }
                      right={
                        <span className="rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--pt-chip-text)]">
                          {data.marksAvgPct != null
                            ? `${data.marksAvgPct}% average`
                            : "No marks yet"}
                        </span>
                      }
                    />
                  </div>
                </Panel>
              </div>
            </div>

            {/* v2.8.45.0 — Phase 3.1-e: Class materials shared by teachers */}
            <div className="pt-rise pt-d4">
              <Panel title="Class Materials" subtitle="Notes & resources from your teachers">
                {data.materials.length === 0 ? (
                  <EmptyNote>
                    Notes, worksheets and videos your teachers share will
                    appear here.
                  </EmptyNote>
                ) : (
                  <div className="space-y-3">
                    {data.materials.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-xl border border-[var(--pt-border)] px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                              {m.title}
                            </p>
                            <p className="truncate text-[11.5px] text-[var(--pt-body)]">
                              {m.subject} · {m.whenLabel}
                            </p>
                          </div>
                        </div>
                        {m.files.length > 0 ? (
                          <div className="mt-2">
                            <FileChipList files={m.files} />
                          </div>
                        ) : null}
                        {m.linkUrl ? (
                          <div className="mt-2">
                            <LinkRow url={m.linkUrl} />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="pt-rise pt-d4">
              <Panel title="My Subjects" subtitle={`${data.subjectCount} this year`}>
                {data.subjectCount === 0 ? (
                  <EmptyNote>
                    Subjects appear here when the school office completes the
                    class setup.
                  </EmptyNote>
                ) : (
                  <>
                    {/* v2.8.58.0 — Phase 5.1: subject cards with their own
                        glyph instead of a bare count footer. */}
                    <SubjectCards subjects={data.subjects} />
                    <div className="mt-4">
                      <PanelFooter
                        left={
                          <p className="text-[12.5px] text-[var(--pt-body)]">
                            {data.subjectCount} subjects are part of your weekly
                            timetable.
                          </p>
                        }
                        right={
                          <span className="rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--pt-chip-text)]">
                            {data.className ?? "Class"}
                          </span>
                        }
                      />
                    </div>
                  </>
                )}
              </Panel>
            </div>

            {/* Class notices — always the final grid. v2.8.59.0 — each row
                carries its attachments (link + image/PDF chips) under the
                text, same as the teacher's board. */}
            <div id="notices" className="pt-rise pt-d5 scroll-mt-24">
              <Panel title="Class Notices" subtitle="From your teachers">
                {data.notices.length === 0 ? (
                  <EmptyNote>
                    Class notices will appear here once your teachers post
                    them.
                  </EmptyNote>
                ) : (
                  <div className="space-y-2.5">
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
      </div>
    </PortalShell>
  );
}
