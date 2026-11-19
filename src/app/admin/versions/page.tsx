import { AdminShell } from "@/components/admin/admin-shell";
import { VersionsManager } from "@/components/admin/versions-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminVersionsPage() {
  const admin = await requirePermission("versions", "read");
  return (
    <AdminShell
      user={admin}
      title="Version History"
      subtitle="Every change on the site — what, when and by whom"
    >
      <VersionsManager />
    </AdminShell>
  );
}
