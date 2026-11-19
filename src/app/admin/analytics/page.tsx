import { AdminShell } from "@/components/admin/admin-shell";
import { AnalyticsManager } from "@/components/admin/analytics-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  const admin = await requirePermission("analytics", "read");
  return (
    <AdminShell
      user={admin}
      title="Analytics"
      subtitle="First-party visitor analytics — page views, uniques and referrers, cookie-less"
    >
      <AnalyticsManager />
    </AdminShell>
  );
}
