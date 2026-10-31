import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
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
      <HowThisWorks
        points={[
          "Each cadet unit has its own photo album on its own page — photos are added here.",
          "Works just like the main Campus Gallery: pick the unit, upload the photos, set the order.",
        ]}
        tip="Units themselves are managed in Clubs & Societies (cadeting section)."
      />
    </AdminShell>
  );
}
