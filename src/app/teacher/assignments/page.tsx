import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { TeacherAssignments } from "@/components/portal/teacher-assignments";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import {
  getTeacherAssignmentOptions,
  getTeacherAssignments,
} from "@/lib/portal-assignments";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Assignments | Teacher Portal · St. Thomas' College, Matale",
};

/**
 * PHASE 3.1-d — the teacher's assignment hub: post work for a class×subject,
 * watch submissions land, read the answers and grade them with feedback.
 * ?focus=<id> deep-links from the dashboard Marking Queue.
 */
export default async function TeacherAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const session = await requirePortal("teacher");
  const [options, assignments, params, chatBadge] = await Promise.all([
    getTeacherAssignmentOptions(session.accountId),
    getTeacherAssignments(session.accountId),
    searchParams,
    /* v2.8.51.0 — the Chat nav badge: unread student questions. */
    chatUnreadBadge("teacher", session.accountId),
  ]);

  const focusRaw = Number(params.focus);
  const focusAssignmentId = Number.isInteger(focusRaw) && focusRaw > 0 ? focusRaw : null;

  const first = assignments[0];

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Attendance", href: "/teacher/attendance" },
        { label: "Assignments", href: "/teacher/assignments", active: true },
        /* v2.8.51.0 — the dedicated Chat section with the unread badge */
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Report card", href: "/teacher/report-card" },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Marking", href: "/teacher#marking" },
        { label: "My Storage", href: "/teacher/storage" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Set work · follow up · grade"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Teacher"}
          secondaryLabel="Assignments"
          secondaryValue={
            assignments.length > 0
              ? `${assignments.length} posted`
              : "Nothing posted yet"
          }
          ctaLabel={first ? "Latest: " + first.title : "Post your first"}
          ctaHref={first ? `/teacher/assignments?focus=${first.id}` : "#post"}
        />

        <TeacherAssignments
          options={options}
          initialAssignments={assignments}
          focusAssignmentId={focusAssignmentId}
        />
      </div>
    </PortalShell>
  );
}
