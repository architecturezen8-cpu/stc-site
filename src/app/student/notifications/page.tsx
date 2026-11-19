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
 * v2.8.71.0 — the DEDICATED school-notifications page (owner item 2: "aya
 * notifications walata wenama page ekak thiyanna — eke okkoma notifications
 * balaganna puluwan"). The dashboard panel moved here: the full list with
 * the All / Unread / Read filters, mark-read and the purge-consent cards.
 * The header bell previews new arrivals and its "View all" leads here.
 */
export default async function StudentNotificationsPage() {
  const session = await requirePortal("student");
  const [broadcastUnread, chatBadge] = await Promise.all([
    getBroadcastUnreadCount(session.accountId, "student"),
    chatUnreadBadge("student", session.accountId),
  ]);

  return (
    <PortalShell
      role="student"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      bellUnread={broadcastUnread}
      nav={[
        { label: "Dashboard", href: "/student" },
        { label: "Calendar", href: "#calendar" },
        { label: "Timetable", href: "/student/timetable" },
        { label: "Homework", href: "/student/homework" },
        { label: "Chat", href: "/student/chat", badge: chatBadge },
        { label: "Marks", href: "#marks" },
        { label: "Notifications", href: "/student/notifications", active: true, badge: broadcastUnread },
        { label: "Notices", href: "#notices" },
        { label: "My Storage", href: "/student/storage" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <NotificationsWidget role="student" initialUnread={broadcastUnread} />
      </div>
    </PortalShell>
  );
}
