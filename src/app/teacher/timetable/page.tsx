import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { TimetableEditor } from "@/components/portal/teacher-timetable";
import { TimetableGridView } from "@/components/portal/timetable-grid-view";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import {
  getTeacherPersonId,
  getTeacherTeachingWeek,
  listTimetableClasses,
} from "@/lib/portal-timetable";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Timetable | Teacher Portal · St. Thomas' College, Matale",
};

/** Asia/Colombo weekday index (0 = Sunday … 6 = Saturday) — the same
    server-side computation the student timetable page uses. */
function colomboDayIndex(): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    weekday: "short",
  }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

/**
 * PHASE 3.1 (v2.8.54.0) — the timetable EDITOR. The teacher picks a class,
 * taps a cell (class × day × period) and sets its subject, teacher and
 * room — or clears it to a free period. Their own lessons are ringed gold.
 *
 * v2.8.55.0 (owner items 4 + 7) — MY TEACHING TIMETABLE on top: the
 * teacher's personal week, DERIVED from every class timetable where they
 * are the named teacher. The LMS admin (and class teachers) fill the class
 * grids; this panel re-computes itself from those rows on every load — so
 * office-made assignments and relief cover show up here AND on the
 * students' class grid from ONE source of truth. Nothing to sync by hand.
 */
export default async function TeacherTimetablePage() {
  const session = await requirePortal("teacher");
  const [classes, meTeacherId, teaching, chatBadge] = await Promise.all([
    listTimetableClasses(session.accountId),
    getTeacherPersonId(session.accountId),
    getTeacherTeachingWeek(session.accountId),
    chatUnreadBadge("teacher", session.accountId),
  ]);

  const today = colomboDayIndex();
  const mySlots = teaching.slots;
  const myToday = mySlots.filter((s) => s.dayOfWeek === today).length;

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Attendance", href: "/teacher/attendance" },
        { label: "Assignments", href: "/teacher/assignments" },
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher/timetable", active: true },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Marking", href: "/teacher#marking" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Class × day × period"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Teacher"}
          secondaryLabel="The Week"
          secondaryValue={
            mySlots.length > 0
              ? `${mySlots.length} lessons of yours · ${myToday} today`
              : classes.length > 0
                ? `${classes.length} classes on the grid`
                : "No classes yet"
          }
          ctaLabel="Today's Lessons"
          ctaHref="/teacher#timetable"
        />

        {/* v2.8.55.0 — the personal teaching week (derived, always in sync). */}
        <div className="pt-rise pt-d1">
          <Panel
            title="My Teaching Timetable"
            subtitle="Every period where you are the teacher — fills itself from the class timetables"
          >
            {mySlots.length > 0 ? (
              <>
                <TimetableGridView
                  slots={mySlots.map((s) => ({
                    dayOfWeek: s.dayOfWeek,
                    periodNo: s.periodNo,
                    subjectName: s.label,
                    subjectCode: null,
                    teacherName: null,
                    room: s.room,
                    contextLabel: s.className,
                  }))}
                  highlightDay={today}
                />
                <p className="mt-3 text-[11.5px] text-[var(--pt-muted)]">
                  The LMS admin and class teachers set these on the class
                  timetables — this week updates the moment they do, including
                  relief cover the office assigns to you.
                </p>
              </>
            ) : (
              <EmptyNote>
                Your teaching timetable appears here as soon as the LMS admin
                or a class teacher puts your name on a class timetable period.
              </EmptyNote>
            )}
          </Panel>
        </div>

        <div className="pt-rise pt-d2">
          <Panel
            title="Class Timetable"
            subtitle="Pick a class, tap a cell, set the lesson"
          >
            <TimetableEditor classes={classes} meTeacherId={meTeacherId} />
          </Panel>
        </div>
      </div>
    </PortalShell>
  );
}
