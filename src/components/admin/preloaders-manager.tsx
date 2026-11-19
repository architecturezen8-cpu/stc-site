"use client";

import { useRef, useState } from "react";
import {
  Check,
  Clapperboard,
  Film,
  Loader2,
  Play,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { useAdminAccess } from "@/components/admin/admin-access";
import {
  CinematicOpening,
  devicePreloader,
  normalizePreloaderSettings,
  SIZE_MAX,
  SIZE_MIN,
  type PreloaderDevice,
  type PreloaderSettings,
} from "@/components/site-preloader";
import { UNITS } from "@/lib/units";

type OverrideRow = {
  id: number;
  unitSlug: string;
  enabled: string;
  holdMs: number | null;
  logoSrc: string;
  logoScale: number;
  tagline: string;
};

type Draft = {
  enabled: string;
  holdMs: string;
  logoSrc: string;
  logoScale: number;
  tagline: string;
};

const inheritDraft = (): Draft => ({
  enabled: "",
  holdMs: "",
  logoSrc: "",
  logoScale: 100,
  tagline: "",
});

/* v2.9.15.18 — STAGE-2 SIZE DIALS. One dial = a 50–200% range with a
   % readout; the gold readout marks a device-owned value, the dim one
   marks a mobile value still following the desktop set. */
function SizeSlider({
  label,
  value,
  owned,
  onChange,
}: {
  label: string;
  value: number;
  owned: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/35">{label}</span>
        <span
          className={`font-display text-[11px] font-semibold ${owned ? "text-[#ffd444]" : "text-white/45"}`}
        >
          {value}%
        </span>
      </span>
      <input
        type="range"
        min={SIZE_MIN}
        max={SIZE_MAX}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-1 w-full accent-[#ffd444]"
      />
    </label>
  );
}

const sizeVal = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= SIZE_MIN && n <= SIZE_MAX ? n : 100;
};

export function PreloadersManager({
  initialOverrides,
  initialSitePreloader,
}: {
  initialOverrides: OverrideRow[];
  initialSitePreloader?: Record<string, string>;
}) {
  const { canEdit } = useAdminAccess();

  /* ── Per-unit overrides ──────────────────────────────────────────── */
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const map: Record<string, Draft> = {};
    UNITS.forEach((u) => {
      const row = initialOverrides.find((o) => o.unitSlug === u.slug);
      map[u.slug] = row
        ? {
            enabled: row.enabled,
            holdMs: row.holdMs === null ? "" : String(row.holdMs),
            logoSrc: row.logoSrc,
            logoScale: row.logoScale,
            tagline: row.tagline,
          }
        : inheritDraft();
    });
    return map;
  });
  const [hasRow, setHasRow] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(UNITS.map((u) => [u.slug, initialOverrides.some((o) => o.unitSlug === u.slug)])),
  );
  const [busyUnit, setBusyUnit] = useState<string | null>(null);
  const [unitMsg, setUnitMsg] = useState<{ slug: string; text: string } | null>(null);

  /* ── Site-wide cinematic preloader ─────────────────────────────────── */
  /* v2.9.15.17 — the reference opening's REAL knobs: global switches plus
     a DESKTOP and a MOBILE set, edited one at a time through the dropdown.
     Mobile fields hold the RAW values — "" means "follow the desktop set"
     (the same inherit rule the old per-device sliders used); desktop fields
     are seeded RESOLVED so what the admin sees is exactly what a save
     stores. Dead old-preloader keys (sizes/bar/sentences/hold/exit) are
     gone — saving drops them from the settings blob. */
  const [device, setDevice] = useState<PreloaderDevice>("desktop");
  const [site, setSite] = useState(() => {
    const n = normalizePreloaderSettings(initialSitePreloader);
    return {
      sitePreloaderEnabled: n.enabled,
      sitePreloaderLogo: n.logo,
      sitePreloaderFrequency: n.frequency,
      routeLoaderEnabled: n.routeLoader,
      sitePreloaderDesktopTitle: n.desktopTitle,
      sitePreloaderDesktopMotto: n.desktopMotto,
      sitePreloaderDesktopSkip: n.desktopSkip,
      sitePreloaderDesktopRing: n.desktopRing,
      sitePreloaderMobileTitle: initialSitePreloader?.mobileTitle ?? "",
      sitePreloaderMobileMotto: initialSitePreloader?.mobileMotto ?? "",
      sitePreloaderMobileSkip: initialSitePreloader?.mobileSkip ?? "",
      sitePreloaderMobileRing: initialSitePreloader?.mobileRing ?? "",
      sitePreloaderDesktopLogoScale: n.desktopLogoScale,
      sitePreloaderDesktopCircleScale: n.desktopCircleScale,
      sitePreloaderDesktopNameScale: n.desktopNameScale,
      sitePreloaderDesktopTagScale: n.desktopTagScale,
      sitePreloaderMobileLogoScale: initialSitePreloader?.mobileLogoScale ?? "",
      sitePreloaderMobileCircleScale: initialSitePreloader?.mobileCircleScale ?? "",
      sitePreloaderMobileNameScale: initialSitePreloader?.mobileNameScale ?? "",
      sitePreloaderMobileTagScale: initialSitePreloader?.mobileTagScale ?? "",
    };
  });
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteMsg, setSiteMsg] = useState<string | null>(null);

  /* Resolved contract the preview renders — normalize applies the inherit
     rules ("" mobile → desktop) and the legacy single-set fallbacks. */
  const siteScene: PreloaderSettings = normalizePreloaderSettings({
    enabled: site.sitePreloaderEnabled,
    logo: site.sitePreloaderLogo,
    frequency: site.sitePreloaderFrequency,
    routeLoader: site.routeLoaderEnabled,
    desktopTitle: site.sitePreloaderDesktopTitle,
    desktopMotto: site.sitePreloaderDesktopMotto,
    desktopSkip: site.sitePreloaderDesktopSkip,
    desktopRing: site.sitePreloaderDesktopRing,
    mobileTitle: site.sitePreloaderMobileTitle,
    mobileMotto: site.sitePreloaderMobileMotto,
    mobileSkip: site.sitePreloaderMobileSkip,
    mobileRing: site.sitePreloaderMobileRing,
    desktopLogoScale: site.sitePreloaderDesktopLogoScale,
    desktopCircleScale: site.sitePreloaderDesktopCircleScale,
    desktopNameScale: site.sitePreloaderDesktopNameScale,
    desktopTagScale: site.sitePreloaderDesktopTagScale,
    mobileLogoScale: site.sitePreloaderMobileLogoScale,
    mobileCircleScale: site.sitePreloaderMobileCircleScale,
    mobileNameScale: site.sitePreloaderMobileNameScale,
    mobileTagScale: site.sitePreloaderMobileTagScale,
  });
  const mobileCustom = Boolean(
    site.sitePreloaderMobileTitle ||
      site.sitePreloaderMobileMotto ||
      site.sitePreloaderMobileSkip ||
      site.sitePreloaderMobileRing ||
      site.sitePreloaderMobileLogoScale ||
      site.sitePreloaderMobileCircleScale ||
      site.sitePreloaderMobileNameScale ||
      site.sitePreloaderMobileTagScale,
  );
  const matchDesktop = () =>
    setSite((s) => ({
      ...s,
      sitePreloaderMobileTitle: "",
      sitePreloaderMobileMotto: "",
      sitePreloaderMobileSkip: "",
      sitePreloaderMobileRing: "",
      sitePreloaderMobileLogoScale: "",
      sitePreloaderMobileCircleScale: "",
      sitePreloaderMobileNameScale: "",
      sitePreloaderMobileTagScale: "",
    }));

  /* Stage-2 sizing dials — one setter serves all four; the mobile set
     stores the RAW string, the desktop set stores the resolved one. */
  const setDeviceSize = (dial: "LogoScale" | "CircleScale" | "NameScale" | "TagScale", v: number) =>
    setSite((s) =>
      ({
        ...s,
        [device === "mobile" ? `sitePreloaderMobile${dial}` : `sitePreloaderDesktop${dial}`]: String(v),
      }) as typeof s,
    );
  const resetSizes = () =>
    setSite((s) =>
      device === "mobile"
        ? {
            ...s,
            sitePreloaderMobileLogoScale: "",
            sitePreloaderMobileCircleScale: "",
            sitePreloaderMobileNameScale: "",
            sitePreloaderMobileTagScale: "",
          }
        : {
            ...s,
            sitePreloaderDesktopLogoScale: "100",
            sitePreloaderDesktopCircleScale: "100",
            sitePreloaderDesktopNameScale: "100",
            sitePreloaderDesktopTagScale: "100",
          },
    );

  const saveSite = async (publish: boolean) => {
    setSiteBusy(true);
    setSiteMsg(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: site, publish }),
    });
    const json = await res.json().catch(() => ({}));
    setSiteMsg(res.ok ? (publish ? "Published — the cinematic preloader is live." : "Saved as draft.") : json.error ?? "Save failed.");
    setSiteBusy(false);
  };

  /* Full-screen preview — the opening self-drives the reference timeline;
     the preview only schedules its own close at the very end, sized off
     the SELECTED device's motto (reduced motion compresses it ×0.22).
     Click anywhere or press Escape to dismiss early. */
  const [pv, setPv] = useState<{ closing: boolean } | null>(null);
  const pvTimers = useRef<number[]>([]);
  const stopPreviewTimers = () => {
    pvTimers.current.forEach((t) => window.clearTimeout(t));
    pvTimers.current = [];
  };
  const playPreview = () => {
    stopPreviewTimers();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const k = reduced ? 0.22 : 1;
    const dev = devicePreloader(siteScene, device);
    const visible = [...(dev.motto.trim() || "Animo Et Fide")].filter((c) => c !== " ").length;
    const exitAt = Math.round(
      1000 +
        Math.max(1, (visible - 1) * 800 * k + 2000 * k) +
        1500 * k + 900 * k + 420 * k + 3000 * k,
    );
    setPv({ closing: false });
    pvTimers.current = [
      window.setTimeout(() => setPv((s) => s && { ...s, closing: true }), exitAt),
      window.setTimeout(() => setPv(null), exitAt + Math.round(1100 * k) + 300),
    ];
  };

  const saveUnit = async (slug: string) => {
    setBusyUnit(slug);
    setUnitMsg(null);
    const d = drafts[slug];
    const res = await fetch("/api/admin/cadet-intro", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitSlug: slug,
        enabled: d.enabled,
        holdMs: d.holdMs === "" ? null : d.holdMs,
        logoSrc: d.logoSrc,
        logoScale: d.logoScale,
        tagline: d.tagline,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setHasRow((m) => ({ ...m, [slug]: true }));
      setUnitMsg({ slug, text: "Preloader saved — live on this unit page." });
    } else {
      setUnitMsg({ slug, text: json.error ?? "Save failed." });
    }
    setBusyUnit(null);
  };

  const resetUnit = async (slug: string) => {
    setBusyUnit(slug);
    setUnitMsg(null);
    const res = await fetch(`/api/admin/cadet-intro?unitSlug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (res.ok) {
      setDrafts((m) => ({ ...m, [slug]: inheritDraft() }));
      setHasRow((m) => ({ ...m, [slug]: false }));
      setUnitMsg({ slug, text: "Reset — this unit inherits the standard defaults again." });
    } else {
      setUnitMsg({ slug, text: "Reset failed." });
    }
    setBusyUnit(null);
  };

  const updateDraft = (slug: string, patch: Partial<Draft>) =>
    setDrafts((m) => ({ ...m, [slug]: { ...m[slug], ...patch } }));

  /** Effective values shown in the mini preview for a unit. */
  const previewFor = (slug: string, name: string, crest: string, unitTagline: string) => {
    const d = drafts[slug];
    const enabled = d.enabled === "true" ? true : d.enabled === "false" ? false : true;
    const hold = d.holdMs !== "" ? Number(d.holdMs) : 2400;
    const logo = d.logoSrc || "";
    const scale = d.logoSrc ? d.logoScale : 100;
    const tagline = d.tagline || unitTagline;
    return { enabled, hold, logo, scale, tagline, name, crest };
  };

  return (
    <div className="space-y-6">
      {/* ── Site cinematic preloader ─────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          <Film size={16} className="text-[#ffd444]" />
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">Site preloader — cinematic opening</h2>
        </div>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/45">
          The reference opening, in two beats: the motto wakes letter-by-letter
          over the liquid navy canvas while a thin white progress bar fills,
          then the white disc with the school crest rises inside the
          animation ring, the school name blooms and “Est. 1873” settles
          before the site enters. Desktop and Mobile are edited separately —
          pick the device below, tune its words, sizes and switches, and
          Preview plays exactly that version.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70">
            Enable site preloader
            <input
              type="checkbox"
              checked={site.sitePreloaderEnabled !== "false"}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderEnabled: e.target.checked ? "true" : "false" }))}
              className="h-4 w-4 accent-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Play frequency</span>
            <select
              value={site.sitePreloaderFrequency}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderFrequency: e.target.value }))}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
            >
              <option value="session">Once per session (recommended)</option>
              <option value="always">Every page load</option>
              <option value="once">Only once per visitor</option>
            </select>
          </label>

          <label className="sm:col-span-2">
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Crest / logo (empty = navy shield mark)</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2">
              {site.sitePreloaderLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={site.sitePreloaderLogo} alt="" className="h-10 w-10 rounded-full border border-white/15 bg-white object-contain p-0.5" />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-[#ffd444]/40 text-[#ffd444]">✦</span>
              )}
              <input
                value={site.sitePreloaderLogo}
                onChange={(e) => setSite((s) => ({ ...s, sitePreloaderLogo: e.target.value }))}
                placeholder="/images/crest.png or https://…"
                className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-white/30"
              />
              <MediaLibraryButton
                preferFolder="logos"
                onSelect={(picked) => setSite((s) => ({ ...s, sitePreloaderLogo: picked.url }))}
              />
              {site.sitePreloaderLogo && (
                <button
                  onClick={() => setSite((s) => ({ ...s, sitePreloaderLogo: "" }))}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-white/50 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </label>

          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70 sm:col-span-2">
            <span className="min-w-0">Network round preloader (slow-navigation ring)</span>
            <input
              type="checkbox"
              checked={site.routeLoaderEnabled !== "false"}
              onChange={(e) => setSite((s) => ({ ...s, routeLoaderEnabled: e.target.checked ? "true" : "false" }))}
              className="h-4 w-4 shrink-0 accent-[#ffd444]"
            />
          </label>
        </div>

        {/* ── Device split — Desktop and Mobile sets, edited separately ── */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="min-w-[240px] flex-1">
              <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Edit device version</span>
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value === "mobile" ? "mobile" : "desktop")}
                className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
              >
                <option value="desktop">Desktop version</option>
                <option value="mobile">Mobile version (phones)</option>
              </select>
            </label>
            {device === "mobile" && mobileCustom && (
              <button
                type="button"
                onClick={matchDesktop}
                className="h-11 rounded-full border border-white/12 px-4 text-[10px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white"
              >
                Match desktop
              </button>
            )}
          </div>

          {device === "mobile" && (
            <p className="mt-2 text-[11px] leading-relaxed text-white/35">
              Empty fields follow the Desktop version — phones only diverge
              once you type here. Narrow the browser window to watch the
              mobile opening live.
            </p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
                School name (blooms under the disc){device === "mobile" ? " — empty = follow desktop" : ""}
              </span>
              <input
                value={device === "mobile" ? site.sitePreloaderMobileTitle : site.sitePreloaderDesktopTitle}
                onChange={(e) =>
                  setSite((s) =>
                    device === "mobile"
                      ? { ...s, sitePreloaderMobileTitle: e.target.value }
                      : { ...s, sitePreloaderDesktopTitle: e.target.value },
                  )
                }
                placeholder={device === "mobile" ? siteScene.desktopTitle : "St. Thomas' College Matale"}
                className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none focus:border-[#ffd444]"
              />
            </label>
            <label>
              <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
                Motto (wakes letter-by-letter on the canvas){device === "mobile" ? " — empty = follow desktop" : ""}
              </span>
              <input
                value={device === "mobile" ? site.sitePreloaderMobileMotto : site.sitePreloaderDesktopMotto}
                onChange={(e) =>
                  setSite((s) =>
                    device === "mobile"
                      ? { ...s, sitePreloaderMobileMotto: e.target.value }
                      : { ...s, sitePreloaderDesktopMotto: e.target.value },
                  )
                }
                placeholder={device === "mobile" ? siteScene.desktopMotto : "Animo Et Fide"}
                className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none focus:border-[#ffd444]"
              />
            </label>

            {device === "desktop" ? (
              <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70">
                Show the Skip button
                <input
                  type="checkbox"
                  checked={site.sitePreloaderDesktopSkip !== "false"}
                  onChange={(e) => setSite((s) => ({ ...s, sitePreloaderDesktopSkip: e.target.checked ? "true" : "false" }))}
                  className="h-4 w-4 shrink-0 accent-[#ffd444]"
                />
              </label>
            ) : (
              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Skip button</span>
                <select
                  value={site.sitePreloaderMobileSkip}
                  onChange={(e) => setSite((s) => ({ ...s, sitePreloaderMobileSkip: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                >
                  <option value="">Same as desktop ({site.sitePreloaderDesktopSkip === "false" ? "hidden" : "shown"})</option>
                  <option value="true">Show the Skip button</option>
                  <option value="false">Hide the Skip button</option>
                </select>
              </label>
            )}

            {device === "desktop" ? (
              <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70">
                <span className="min-w-0">Blue+black animation ring around the circle</span>
                <input
                  type="checkbox"
                  checked={site.sitePreloaderDesktopRing !== "false"}
                  onChange={(e) => setSite((s) => ({ ...s, sitePreloaderDesktopRing: e.target.checked ? "true" : "false" }))}
                  className="h-4 w-4 shrink-0 accent-[#ffd444]"
                />
              </label>
            ) : (
              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Animation ring</span>
                <select
                  value={site.sitePreloaderMobileRing}
                  onChange={(e) => setSite((s) => ({ ...s, sitePreloaderMobileRing: e.target.value }))}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                >
                  <option value="">Same as desktop ({site.sitePreloaderDesktopRing === "false" ? "off" : "on"})</option>
                  <option value="true">Blue+black ring on</option>
                  <option value="false">Ring off</option>
                </select>
              </label>
            )}
          </div>

          {/* ── Stage 2 sizing — the disc lockup's four dials (v2.9.15.18).
              Stage 1 (the motto wake + progress bar) stays fixed. ── */}
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-[0.18em] text-white/35">
                Stage 2 sizing — the white-circle lockup
              </span>
              <button
                type="button"
                onClick={resetSizes}
                className="rounded-full border border-white/12 px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white"
              >
                Reset sizes
              </button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
              100% is the reference size. The circle dial moves the disc, halo
              and both rings together; the logo dial scales the crest inside
              the disc.
              {device === "mobile"
                ? " The sliders start at the desktop sizes — move one and the mobile opening keeps its own."
                : ""}
            </p>
            <div className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <SizeSlider
                label="Logo size (crest inside the circle)"
                value={sizeVal(
                  device === "mobile"
                    ? site.sitePreloaderMobileLogoScale || site.sitePreloaderDesktopLogoScale
                    : site.sitePreloaderDesktopLogoScale,
                )}
                owned={device === "desktop" || Boolean(site.sitePreloaderMobileLogoScale)}
                onChange={(v) => setDeviceSize("LogoScale", v)}
              />
              <SizeSlider
                label="White circle size"
                value={sizeVal(
                  device === "mobile"
                    ? site.sitePreloaderMobileCircleScale || site.sitePreloaderDesktopCircleScale
                    : site.sitePreloaderDesktopCircleScale,
                )}
                owned={device === "desktop" || Boolean(site.sitePreloaderMobileCircleScale)}
                onChange={(v) => setDeviceSize("CircleScale", v)}
              />
              <SizeSlider
                label="School name size"
                value={sizeVal(
                  device === "mobile"
                    ? site.sitePreloaderMobileNameScale || site.sitePreloaderDesktopNameScale
                    : site.sitePreloaderDesktopNameScale,
                )}
                owned={device === "desktop" || Boolean(site.sitePreloaderMobileNameScale)}
                onChange={(v) => setDeviceSize("NameScale", v)}
              />
              <SizeSlider
                label={`“Est. 1873” line size`}
                value={sizeVal(
                  device === "mobile"
                    ? site.sitePreloaderMobileTagScale || site.sitePreloaderDesktopTagScale
                    : site.sitePreloaderDesktopTagScale,
                )}
                owned={device === "desktop" || Boolean(site.sitePreloaderMobileTagScale)}
                onChange={(v) => setDeviceSize("TagScale", v)}
              />
            </div>
          </div>
        </div>

        <div className="mt-5">
          <button
            onClick={playPreview}
            data-no-progress=""
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#ffd444]/40 bg-[#ffd444]/10 px-4 text-[12px] font-semibold text-[#ffd444] transition-colors hover:bg-[#ffd444]/20"
          >
            <Play size={14} /> Preview the {device === "mobile" ? "mobile" : "desktop"} opening
          </button>
        </div>

        {siteMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300">
            <Check size={14} /> {siteMsg}
          </div>
        )}
        {canEdit && (
        <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
          <button
            onClick={() => saveSite(false)}
            disabled={siteBusy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-[12px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:opacity-50"
          >
            {siteBusy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save draft
          </button>
          <button
            onClick={() => saveSite(true)}
            disabled={siteBusy}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-6 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50"
          >
            {siteBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Publish
          </button>
        </div>
        )}
      </section>

      {/* ── Per-unit preloaders ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          <Clapperboard size={16} className="text-[#ffd444]" />
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">Per-unit preloaders</h2>
        </div>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-white/45">
          Every cadeting page has its own preloader — edit each one separately.
          A unit without its own logo shows its synced crest automatically.
        </p>

        <div className="mt-6 space-y-5">
          {UNITS.map((unit) => {
            const d = drafts[unit.slug];
            const pv = previewFor(unit.slug, unit.name, unit.crest, unit.tagline);
            const custom = hasRow[unit.slug];
            return (
              <div
                key={unit.slug}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-white font-display text-[12px] font-bold text-[#0b0b0a] ring-1 ring-black/10">
                      {pv.logo ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={pv.logo}
                          alt=""
                          className="h-full w-full object-contain p-1"
                          style={pv.scale !== 100 ? { transform: `scale(${pv.scale / 100})` } : undefined}
                        />
                      ) : (
                        unit.crest
                      )}
                    </span>
                    <div>
                      <p className="font-display text-[15px] font-semibold text-white">{unit.name}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">
                        /cadeting/{unit.slug}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[8.5px] font-semibold uppercase tracking-[0.14em] ${
                      custom ? "bg-[#ffd444]/15 text-[#ffd444]" : "bg-white/10 text-white/40"
                    }`}
                  >
                    {custom ? "Custom" : "Standard"}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_240px]">
                  {/* Controls */}
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <label>
                      <span className="mb-1.5 block text-[9px] uppercase tracking-[0.16em] text-white/35">Intro</span>
                      <select
                        value={d.enabled}
                        onChange={(e) => updateDraft(unit.slug, { enabled: e.target.value })}
                        className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3 text-[12px] text-white outline-none focus:border-[#ffd444]"
                      >
                        <option value="">Inherit (standard: on)</option>
                        <option value="true">Always on</option>
                        <option value="false">Off for this unit</option>
                      </select>
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[9px] uppercase tracking-[0.16em] text-white/35">Hold (ms)</span>
                      <input
                        type="number"
                        min="0"
                        max="8000"
                        step="100"
                        value={d.holdMs}
                        onChange={(e) => updateDraft(unit.slug, { holdMs: e.target.value })}
                        placeholder="2400 (standard)"
                        className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1.5 block text-[9px] uppercase tracking-[0.16em] text-white/35">Preloader logo</span>
                      <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2">
                        {d.logoSrc ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={d.logoSrc} alt="" className="h-9 w-9 rounded-full border border-white/15 bg-white object-contain p-0.5" />
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-white/20 text-[7.5px] uppercase text-white/30">crest</span>
                        )}
                        <input
                          value={d.logoSrc}
                          onChange={(e) => updateDraft(unit.slug, { logoSrc: e.target.value })}
                          placeholder="Empty = unit's own synced crest"
                          className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-white/30"
                        />
                        <MediaLibraryButton
                          preferFolder="logos"
                          onSelect={(picked) => updateDraft(unit.slug, { logoSrc: picked.url })}
                        />
                        {d.logoSrc && (
                          <button
                            onClick={() => updateDraft(unit.slug, { logoSrc: "" })}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-white/50 hover:text-white"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {d.logoSrc && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/40">
                            <span>Logo size</span>
                            <span className="font-display text-[12px] font-semibold text-white">{d.logoScale}%</span>
                          </div>
                          <input
                            type="range"
                            min={40}
                            max={240}
                            step={5}
                            value={d.logoScale}
                            onChange={(e) => updateDraft(unit.slug, { logoScale: Number(e.target.value) })}
                            aria-label="Preloader logo size"
                            className="mt-2 w-full accent-[#ffd444]"
                          />
                        </div>
                      )}
                    </label>
                    <label className="sm:col-span-2">
                      <span className="mb-1.5 block text-[9px] uppercase tracking-[0.16em] text-white/35">Tagline</span>
                      <input
                        value={d.tagline}
                        onChange={(e) => updateDraft(unit.slug, { tagline: e.target.value })}
                        placeholder={`Empty = "${pv.tagline}"`}
                        className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                      />
                    </label>
                  </div>

                  {/* Live mini preview — mimics the real cinematic card */}
                  <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#060605] p-4">
                    <span className="text-[7.5px] uppercase tracking-[0.24em] text-white/30">Live preview</span>
                    <div className="flex w-full flex-col items-center rounded-xl border border-white/10 py-4">
                      <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white ring-2 ring-white/70">
                        {pv.logo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={pv.logo}
                            alt=""
                            className="h-full w-full object-contain p-1.5"
                            style={pv.scale !== 100 ? { transform: `scale(${pv.scale / 100})` } : undefined}
                          />
                        ) : (
                          <span className="font-display text-sm font-bold text-[#0b0b0a]">{pv.crest}</span>
                        )}
                      </span>
                      <p className="mt-2.5 px-2 text-center font-display text-[12.5px] font-semibold text-white">{pv.name}</p>
                      <p className="mt-1 px-3 text-center text-[7.5px] uppercase tracking-[0.22em] text-[#ffd444]">{pv.tagline}</p>
                    </div>
                    <p className="text-[8px] uppercase tracking-[0.18em] text-white/35">
                      {pv.enabled ? `${pv.hold} ms hold` : "Preloader off"}
                    </p>
                  </div>
                </div>

                {unitMsg?.slug === unit.slug && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-2.5 text-[11.5px] text-emerald-300">
                    <Check size={13} /> {unitMsg.text}
                  </div>
                )}

                {canEdit && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                  <button
                    onClick={() => saveUnit(unit.slug)}
                    disabled={busyUnit === unit.slug}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[11.5px] font-semibold text-[#0b0b0a] disabled:opacity-50"
                  >
                    {busyUnit === unit.slug ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Save preloader
                  </button>
                  {custom && (
                    <button
                      onClick={() => resetUnit(unit.slug)}
                      disabled={busyUnit === unit.slug}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-[11px] text-white/55 hover:border-white/35 hover:text-white disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> Reset to defaults
                    </button>
                  )}
                </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Full-screen preview of the cinematic opening (admin only) */}
      {pv && (
        <div
          data-no-progress=""
          role="presentation"
          onClick={() => {
            stopPreviewTimers();
            setPv(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              stopPreviewTimers();
              setPv(null);
            }
          }}
          tabIndex={-1}
        >
          <CinematicOpening
            settings={siteScene}
            device={device}
            closing={pv.closing}
          />
        </div>
      )}
    </div>
  );
}
