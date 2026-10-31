import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { NotificationsWidget } from "@/components/portal/notifications-widget";
import { requirePortal } from "@/lib/portal-auth";
import { getBroadcastUnreadCount } from "@/lib/school-broadcasts";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "School Notifications | St. Thomas' College, Matale",
};
export const dynamic = "force-dynamic";

/**
 * v2.8.71.0 — the DEDICATED school-notifications page for the teacher
 * portal (owner item 2). Full list + All / Unread / Read filters; the
 * header bell is the quick preview.
 */
export default async function TeacherNotificationsPage() {
  const session = await requirePortal("teacher");
  const [broadcastUnread, chatBadge] = await Promise.all([
    getBroadcastUnreadCount(session.accountId, "teacher"),
    chatUnreadBadge("teacher", session.accountId),
  ]);

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      bellUnread={broadcastUnread}
      nav={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Calendar", href: "#calendar" },
        { label: "Attendance", href: "/teacher/attendance" },
        { label: "Assignments", href: "/teacher/assignments" },
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Report card", href: "/teacher/report-card" },
        { label: "Notifications", href: "/teacher/notifications", active: true, badge: broadcastUnread },
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
        <NotificationsWidget role="teacher" initialUnread={broadcastUnread} />
      </div>
    </PortalShell>
  );
}
