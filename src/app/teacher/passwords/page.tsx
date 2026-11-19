import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { TeacherPasswordResetCard } from "@/components/portal/teacher-password-reset";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getTeacherResetRoster } from "@/lib/portal-password-reset-roster";
import { chatUnreadBadge } from "@/lib/portal-questions";
import { getBroadcastUnreadCount } from "@/lib/school-broadcasts";

export const metadata: Metadata = {
  title: "Student Passwords | St. Thomas' College, Matale",
};

/**
 * v2.9.15.0 — the owner's request: "student password reset option eka
 * dashboard ekata danna epa. eka side panel eke wenama section ekak
 * widiyata danna." The reset roster left the dashboard body and lives here
 * as its own side-panel section, scoped exactly like the reset API: only
 * the classes this teacher LEADS (class teacher or assistant).
 */
export default async function TeacherPasswordsPage() {
  const session = await requirePortal("teacher");
  const [groups, chatBadge, broadcastUnread] = await Promise.all([
    getTeacherResetRoster(session.accountId),
    chatUnreadBadge("teacher", session.accountId),
    getBroadcastUnreadCount(session.accountId, "teacher"),
  ]);
  const totalStudents = groups.reduce((n, g) => n + g.students.length, 0);

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      bellUnread={broadcastUnread}
      nav={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Calendar", href: "/teacher#calendar" },
        { label: "Attendance", href: "/teacher/attendance" },
        { label: "Assignments", href: "/teacher/assignments" },
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Report card", href: "/teacher/report-card" },
        { label: "Notifications", href: "/teacher/notifications", badge: broadcastUnread },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Student passwords", href: "/teacher/passwords", active: true },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Marking", href: "/teacher#marking" },
        { label: "My Storage", href: "/teacher/storage" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <div className="pt-rise">
          <HeroRow
            overline="Class teacher power"
            firstName={session.fullName.split(/\s+/)[0] || "Teacher"}
            secondaryLabel="Reset roster"
            secondaryValue={
              totalStudents > 0
                ? `${groups.length} ${groups.length === 1 ? "class" : "classes"} · ${totalStudents} students`
                : "No led classes"
            }
            ctaLabel="Attendance register"
            ctaHref="/teacher/attendance"
          />
        </div>

        <div className="pt-rise pt-d1">
          {groups.length > 0 ? (
            <TeacherPasswordResetCard groups={groups} />
          ) : (
            <Panel title="Student passwords">
              <EmptyNote>
                Password resets are a class-teacher power — you can reset
                passwords only for students in a class you lead (as class
                teacher or assistant class teacher). Once the office assigns
                you a class, its roster appears here.
              </EmptyNote>
            </Panel>
          )}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--pt-muted)]">
          <KeyRound size={12} aria-hidden="true" />
          The one-time password shows once — the student replaces it at the
          next sign-in.
        </p>
      </div>
    </PortalShell>
  );
}
