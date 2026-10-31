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
 * v2.8.71.0 — the DEDICATED school-notifications page for the principal
 * portal (owner item 2). Full list + All / Unread / Read filters; the
 * header bell is the quick preview.
 */
export default async function PrincipalNotificationsPage() {
  const session = await requirePortal("principal");
  const broadcastUnread = await getBroadcastUnreadCount(session.accountId, "principal");

  return (
    <PortalShell
      role="principal"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      bellUnread={broadcastUnread}
      nav={[
        { label: "Dashboard", href: "/principal" },
        { label: "Notifications", href: "/principal/notifications", active: true, badge: broadcastUnread },
        { label: "Certify", href: "/principal/report-card" },
        { label: "Signature", href: "/principal/signature" },
        { label: "Profile", href: "/principal/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <NotificationsWidget role="principal" initialUnread={broadcastUnread} />
      </div>
    </PortalShell>
  );
}
