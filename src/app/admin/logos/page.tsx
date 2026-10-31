import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
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
      <HowThisWorks
        points={[
          "This is the single registry of every crest and logo on the website.",
          "Change a logo once here and it updates everywhere it appears — navbar, footer, portals and club pages — with no other copies to maintain.",
          "School and portal logos go live the moment you save.",
        ]}
        tip="The footer section also shows the College Crest — it edits this same registry entry, so both doors always agree."
      />
    </AdminShell>
  );
}
