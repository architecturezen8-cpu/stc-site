import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { TeacherMarks } from "@/components/portal/teacher-marks";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getTeacherAssignmentOptions } from "@/lib/portal-assignments";
import { getTeacherAssessments } from "@/lib/portal-classroom";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Marks | Teacher Portal · St. Thomas' College, Matale",
};

/**
 * PHASE 3.1-e — the teacher's marks hub: create term assessments for a
 * class×subject, then enter (and re-enter to correct) the whole class
 * register of marks in one save.
 */
export default async function TeacherMarksPage() {
  const session = await requirePortal("teacher");
  const [options, assessments, chatBadge] = await Promise.all([
    getTeacherAssignmentOptions(session.accountId),
    getTeacherAssessments(session.accountId),
    /* v2.8.51.0 — the Chat nav badge: unread student questions. */
    chatUnreadBadge("teacher", session.accountId),
  ]);

  const totalMarked = assessments.reduce((sum, a) => sum + a.markedCount, 0);

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
        /* v2.8.51.0 — the dedicated Chat section with the unread badge */
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        { label: "Marks", href: "/teacher/marks", active: true },
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
          overline="Term tests · marks registers"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Teacher"}
          secondaryLabel="Assessments"
          secondaryValue={
            assessments.length > 0
              ? `${assessments.length} recorded · ${totalMarked} mark${totalMarked === 1 ? "" : "s"} entered`
              : "Nothing recorded yet"
          }
          ctaLabel="New assessment"
          ctaHref="#compose"
        />

        <TeacherMarks options={options} initialAssessments={assessments} />
      </div>
    </PortalShell>
  );
}
