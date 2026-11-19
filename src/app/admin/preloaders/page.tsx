import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { PreloadersManager } from "@/components/admin/preloaders-manager";
import { requirePermission } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/cms";
import { listCadetIntroOverrides } from "@/lib/cadet-intro";

export const dynamic = "force-dynamic";

export default async function AdminPreloadersPage() {
  const admin = await requirePermission("preloaders", "read");
  const [settings, overrides] = await Promise.all([
    getSiteSettings("draft"),
    listCadetIntroOverrides(),
  ]);

  return (
    <AdminShell
      user={admin}
      title="Preloaders"
      subtitle="The site-wide cinematic opening plus a separate intro for every cadet unit"
    >
      <PreloadersManager
        initialSitePreloader={{
          /* Raw site keys — the manager normalizes them into the contract
             (per-device sets + skip) and keeps the legacy single-set keys
             as fallbacks for sites saved before v2.9.15.17. */
          enabled: settings.sitePreloaderEnabled,
          logo: settings.sitePreloaderLogo,
          frequency: settings.sitePreloaderFrequency,
          routeLoader: settings.routeLoaderEnabled,
          desktopTitle: settings.sitePreloaderDesktopTitle,
          desktopMotto: settings.sitePreloaderDesktopMotto,
          desktopSkip: settings.sitePreloaderDesktopSkip,
          desktopRing: settings.sitePreloaderDesktopRing,
          mobileTitle: settings.sitePreloaderMobileTitle,
          mobileMotto: settings.sitePreloaderMobileMotto,
          mobileSkip: settings.sitePreloaderMobileSkip,
          mobileRing: settings.sitePreloaderMobileRing,
          desktopLogoScale: settings.sitePreloaderDesktopLogoScale,
          desktopCircleScale: settings.sitePreloaderDesktopCircleScale,
          desktopNameScale: settings.sitePreloaderDesktopNameScale,
          desktopTagScale: settings.sitePreloaderDesktopTagScale,
          mobileLogoScale: settings.sitePreloaderMobileLogoScale,
          mobileCircleScale: settings.sitePreloaderMobileCircleScale,
          mobileNameScale: settings.sitePreloaderMobileNameScale,
          mobileTagScale: settings.sitePreloaderMobileTagScale,
          title: settings.sitePreloaderTitle,
          motto: settings.sitePreloaderMotto,
          circleRing: settings.sitePreloaderCircleRing,
        }}
        initialOverrides={overrides.map((o) => ({
          id: o.id,
          unitSlug: o.unitSlug,
          enabled: o.enabled,
          holdMs: o.holdMs,
          logoSrc: o.logoSrc,
          logoScale: o.logoScale,
          tagline: o.tagline,
        }))}
      />
      <HowThisWorks
        points={[
          "This is the short opening animation visitors see while the site loads.",
          "Pick the device version (Desktop or Mobile) and edit its school name, motto, skip button, ring and Stage 2 sizing (logo / circle / text) — Preview plays exactly that version.",
          "Each cadet unit can have its own separate intro for its own page.",
        ]}
        tip="You control how often it plays — every visit, once per visitor, or never."
      />
    </AdminShell>
  );
}
