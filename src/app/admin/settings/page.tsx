import { AdminShell } from "@/components/admin/admin-shell";
import { SettingsForm } from "@/components/admin/settings-form";
import { MaintenanceSettings } from "@/components/admin/maintenance-settings";
import { requirePermission } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/cms";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = await requirePermission("settings", "read");
  const settings = await getSiteSettings("draft");
  return (
    <AdminShell user={admin} title="Site Settings" subtitle="Browser tab icon, brand basics & site availability">
      <div className="space-y-6">
        <SettingsForm initial={settings} />
        <MaintenanceSettings />
      </div>
    </AdminShell>
  );
}
