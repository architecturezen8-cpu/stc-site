import type { Metadata } from "next";
import { CalendarClock, RefreshCw } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  TimetableGridView,
} from "@/components/portal/timetable-grid-view";
import { TimetableRefreshButton } from "@/components/portal/timetable-refresh-button";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getStudentTimetable } from "@/lib/portal-timetable";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Timetable | Student Portal · St. Thomas' College, Matale",
};

/** Asia/Colombo weekday index (0 = Sunday … 6 = Saturday), computed on the
    server so SSR and the school's clock always agree. */
function colomboDayIndex(): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    weekday: "short",
  }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/**
 * PHASE 3.1 (v2.8.54.0) — the student's full-week timetable. Read-only:
 * the whole week of THEIR class, today's column tinted, lessons served
 * straight from the register (no API call, no client fetch).
 *
 * v2.8.55.0 (owner item 1) — the refresh icon lives here too now, same as
 * the teacher's page: one tap re-runs the server page and lands the
 * office's latest edits.
 */
export default async function StudentTimetablePage() {
  const session = await requirePortal("student");
  const [view, chatBadge] = await Promise.all([
    getStudentTimetable(session.accountId),
    chatUnreadBadge("student", session.accountId),
  ]);

  const today = colomboDayIndex();
  const slots = view.week?.slots ?? [];
  const weekLessons = slots.length;
  const todaysCount = slots.filter((s) => s.dayOfWeek === today).length;

  return (
    <PortalShell
      role="student"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/student" },
        { label: "Calendar", href: "/student#calendar" },
        { label: "Timetable", href: "/student/timetable", active: true },
        { label: "Homework", href: "/student/homework" },
        { label: "Chat", href: "/student/chat", badge: chatBadge },
        { label: "Marks", href: "/student#marks" },
        { label: "Report card", href: "/student/report-card" },
        { label: "Notices", href: "/student#notices" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Monday to Friday"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Thomian"}
          secondaryLabel={view.class ? `${view.class.name} · Week` : "Week"}
          secondaryValue={
            weekLessons > 0
              ? `${weekLessons} lessons · ${todaysCount} today`
              : "Timetable not published yet"
          }
          ctaLabel="Today's Lessons"
          ctaHref="/student#timetable"
        />

        <div className="pt-rise pt-d1">
          <Panel
            title={view.class ? `Class Timetable — ${view.class.name}` : "Class Timetable"}
            subtitle="The full week · today is highlighted"
          >
            {/* v2.8.55.0 — the refresh row (owner item 1): same icon, same
                spin, right-aligned above the grid like the teacher page. */}
            <div className="mb-3 flex items-center justify-end gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--pt-muted)]">
                <RefreshCw size={11} aria-hidden="true" />
                Refresh for the latest
              </span>
              <TimetableRefreshButton />
            </div>
            {view.class && slots.length > 0 ? (
              <>
                <TimetableGridView slots={slots} highlightDay={today} />
                <p className="mt-3 text-[11.5px] text-[var(--pt-muted)]">
                  Tip: the same timetable appears in the Today&apos;s Lessons
                  panel on your dashboard, day by day.
                </p>
              </>
            ) : (
              <EmptyNote>
                {view.class ? (
                  <>
                    No lessons on the grid yet — your class teacher will fill
                    the week in shortly.
                  </>
                ) : (
                  <>
                    Your class timetable appears here once you are enrolled in
                    a register class.
                  </>
                )}
                <span className="mt-2 inline-flex items-center gap-1.5 text-[var(--pt-muted)]">
                  <CalendarClock size={13} aria-hidden="true" />
                  Periods run Monday to Friday.
                </span>
              </EmptyNote>
            )}
          </Panel>
        </div>
      </div>
    </PortalShell>
  );
}
