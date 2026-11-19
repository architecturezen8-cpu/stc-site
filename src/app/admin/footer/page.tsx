import { AdminShell } from "@/components/admin/admin-shell";
import { FooterManager } from "@/components/admin/footer-manager";
import { HowThisWorks } from "@/components/admin/how-this-works";
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
      subtitle="Every footer item — brand, links, socials, contact details & bottom bar"
    >
      <FooterManager initial={settings} crestSrc={crestSrc} />
      <HowThisWorks
        points={[
          "Every single item the footer shows is edited on this one page — brand, links, socials, contact details, the Admissions panel and the copyright line.",
          "The footer is edited ONLY here: the on-site visual editor simply points here, so the two can never conflict or corrupt each other.",
          "Save draft keeps your changes private; Publish footer puts them on every page of the site at once.",
        ]}
        tip="The round crest image is the central registry entry — updating it here also refreshes the navbar and the portals."
      />
    </AdminShell>
  );
}
