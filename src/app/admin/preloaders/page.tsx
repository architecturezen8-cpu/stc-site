import { AdminShell } from "@/components/admin/admin-shell";
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
          /* Map raw site keys to the preloader contract — the manager's
             normalizer reads `enabled/logo/logoScale/…`, so without this the
             sliders always booted at defaults instead of the saved values. */
          enabled: settings.sitePreloaderEnabled,
          logo: settings.sitePreloaderLogo,
          logoScale: settings.sitePreloaderLogoScale,
          title: settings.sitePreloaderTitle,
          motto: settings.sitePreloaderMotto,
          lines: settings.sitePreloaderLines,
          titleScale: settings.sitePreloaderTitleScale,
          mottoScale: settings.sitePreloaderMottoScale,
          linesScale: settings.sitePreloaderLinesScale,
          hold: settings.sitePreloaderHold,
          progress: settings.sitePreloaderProgress,
          whiteCircle: settings.sitePreloaderWhiteCircle,
          circleScale: settings.sitePreloaderCircleScale,
          circleRing: settings.sitePreloaderCircleRing,
          barWidth: settings.sitePreloaderBarWidth,
          exit: settings.sitePreloaderExit,
          frequency: settings.sitePreloaderFrequency,
          routeLoader: settings.routeLoaderEnabled,
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
    </AdminShell>
  );
}
