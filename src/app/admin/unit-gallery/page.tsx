import { AdminShell } from "@/components/admin/admin-shell";
import { UnitGalleryManager } from "@/components/admin/unit-gallery-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminUnitGalleryPage() {
  const admin = await requirePermission("unit-gallery", "read");
  return (
    <AdminShell
      user={admin}
      title="Unit Galleries"
      subtitle="Photos for each cadet unit detail page — like the main gallery archive, per unit"
    >
      <UnitGalleryManager />
    </AdminShell>
  );
}
