import { AdminShell } from "@/components/admin/admin-shell";
import { LogosManager } from "@/components/admin/logos-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLogosPage() {
  const admin = await requirePermission("logos", "read");
  return (
    <AdminShell
      user={admin}
      title="Logos & Crests"
      subtitle="One registry · School & Portals logos go LIVE on save · every logo syncs by ID"
    >
      <LogosManager />
    </AdminShell>
  );
}
