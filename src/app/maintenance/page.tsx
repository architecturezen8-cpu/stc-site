import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMaintenanceState } from "@/lib/maintenance";
import { getSiteSettings } from "@/lib/cms";
import { SITE_SETTINGS_DEFAULTS } from "@/lib/cms-defaults";
import { getSchoolCrestValue, stampLogoUrl } from "@/lib/logos";
import { MaintenanceCrest } from "@/components/maintenance-crest";
import { MaintenanceLottie } from "@/components/maintenance-lottie";
import { MaintenanceReviveCheck } from "@/components/maintenance-revive";
import {
  FacebookIcon,
  InstagramIcon,
  ThreadsIcon,
  XIcon,
  YoutubeIcon,
} from "@/components/maintenance-icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "We'll be back soon · St. Thomas' College Matale",
};

/**
 * MAINTENANCE SCREEN (v2.8.39.2 redesign) — an Apple-style "We'll be back"
 * page: one centered column, the school crest in a white circle, a big calm
 * headline, two subdued lines, a hair-thin indeterminate bar and a row of
 * social glyphs in white circles. Light + dark are chosen purely by the
 * visitor's OS preference (`.maintenance-scope` in globals.css flips on
 * prefers-color-scheme — no visitor toggle here).
 *
 * Every word, the crest and the social links are editable from the Admin
 * Studio (Settings → "Maintenance page content") through the same
 * SITE_SETTINGS_DEFAULTS pipeline the cinematic preloader uses.
 * The body text is the editable Sub-line key — the maintenance-mode duty
 * message only stands in when the sub-line is left empty (v2.8.41.0).
 * Admins never see this screen — their session bypasses the gate in
 * src/middleware.ts so they can preview the real site.
 */

/** Accept bare domains ("facebook.com/stcmatale") as https URLs. */
function normalizeUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default async function MaintenancePage({
  searchParams,
}: {
  /* Next 16 — searchParams arrives as a promise in server components. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = await getMaintenanceState();
  /* v2.8.59.0 — the ORIGINAL destination the middleware stamped (?from=…):
     the revive poller sends the visitor back there when the curtain lifts. */
  const sp = await searchParams;
  const fromRaw = typeof sp.from === "string" ? sp.from : undefined;
  const from =
    fromRaw && fromRaw.startsWith("/") && !fromRaw.startsWith("//")
      ? fromRaw.slice(0, 300)
      : undefined;

  /* v2.8.60.0 — THE CURTAIN MUST NOT OUTLIVE THE SWITCH (the owner: "api
     off karama user page eka load karama maintenance page eka ain wela
     home page eketa redirect wenna hadanna barida"). /maintenance is an
     EXEMPT path, so a visitor parked here used to redraw the curtain on
     every reload even after an admin turned the mode OFF — the JS poller
     was the only way out. Now the page ITSELF checks the switch on the
     server: curtain down → instant redirect to where the visitor came
     from (or the homepage), no JavaScript, no wait. */
  if (!state.enabled) {
    redirect(from ?? "/");
  }

  /* Published site settings (same pipeline the root layout reads for the
     preloader). DB trouble must never blank the screen — defaults stand in. */
  let settings: Record<string, string> = { ...SITE_SETTINGS_DEFAULTS };
  try {
    settings = await getSiteSettings("published");
  } catch {
    /* keep defaults */
  }

  const title = settings.siteMaintenanceTitle?.trim() || SITE_SETTINGS_DEFAULTS.siteMaintenanceTitle;
  /* v2.8.41.0 — the editable Sub-line WINS (owner: "Sub-line kiyana eka
     wadak na ne, eka kohetawath apply wenne na ne"). The duty message stored
     on the maintenance switch is now only a last-resort fallback for an
     EMPTY sub-line, never a replacement for it. */
  const body =
    settings.siteMaintenanceSubtitle?.trim() ||
    state.message.trim() ||
    SITE_SETTINGS_DEFAULTS.siteMaintenanceSubtitle;

  /* Crest chain — maintenance override → the REGISTRY College Crest (the
     ONE crest source, v2.8.60.0) → shield mark (the same golden-shield
     fallback the cinematic preloader draws). */
  let crest = settings.siteMaintenanceLogo?.trim() || "";
  if (!crest) {
    try {
      const crestValue = await getSchoolCrestValue();
      crest = crestValue.src ? stampLogoUrl(crestValue) : "";
    } catch {
      crest = "";
    }
  }

  const showSocial = settings.siteMaintenanceShowSocial !== "false";
  const socials = [
    { label: "Facebook", href: normalizeUrl(settings.siteMaintenanceFacebook), Icon: FacebookIcon },
    { label: "Instagram", href: normalizeUrl(settings.siteMaintenanceInstagram), Icon: InstagramIcon },
    { label: "YouTube", href: normalizeUrl(settings.siteMaintenanceYoutube), Icon: YoutubeIcon },
    { label: "Threads", href: normalizeUrl(settings.siteMaintenanceThreads), Icon: ThreadsIcon },
    { label: "X (Twitter)", href: normalizeUrl(settings.siteMaintenanceX), Icon: XIcon },
  ].filter((s) => s.href !== "");

  return (
    <main className="maintenance-scope relative flex min-h-screen flex-col items-center overflow-hidden px-4 text-center">
      {/* v2.8.59.0 — the live heartbeat: the moment an admin switches
          maintenance OFF this tab navigates itself back to ?from= (or the
          homepage) — no URL re-entry, no manual refresh. */}
      <MaintenanceReviveCheck from={from} />
      {/* Centered column */}
      <div className="flex w-full max-w-[520px] flex-1 flex-col items-center justify-center py-20">
        {/* School crest in a white circle — MaintenanceCrest falls back to
            the inked shield when the CMS URL fails to load (v2.8.40.1). */}
        <div className="mtc-disc mtc-rise">
          <MaintenanceCrest src={crest} />
        </div>

        {/* Headline + subdued body */}
        <h1 className="mtc-rise mtc-d1 mt-10 text-4xl font-semibold tracking-tight sm:text-[44px] sm:leading-[1.1]">
          {title}
        </h1>
        <p className="mtc-muted mtc-rise mtc-d2 mt-4 max-w-[380px] text-[15px] leading-relaxed">
          {body}
        </p>

        {/* One small live accent + hair-thin indeterminate bar */}
        <div className="mtc-faint mtc-rise mtc-d3 mt-8 flex items-center gap-2.5">
          <MaintenanceLottie
            variant="pulse"
            label="Maintenance in progress"
            className="h-4 w-4"
          />
          <span className="text-xs font-medium tracking-wide">Maintenance in progress</span>
        </div>
        <div
          className="mtc-bar mtc-rise mtc-d3 mt-6"
          role="progressbar"
          aria-label="Maintenance in progress"
        >
          <span className="mtc-bar-fill" />
        </div>

        {/* Social glyphs in white circles */}
        {showSocial && socials.length > 0 && (
          <nav
            aria-label="College social profiles"
            className="mtc-rise mtc-d4 mt-12 flex flex-wrap items-center justify-center gap-3"
          >
            {socials.map(({ label, href, Icon }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="mtc-social" aria-label={label} title={label}>
                <Icon size={17} />
              </a>
            ))}
          </nav>
        )}
      </div>

      {/* Motto footer */}
      <footer className="mt-auto pb-8">
        <p className="mtc-faint text-[11px] font-medium uppercase tracking-[0.28em]">
          Animo et Fide · Est. 1873
        </p>
      </footer>
    </main>
  );
}
