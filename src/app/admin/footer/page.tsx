import { AdminShell } from "@/components/admin/admin-shell";
import { FooterManager } from "@/components/admin/footer-manager";
import { requirePermission } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/cms";
import { getSchoolCrestValue, stampLogoUrl } from "@/lib/logos";

export const dynamic = "force-dynamic";

export default async function AdminFooterPage() {
  const admin = await requirePermission("footer", "read");
  const settings = await getSiteSettings("draft");
  /* v2.8.60.0 — the preview crest comes from the central registry. */
  const crest = await getSchoolCrestValue().catch(() => null);
  const crestSrc = crest?.src ? stampLogoUrl(crest) : "";
  return (
    <AdminShell
      user={admin}
      title="Footer"
      subtitle="Description, address & contact details shown in the public footer"
    >
      <FooterManager initial={settings} crestSrc={crestSrc} />
    </AdminShell>
  );
}
