import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { TeacherNotices } from "@/components/portal/teacher-notices";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import {
  getTeacherNotices,
  getTeacherNoticeClassOptions,
} from "@/lib/portal-classroom";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Notices | Teacher Portal · St. Thomas' College, Matale",
};

/**
 * PHASE 3.1-e — the teacher's notice boards: post a short notice to any
 * class they teach or lead; students and parents read it on their
 * dashboards the moment it lands.
 */
export default async function TeacherNoticesPage() {
  const session = await requirePortal("teacher");
  const [classOptions, notices, chatBadge] = await Promise.all([
    getTeacherNoticeClassOptions(session.accountId),
    getTeacherNotices(session.accountId),
    /* v2.8.51.0 — the Chat nav badge: unread student questions. */
    chatUnreadBadge("teacher", session.accountId),
  ]);

  const mine = notices.filter((n) => n.mine).length;

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
        { label: "Marks", href: "/teacher/marks" },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices", active: true },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Marking", href: "/teacher#marking" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Class boards · announcements"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Teacher"}
          secondaryLabel="Notices"
          secondaryValue={
            notices.length > 0
              ? `${notices.length} on your boards · ${mine} yours`
              : "Boards are quiet"
          }
          ctaLabel="Post a notice"
          ctaHref="#post"
        />

        <TeacherNotices classOptions={classOptions} initialNotices={notices} />
      </div>
    </PortalShell>
  );
}
