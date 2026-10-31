import { AdminShell } from "@/components/admin/admin-shell";
import { EmailSwitchesManager } from "@/components/admin/email-switches-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * v2.8.87.0 — Admin Studio → System → Email Alerts. The owner's on/off
 * control over every non-security mail the site sends (application and
 * form-submission receipts, office heads-ups, appointment status emails).
 */
export default async function AdminEmailPage() {
  const admin = await requirePermission("settings", "read");

  return (
    <AdminShell
      user={admin}
      title="Email Alerts"
      subtitle="System · which emails the site sends — receipts, office heads-ups, statuses"
    >
      <EmailSwitchesManager />
    </AdminShell>
  );
}
