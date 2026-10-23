import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { AttendanceMarker } from "@/components/portal/attendance-marker";
import { AttendanceHistory } from "@/components/portal/attendance-history";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getTeacherMarkableClasses } from "@/lib/portal-attendance";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Attendance Register | St. Thomas' College, Matale",
};

/** Today in Asia/Colombo as YYYY-MM-DD — computed server-side once. */
function colomboToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function TeacherAttendancePage() {
  const session = await requirePortal("teacher");
  const [classes, chatBadge] = await Promise.all([
    getTeacherMarkableClasses(session.accountId),
    /* v2.8.51.0 — the Chat nav badge: unread student questions. */
    chatUnreadBadge("teacher", session.accountId),
  ]);

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Attendance", href: "/teacher/attendance", active: true },
        { label: "Assignments", href: "/teacher/assignments" },
        /* v2.8.51.0 — the dedicated Chat section with the unread badge */
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Report card", href: "/teacher/report-card" },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Marking", href: "/teacher#marking" },
        /* v2.8.45.0 — Notices is the posting page now (was an anchor). */
        { label: "Notices", href: "/teacher/notices" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <div className="pt-rise">
          <HeroRow
            overline="Mark the daily register"
            firstName={session.fullName.split(/\s+/)[0] || "Teacher"}
            secondaryLabel="Registers"
            secondaryValue={
              classes.length > 0
                ? `${classes.length} class${classes.length === 1 ? "" : "es"} assigned`
                : "Awaiting assignment"
            }
            ctaLabel="Back to dashboard"
            ctaHref="/teacher"
          />
        </div>

        <div className="pt-rise pt-d1">
          <AttendanceMarker classes={classes} initialDay={colomboToday()} />
        </div>

        {/* v2.8.40.0 — read-only history under the register (owner request) */}
        {classes.length > 0 && (
          <div className="pt-rise pt-d2">
            <AttendanceHistory classes={classes} initialDay={colomboToday()} />
          </div>
        )}
      </div>
    </PortalShell>
  );
}
