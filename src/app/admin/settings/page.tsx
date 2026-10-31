import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
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
        <HowThisWorks
          className="mt-0"
          points={[
            "The school-wide basics live here: the browser tab name and icon, the brand name shown in the menu, and more.",
            "Maintenance mode takes the site offline for visitors while work happens — you can still sign in as normal.",
          ]}
          tip="The footer has its own dedicated section, and so does the menu — this page is for the school-wide basics."
        />
      </div>
    </AdminShell>
  );
}
