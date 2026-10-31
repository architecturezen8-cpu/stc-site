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
import {
  CinematicOpening,
  normalizePreloaderSettings,
  type OpeningScene,
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

export function PreloadersManager({
  initialOverrides,
  initialSitePreloader,
}: {
  initialOverrides: OverrideRow[];
  initialSitePreloader?: Record<string, string>;
}) {
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
  const [site, setSite] = useState(() => {
    const n = normalizePreloaderSettings(initialSitePreloader);
    return {
      sitePreloaderEnabled: n.enabled,
      sitePreloaderLogo: n.logo,
      sitePreloaderLogoScale: n.logoScale,
      sitePreloaderTitle: n.title,
      sitePreloaderMotto: n.motto,
      sitePreloaderLines: n.lines,
      sitePreloaderTitleScale: n.titleScale,
      sitePreloaderMottoScale: n.mottoScale,
      sitePreloaderLinesScale: n.linesScale,
      sitePreloaderHold: n.hold,
      sitePreloaderProgress: n.progress,
      sitePreloaderWhiteCircle: n.whiteCircle,
      sitePreloaderCircleScale: n.circleScale,
      sitePreloaderCircleRing: n.circleRing,
      sitePreloaderBarWidth: n.barWidth,
      sitePreloaderMobileLogoScale: n.mobileLogoScale,
      sitePreloaderMobileBarWidth: n.mobileBarWidth,
      sitePreloaderExit: n.exit,
      sitePreloaderFrequency: n.frequency,
      routeLoaderEnabled: n.routeLoader,
    };
  });
  const [siteBusy, setSiteBusy] = useState(false);
  const [siteMsg, setSiteMsg] = useState<string | null>(null);

  const siteScene: PreloaderSettings = {
    enabled: site.sitePreloaderEnabled,
    logo: site.sitePreloaderLogo,
    logoScale: site.sitePreloaderLogoScale,
    title: site.sitePreloaderTitle,
    motto: site.sitePreloaderMotto,
    lines: site.sitePreloaderLines,
    titleScale: site.sitePreloaderTitleScale,
    mottoScale: site.sitePreloaderMottoScale,
    linesScale: site.sitePreloaderLinesScale,
    hold: site.sitePreloaderHold,
    progress: site.sitePreloaderProgress,
    whiteCircle: site.sitePreloaderWhiteCircle,
    circleScale: site.sitePreloaderCircleScale,
    circleRing: site.sitePreloaderCircleRing,
    barWidth: site.sitePreloaderBarWidth,
    mobileLogoScale: site.sitePreloaderMobileLogoScale,
    mobileBarWidth: site.sitePreloaderMobileBarWidth,
    exit: site.sitePreloaderExit,
    frequency: site.sitePreloaderFrequency,
    routeLoader: site.routeLoaderEnabled,
  };

  /* v2.8.93.0 — mobile override display values: "" follows the desktop
     slider, so the labels always show what phones will actually use. */
  const mobileLogoPct = Math.min(
    220,
    Math.max(40, Number(site.sitePreloaderMobileLogoScale) || Number(site.sitePreloaderLogoScale) || 100),
  );
  const mobileBarPct = Math.min(
    100,
    Math.max(40, Number(site.sitePreloaderMobileBarWidth) || Number(site.sitePreloaderBarWidth) || 100),
  );
  const mobileCustom = Boolean(
    site.sitePreloaderMobileLogoScale || site.sitePreloaderMobileBarWidth,
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

  /* Full-screen preview — plays the exact scene visitors will see. */
  const [pv, setPv] = useState<{
    scene: OpeningScene;
    progress: number;
    closing: boolean;
  } | null>(null);
  const pvTimers = useRef<number[]>([]);
  const stopPreviewTimers = () => {
    pvTimers.current.forEach((t) => window.clearTimeout(t));
    pvTimers.current = [];
  };
  const playPreview = () => {
    stopPreviewTimers();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const k = reduced ? 0.35 : 1;
    const hold = Math.max(1400, Math.min(9000, Number(site.sitePreloaderHold) || 2600));
    const titleAt = Math.max(1900, hold + 460);
    const exitAt = titleAt + Math.round(2600 * k);
    setPv({ scene: "logo", progress: 6, closing: false });
    pvTimers.current = [
      window.setTimeout(() => setPv((s) => s && { ...s, progress: 46 }), 340),
      window.setTimeout(() => setPv((s) => s && { ...s, progress: 72 }), 820),
      window.setTimeout(() => setPv((s) => s && { ...s, progress: 90 }), 1450),
      window.setTimeout(() => setPv((s) => s && { ...s, progress: 100 }), Math.max(1700, hold - 250)),
      window.setTimeout(() => setPv({ scene: "title", progress: 100, closing: false }), titleAt),
      window.setTimeout(() => setPv((s) => s && { ...s, closing: true }), exitAt),
      window.setTimeout(() => setPv(null), exitAt + 1150),
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
          The big first-load experience, in three beats: the school logo shows
          inside a white circle while a thin sharp-edged golden progress bar
          fills and three short sentences cycle beneath it, then the bar hides
          and the school name is drawn letter-by-letter below the logo with
          the motto landing under it — finally everything fades and the site
          enters. Every word, image, size and timing is editable.
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
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Crest / logo (empty = golden shield mark)</span>
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

          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">School name (drawn letter-by-letter below the logo)</span>
            <input
              value={site.sitePreloaderTitle}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderTitle: e.target.value }))}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none focus:border-[#ffd444]"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Loading sentences (one per line — cycle under the bar; keep them short)</span>
            <textarea
              rows={3}
              value={site.sitePreloaderLines}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderLines: e.target.value }))}
              placeholder={"First sentence\nSecond sentence\nThird sentence"}
              className="w-full resize-y rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[12px] leading-relaxed text-white outline-none focus:border-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Motto (small, under the school name)</span>
            <input
              value={site.sitePreloaderMotto}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderMotto: e.target.value }))}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none focus:border-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Progress beat minimum (ms) — waits for real load too</span>
            <input
              type="number"
              min="1400"
              max="9000"
              step="100"
              value={site.sitePreloaderHold}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderHold: e.target.value }))}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] text-white outline-none focus:border-[#ffd444]"
            />
          </label>

          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70">
            Thin golden progress bar + sentences
            <input
              type="checkbox"
              checked={site.sitePreloaderProgress !== "false"}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderProgress: e.target.checked ? "true" : "false" }))}
              className="h-4 w-4 accent-[#ffd444]"
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70">
            White circle around the logo
            <input
              type="checkbox"
              checked={site.sitePreloaderWhiteCircle !== "false"}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderWhiteCircle: e.target.checked ? "true" : "false" }))}
              className="h-4 w-4 accent-[#ffd444]"
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70">
            <span className="min-w-0">Golden animation ring around the circle</span>
            <input
              type="checkbox"
              checked={site.sitePreloaderCircleRing !== "false"}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderCircleRing: e.target.checked ? "true" : "false" }))}
              className="h-4 w-4 shrink-0 accent-[#ffd444]"
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-[12px] text-white/70">
            <span className="min-w-0">Network round preloader (slow-navigation ring)</span>
            <input
              type="checkbox"
              checked={site.routeLoaderEnabled !== "false"}
              onChange={(e) => setSite((s) => ({ ...s, routeLoaderEnabled: e.target.checked ? "true" : "false" }))}
              className="h-4 w-4 shrink-0 accent-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Exit style</span>
            <select
              value={site.sitePreloaderExit}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderExit: e.target.value }))}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
            >
              <option value="fade">Everything fades out (recommended)</option>
              <option value="curtain">Cinema curtains slide apart</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Crest size — {Math.min(220, Math.max(40, Number(site.sitePreloaderLogoScale) || 100))}%</span>
            <input
              type="range"
              min={40}
              max={220}
              step={5}
              value={Math.min(220, Math.max(40, Number(site.sitePreloaderLogoScale) || 100))}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderLogoScale: e.target.value }))}
              aria-label="Crest size"
              className="mt-3 w-full accent-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">White circle size — {Math.min(200, Math.max(60, Number(site.sitePreloaderCircleScale) || 100))}%</span>
            <input
              type="range"
              min={60}
              max={200}
              step={5}
              value={Math.min(200, Math.max(60, Number(site.sitePreloaderCircleScale) || 100))}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderCircleScale: e.target.value }))}
              aria-label="White circle size"
              className="mt-3 w-full accent-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Progress bar width — {Math.min(100, Math.max(40, Number(site.sitePreloaderBarWidth) || 100))}%</span>
            <input
              type="range"
              min={40}
              max={100}
              step={5}
              value={Math.min(100, Math.max(40, Number(site.sitePreloaderBarWidth) || 100))}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderBarWidth: e.target.value }))}
              aria-label="Progress bar width"
              className="mt-3 w-full accent-[#ffd444]"
            />
          </label>
          {/* v2.8.93.0 — per-device overrides (Task 97, G13): phones can
              carry their own crest size and bar width; "" = same as the
              desktop/shared value, so nothing changes until set. */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Mobile devices (phones)
              </span>
              {mobileCustom ? (
                <button
                  type="button"
                  onClick={() =>
                    setSite((s) => ({
                      ...s,
                      sitePreloaderMobileLogoScale: "",
                      sitePreloaderMobileBarWidth: "",
                    }))
                  }
                  className="rounded-full border border-white/12 px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white"
                >
                  Match desktop
                </button>
              ) : (
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-white/40">
                  Same as desktop
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
              Leave untouched and phones follow the sizes above. Narrow the
              browser window to preview the mobile look.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Mobile crest size — {mobileLogoPct}%</span>
                <input
                  type="range"
                  min={40}
                  max={220}
                  step={5}
                  value={mobileLogoPct}
                  onChange={(e) => setSite((s) => ({ ...s, sitePreloaderMobileLogoScale: e.target.value }))}
                  aria-label="Mobile crest size"
                  className="mt-3 w-full accent-[#ffd444]"
                />
              </label>
              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Mobile bar width — {mobileBarPct}%</span>
                <input
                  type="range"
                  min={40}
                  max={100}
                  step={5}
                  value={mobileBarPct}
                  onChange={(e) => setSite((s) => ({ ...s, sitePreloaderMobileBarWidth: e.target.value }))}
                  aria-label="Mobile progress bar width"
                  className="mt-3 w-full accent-[#ffd444]"
                />
              </label>
            </div>
          </div>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Title size (school name) — {Math.min(200, Math.max(60, Number(site.sitePreloaderTitleScale) || 100))}%</span>
            <input
              type="range"
              min={60}
              max={200}
              step={5}
              value={Math.min(200, Math.max(60, Number(site.sitePreloaderTitleScale) || 100))}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderTitleScale: e.target.value }))}
              aria-label="Title size"
              className="mt-3 w-full accent-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Motto / subheading size — {Math.min(220, Math.max(60, Number(site.sitePreloaderMottoScale) || 100))}%</span>
            <input
              type="range"
              min={60}
              max={220}
              step={5}
              value={Math.min(220, Math.max(60, Number(site.sitePreloaderMottoScale) || 100))}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderMottoScale: e.target.value }))}
              aria-label="Motto size"
              className="mt-3 w-full accent-[#ffd444]"
            />
          </label>
          <label>
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Loading sentences size — {Math.min(220, Math.max(60, Number(site.sitePreloaderLinesScale) || 100))}%</span>
            <input
              type="range"
              min={60}
              max={220}
              step={5}
              value={Math.min(220, Math.max(60, Number(site.sitePreloaderLinesScale) || 100))}
              onChange={(e) => setSite((s) => ({ ...s, sitePreloaderLinesScale: e.target.value }))}
              aria-label="Loading sentences size"
              className="mt-3 w-full accent-[#ffd444]"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={playPreview}
              data-no-progress=""
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#ffd444]/40 bg-[#ffd444]/10 px-4 text-[12px] font-semibold text-[#ffd444] transition-colors hover:bg-[#ffd444]/20"
            >
              <Play size={14} /> Preview the opening
            </button>
          </div>
        </div>

        {siteMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300">
            <Check size={14} /> {siteMsg}
          </div>
        )}
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
            scene={pv.scene}
            closing={pv.closing}
            progress={pv.progress}
          />
        </div>
      )}
    </div>
  );
}
