import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { NotificationsWidget } from "@/components/portal/notifications-widget";
import { requirePortal } from "@/lib/portal-auth";
import { getBroadcastUnreadCount } from "@/lib/school-broadcasts";

export const metadata: Metadata = {
  title: "School Notifications | St. Thomas' College, Matale",
};
export const dynamic = "force-dynamic";

/**
 * v2.8.71.0 — the DEDICATED school-notifications page for the parent
 * portal (owner item 2). Full list + All / Unread / Read filters; the
 * header bell is the quick preview.
 */
export default async function ParentNotificationsPage() {
  const session = await requirePortal("parent");
  const broadcastUnread = await getBroadcastUnreadCount(session.accountId, "parent");

  return (
    <PortalShell
      role="parent"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      bellUnread={broadcastUnread}
      nav={[
        { label: "Dashboard", href: "/parent" },
        { label: "Calendar", href: "#calendar" },
        { label: "Children", href: "#children" },
        { label: "Homework", href: "/parent/homework" },
        { label: "Marks", href: "/parent/marks" },
        { label: "Report card", href: "/parent/report-card" },
        { label: "Notifications", href: "/parent/notifications", active: true, badge: broadcastUnread },
        { label: "Materials", href: "/parent/materials" },
        { label: "Notices", href: "/parent/notices" },
        { label: "Support", href: "#support" },
        { label: "My Storage", href: "/parent/storage" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <NotificationsWidget role="parent" initialUnread={broadcastUnread} />
      </div>
    </PortalShell>
  );
}
