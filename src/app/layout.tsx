import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Inter, Inter_Tight } from "next/font/google";
import {
  PublishedVisualPatches,
  UniversalVisualEditor,
} from "@/components/cms/universal-visual-editor";
import { EditorChooser } from "@/components/cms/editor-chooser";
import { RouteLoader } from "@/components/route-progress";
import { SitePreloader } from "@/components/site-preloader";
import { MaintenanceWatch } from "@/components/maintenance-watch";
import { SiteTracker } from "@/components/site-tracker";
import {
  PRELOADER_DEFAULTS,
  normalizePreloaderSettings,
  type PreloaderSettings,
} from "@/lib/preloader-settings";
import { SitePopup } from "@/components/site-popup";
import {
  VISUAL_PATCH_BOOTSTRAP,
  getPublishedVisualPatchMap,
} from "@/lib/visual-patch-boot";
import { VisualPatchProvider } from "@/components/visual-patch-context";
import { getSiteSettings, getSiteSettingsStamp } from "@/lib/cms";
import { getSchoolCrestValue, stampLogoUrl } from "@/lib/logos";
import { SiteBrandProvider } from "@/components/site-brand";
import { SiteNavProvider } from "@/components/site-nav-context";
import { getNavTree } from "@/lib/site-nav";
import "./globals.css";

