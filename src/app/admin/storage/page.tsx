import { AdminShell } from "@/components/admin/admin-shell";
import { StorageExplorer } from "@/components/admin/storage-explorer";
import { StoragePanel } from "@/components/admin/storage-panel";
import { requirePermission } from "@/lib/admin-auth";
import { can } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

export default async function AdminStoragePage() {
  const admin = await requirePermission("storage", "read");
  return (
    <AdminShell
      user={admin}
      title="Storage & Quotas"
      subtitle="B2 bucket fill, per-prefix usage, folder-by-folder explorer, portal storage by role (read-only) and the 3-month cleanup marks"
    >
      <StoragePanel />
      {/* v2.8.85.0 — folder-by-folder B2 explorer + per-prefix usage strip. */}
      <StorageExplorer canEdit={can(admin.role, "storage", "edit")} />
    </AdminShell>
  );
}