const display = Inter_Tight({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * v2.8.60.0 — the BROWSER TAB ICON is the Admin → Settings "Browser tab
 * icon" image (the owner: "falcon emblem eken watenna one browser eke uda
 * falcon eka"). Read at render time so a new icon appears on the next page
 * load; DB trouble just keeps the browser default.
 */
export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = {
    title: "St. Thomas' College Matale — Animo Et Fide",
    description:
      "St. Thomas' College, Matale. A boys' school shaping scholars, athletes, artists and leaders of uncommon character since 1873.",
  };
  try {
    const [settings, stamp] = await Promise.all([
      getSiteSettings("published"),
      getSiteSettingsStamp(),
    ]);
    const icon = (settings.falconImage ?? "").trim();
    if (!icon) return base;
    /* v2.8.67.0 — the stamp makes every assignment a NEW icon URL. Browsers
       cache favicons per URL in a disk DB; without the stamp, pages the
       browser had already visited kept showing the old/default disc even
       though every route emitted the same (new) href. */
    const stamped =
      icon + (icon.includes("?") ? "&" : "?") + "v=" + stamp.toString(36);
    return {
      ...base,
      icons: {
        icon: [{ url: stamped }],
        shortcut: [{ url: stamped }],
        apple: [{ url: stamped }],
      },
    };
  } catch {
    return base;
  }
}

// Default theme is DARK. Only an explicit visitor choice of "light" flips it.
const themeInit = `try {
  var t = localStorage.getItem("theme");
  if (t !== "light") {
    document.documentElement.classList.add("dark");
  }
} catch (e) {
  document.documentElement.classList.add("dark");
}`;

// Portal chrome (/login /register /student /teacher /parent): DARK is the
// default (matches LMS Admin Studio); an explicit visitor choice of "light"
// flips it. Runs before first paint — no theme flash.
const portalThemeInit = `try {
  var pt = localStorage.getItem("stc-portal-theme");
  if (pt !== "light" && pt !== "dark") pt = "dark";
  document.documentElement.setAttribute("data-portal-theme", pt);
} catch (e) {
  document.documentElement.setAttribute("data-portal-theme", "dark");
}`;

// LMS Admin Studio (v2.8.38.0): dual theme — pastel light + soft charcoal
// dark, defaulting to dark. Lives here (not the lms-admin layout) because
// React never executes <script> tags rendered inside body components on
// client navigations.
const lmsAdminThemeInit = `try {
  var la = localStorage.getItem("stc-lmsadmin-theme");
  if (la !== "light" && la !== "dark") la = "dark";
  document.documentElement.setAttribute("data-lmsadmin-theme", la);
} catch (e) {
  document.documentElement.setAttribute("data-lmsadmin-theme", "dark");
}`;

/**
 * Preloader bootstrap — runs BEFORE first paint so the cinematic preloader
 * never flashes for visitors who have already seen it (session/once rules),
 * and scroll locks immediately when it will play. The client component
 * reads the resulting class to decide play vs skip.
 */
function preloaderInit(enabled: boolean, frequency: string) {
  return `try {
  var skip = location.pathname.indexOf("/admin") === 0 || location.pathname.indexOf("/lms-admin") === 0 || location.pathname.indexOf("/maintenance") === 0;
  /* Arriving FROM the admin ("View site" opens the site in a new tab with an
     empty sessionStorage) must never replay the cinematic — it scroll-locks
     the page for several seconds and visitors read it as a frozen site. */
  if (!skip) { try { skip = document.referrer.indexOf("/admin") !== -1; } catch (e) {} }
  if (!skip && ${enabled ? "true" : "false"}) {
    var f = ${JSON.stringify(frequency)};
    if (f === "once") skip = localStorage.getItem("stc:site-preloader:seen") === "1";
    else if (f !== "always") skip = sessionStorage.getItem("stc:site-preloader:seen") === "1";
  } else { skip = true; }
  if (skip) document.documentElement.classList.add("stc-preloader-skip");
  else {
    document.documentElement.classList.add("stc-preloader-live");
    /* BOOT CURTAIN — hide the document BEFORE first paint so the home page
       can never flash ahead of the cinematic. React's overlay takes over
       the moment it mounts; the component (or this 4s failsafe) reveals. */
    document.documentElement.classList.add("stc-preloader-boot");
    setTimeout(function () {
      document.documentElement.classList.remove("stc-preloader-boot");
    }, 4000);
  }
} catch (e) {
  document.documentElement.classList.add("stc-preloader-skip");
}`;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  /* v2.9.7.0 — PERF: these four reads used to run one after another (four
     sequential remote round trips on EVERY page). They are independent —
     run them concurrently; the published reads behind them are 5 s cached
     (cms.ts / site-nav.ts / logos.ts / visual-patch-boot.ts). */
  const [patchMap, settings, crest, navTree] = await Promise.all([
    getPublishedVisualPatchMap(),
    getSiteSettings("published").catch(() => null),
    getSchoolCrestValue().catch(() => null),
    getNavTree(),
  ]);
  const patchJson = JSON.stringify(patchMap).replace(/</g, "\\u003c");

  /* Cinematic preloader settings (published values, legacy-normalized). */
  let preloader: PreloaderSettings = { ...PRELOADER_DEFAULTS };
  if (settings) {
    preloader = normalizePreloaderSettings({
      enabled: settings.sitePreloaderEnabled,
      logo: settings.sitePreloaderLogo,
      logoScale: settings.sitePreloaderLogoScale,
      title: settings.sitePreloaderTitle,
      motto: settings.sitePreloaderMotto,
      lines: settings.sitePreloaderLines,
      hold: settings.sitePreloaderHold,
      progress: settings.sitePreloaderProgress,
      whiteCircle: settings.sitePreloaderWhiteCircle,
      circleScale: settings.sitePreloaderCircleScale,
      circleRing: settings.sitePreloaderCircleRing,
      barWidth: settings.sitePreloaderBarWidth,
      mobileLogoScale: settings.sitePreloaderMobileLogoScale,
      mobileBarWidth: settings.sitePreloaderMobileBarWidth,
      exit: settings.sitePreloaderExit,
      frequency: settings.sitePreloaderFrequency,
      routeLoader: settings.routeLoaderEnabled,
    });
  }

  /* v2.8.61.0 — the navbar/footer crest arrives WITH the HTML (the owner's
     reload flash: golden S disc painted before the real logo). Same
     server-delivery pattern the portal layouts already use. */
  let crestSrc = "";
  if (crest?.src) crestSrc = stampLogoUrl(crest);

  /* v2.9.0.0 — the admin-managed navigation tree rides in the first HTML
     byte as well (no default-flash after Admin → Navigation edits); the
     hardcoded menu remains the fallback when the DB hiccups. (v2.9.7.0 —
     fetched concurrently in the Promise.all above.) */

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script dangerouslySetInnerHTML={{ __html: portalThemeInit }} />
        <script dangerouslySetInnerHTML={{ __html: lmsAdminThemeInit }} />
        <script
          id="stc-preloader-init"
          dangerouslySetInnerHTML={{
            __html: preloaderInit(
              preloader.enabled !== "false",
              preloader.frequency,
            ),
          }}
        />
        {/* Published visual-editor patches, applied before first paint.
            Prevents the old content flashing after an image/text change. */}
        <script
          id="stc-visual-patches"
          dangerouslySetInnerHTML={{
            __html: `window.__STC_VP__=${patchJson};${VISUAL_PATCH_BOOTSTRAP}`,
          }}
        />
      </head>
      <body
        className={`${display.variable} ${sans.variable} bg-surface font-sans text-fg antialiased`}
      >
        <SitePreloader settings={preloader} />
        {/* v2.8.60.0 — open tabs follow the maintenance switch live (public
            site + portals + login; admin studios keep their preview). */}
        <MaintenanceWatch />
        {/* v2.8.79.0 — first-party pageview beacon (public pages only; the
            component self-excludes the studios, portals and account pages). */}
        <SiteTracker />
        {/* v2.9.8.0 — the SAME published patch map the bootstrap inline
            script uses, handed to React so keyed media (SiteImage) renders
            its patched state — including image→video replacements —
            server-side, hydration-safe. */}
        <VisualPatchProvider patchMap={patchMap}>
          <SiteBrandProvider schoolLogo={crestSrc}>
            <SiteNavProvider navTree={navTree}>{children}</SiteNavProvider>
          </SiteBrandProvider>
        </VisualPatchProvider>
        <SitePopup />
        <Suspense fallback={null}>
          <PublishedVisualPatches />
          <UniversalVisualEditor />
          <EditorChooser />
          {preloader.routeLoader !== "false" && <RouteLoader />}
        </Suspense>
      </body>
    </html>
  );
}
