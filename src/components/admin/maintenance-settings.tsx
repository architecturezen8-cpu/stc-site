"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, MoonStar, ShieldCheck, TriangleAlert } from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { SITE_SETTINGS_DEFAULTS } from "@/lib/cms-defaults";

type State = {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
};

/** The editable maintenance-screen content keys (same pipeline as the
 * preloader keys — SITE_SETTINGS_DEFAULTS → PATCH /api/admin/settings). */
type MaintenanceContent = {
  siteMaintenanceTitle: string;
  siteMaintenanceSubtitle: string;
  siteMaintenanceLogo: string;
  siteMaintenanceShowSocial: string;
  siteMaintenanceFacebook: string;
  siteMaintenanceInstagram: string;
  siteMaintenanceYoutube: string;
  siteMaintenanceThreads: string;
  siteMaintenanceX: string;
};

const CONTENT_KEYS = [
  "siteMaintenanceTitle",
  "siteMaintenanceSubtitle",
  "siteMaintenanceLogo",
  "siteMaintenanceShowSocial",
  "siteMaintenanceFacebook",
  "siteMaintenanceInstagram",
  "siteMaintenanceYoutube",
  "siteMaintenanceThreads",
  "siteMaintenanceX",
] as const satisfies readonly (keyof MaintenanceContent)[];

const SOCIAL_FIELDS: { key: keyof MaintenanceContent; label: string; placeholder: string }[] = [
  { key: "siteMaintenanceFacebook", label: "Facebook", placeholder: "https://www.facebook.com/St.ThomasMatale/" },
  { key: "siteMaintenanceInstagram", label: "Instagram", placeholder: "https://www.instagram.com/stcmum/" },
  { key: "siteMaintenanceYoutube", label: "YouTube", placeholder: "https://www.youtube.com/@stcmatale" },
  { key: "siteMaintenanceThreads", label: "Threads", placeholder: "https://www.threads.net/@stcmatale" },
  { key: "siteMaintenanceX", label: "X (Twitter)", placeholder: "https://x.com/stcmediaunit" },
];

const defaultContent = (): MaintenanceContent => ({
  siteMaintenanceTitle: SITE_SETTINGS_DEFAULTS.siteMaintenanceTitle,
  siteMaintenanceSubtitle: SITE_SETTINGS_DEFAULTS.siteMaintenanceSubtitle,
  siteMaintenanceLogo: SITE_SETTINGS_DEFAULTS.siteMaintenanceLogo,
  siteMaintenanceShowSocial: SITE_SETTINGS_DEFAULTS.siteMaintenanceShowSocial,
  siteMaintenanceFacebook: SITE_SETTINGS_DEFAULTS.siteMaintenanceFacebook,
  siteMaintenanceInstagram: SITE_SETTINGS_DEFAULTS.siteMaintenanceInstagram,
  siteMaintenanceYoutube: SITE_SETTINGS_DEFAULTS.siteMaintenanceYoutube,
  siteMaintenanceThreads: SITE_SETTINGS_DEFAULTS.siteMaintenanceThreads,
  siteMaintenanceX: SITE_SETTINGS_DEFAULTS.siteMaintenanceX,
});

function pickContent(raw: Record<string, string> | undefined): MaintenanceContent {
  const base = defaultContent();
  if (!raw) return base;
  const picked = { ...base };
  for (const key of CONTENT_KEYS) {
    if (typeof raw[key] === "string") picked[key] = raw[key];
  }
  return picked;
}

/**
 * Maintenance-mode control — lives in the MAIN Admin Studio → Settings.
 * One switch takes the whole site behind the /maintenance screen while
 * signed-in admins (main studio AND LMS studio) keep a live preview.
 *
 * v2.8.40.1 — ONE editor card (owner: "than 2k nathuwa ekak karanna"): the
 * "Site availability" card keeps only the switch; EVERY word visitors read —
 * headline, sub-line, the duty message shown to visitors, crest and social
 * links — is edited in the "Maintenance page content" card below and saved
 * with one button (settings PATCH + the maintenance message POST together).
 *
 * v2.8.41.0 — the Sub-line is now the ONLY body-text field (owner: "Sub-line
 * kiyana eka wadak na ne, eka kohetawath apply wenne na ne"): the separate
 * duty-message textarea is gone and the sub-line ALWAYS wins on the screen
 * (the duty message stored with the switch stays untouched as a fallback).
 */
export function MaintenanceSettings() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  /* Maintenance-screen content (published via the settings pipeline). */
  const [content, setContent] = useState<MaintenanceContent | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentBusy, setContentBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/maintenance", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as State;
        if (cancelled) return;
        setState(data);
        setMessage(data.message);
      } catch {
        if (!cancelled) setLoadError("Could not load the maintenance setting.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json().catch(() => ({}))) as {
          settings?: Record<string, string>;
        };
        if (cancelled) return;
        setContent(pickContent(data.settings));
      } catch {
        if (!cancelled) {
          /* Defaults keep the editor usable even if the read fails. */
          setContent(defaultContent());
          setContentError("Could not load the saved content — showing defaults.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  async function toggle(enabled: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, message }),
      });
      const data = (await res.json().catch(() => ({}))) as State & { error?: string };
      if (!res.ok) throw new Error(data.error || "save failed");
      setState(data);
      setMessage(data.message);
      setFlash({
        ok: true,
        text: enabled
          ? "Maintenance mode is ON — visitors now see the maintenance screen; your admin session still previews the site."
          : "Maintenance mode is OFF — the site is open to everyone.",
      });
    } catch {
      setFlash({ ok: false, text: "Could not update maintenance mode — try again." });
    } finally {
      setBusy(false);
    }
  }

  /** One save: the screen content (settings) AND the visitor message
      (maintenance state) — the two storages behind one editor card. */
  async function saveContent() {
    if (!content || contentBusy) return;
    setContentBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: content, publish: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "save failed");

      /* The duty message rides along with the same save. */
      const msgRes = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: state?.enabled ?? false, message }),
      });
      if (!msgRes.ok) throw new Error("message save failed");

      setFlash({
        ok: true,
        text: "Maintenance page published — visitors see the new words immediately.",
      });
    } catch {
      setFlash({ ok: false, text: "Could not publish the maintenance page content — try again." });
    } finally {
      setContentBusy(false);
    }
  }

  if (loadError) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <p className="text-sm text-red-300">{loadError}</p>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="flex h-40 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm text-white/45">
        <Loader2 className="animate-spin" size={16} /> Loading maintenance settings…
      </section>
    );
  }

  const enabled = state.enabled;

  return (
    <div className="space-y-4">
      {flash ? (
        <div
          role="status"
          className={`rounded-2xl border px-4 py-3 text-[13px] ${
            flash.ok
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      {/* ── Card 1: the switch — nothing else is edited here anymore ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Site availability</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                enabled
                  ? "bg-[#d96a5b]/15 text-[#eb9d90]"
                  : "bg-[#8CA3D6]/15 text-[#aec6f0]"
              }`}
            >
              {enabled ? <TriangleAlert className="h-5 w-5" /> : <MoonStar className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">
                Maintenance mode
              </h2>
              <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-white/45">
                Locks the whole site behind a maintenance screen. Signed-in admins —
                this studio AND the LMS studio — still see the real site, so you can
                keep editing and previewing while it&apos;s down. Takes effect within a
                few seconds.
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-white/35">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Admin preview: your studio session bypasses the screen automatically.
                {state.updatedAt
                  ? ` · Last change ${new Date(state.updatedAt).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <span
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${
                enabled
                  ? "bg-red-500/10 text-red-300"
                  : "bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {enabled ? "Site down" : "Site open"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Toggle maintenance mode"
              disabled={busy}
              onClick={() => toggle(!enabled)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60 ${
                enabled ? "bg-[#d96a5b]" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-300 ${
                  enabled ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* ── Card 2: ONE editor for everything visitors read (v2.8.40.1) ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Maintenance screen</p>
        <div className="mt-3 flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ffd444]/15 text-[#ffd444]">
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold tracking-[-0.02em]">
              Maintenance page content
            </h2>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-white/45">
              Everything visitors read on the Apple-style &quot;We&apos;ll be back&quot;
              screen — the headline, the sub-line, the crest and the social links —
              edited here in one place. Published instantly; empty social URLs hide
              their icons.
            </p>
          </div>
        </div>

        {contentError ? (
          <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200">
            {contentError}
          </p>
        ) : null}

        {!content ? (
          <div className="mt-5 flex h-24 items-center justify-center gap-2 rounded-xl border border-white/10 text-sm text-white/45">
            <Loader2 className="animate-spin" size={15} /> Loading content…
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  Headline
                </span>
                <input
                  value={content.siteMaintenanceTitle}
                  onChange={(e) => setContent((c) => (c ? { ...c, siteMaintenanceTitle: e.target.value } : c))}
                  maxLength={120}
                  className="w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
                  placeholder="We'll be back soon."
                />
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  Sub-line (the message shown to visitors)
                </span>
                <textarea
                  rows={3}
                  value={content.siteMaintenanceSubtitle}
                  onChange={(e) => setContent((c) => (c ? { ...c, siteMaintenanceSubtitle: e.target.value } : c))}
                  maxLength={300}
                  className="w-full resize-y rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
                  placeholder="We're busy upgrading the college systems…"
                />
                <span className="mt-1.5 block text-[11px] text-white/30">
                  This is the text visitors read under the headline — it always
                  applies the moment you save.
                </span>
              </label>

              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                  Crest / logo (empty = the college crest)
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2">
                  {content.siteMaintenanceLogo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={content.siteMaintenanceLogo}
                      alt=""
                      className="h-10 w-10 rounded-full border border-white/15 bg-white object-contain p-0.5"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-dashed border-[#ffd444]/40 text-[#ffd444]">
                      ✦
                    </span>
                  )}
                  <input
                    value={content.siteMaintenanceLogo}
                    onChange={(e) => setContent((c) => (c ? { ...c, siteMaintenanceLogo: e.target.value } : c))}
                    placeholder="/images/crest.png or https://…"
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/25"
                  />
                  <MediaLibraryButton
                    preferFolder="logos"
                    onSelect={(picked) => setContent((c) => (c ? { ...c, siteMaintenanceLogo: picked.url } : c))}
                  />
                  {content.siteMaintenanceLogo ? (
                    <button
                      type="button"
                      onClick={() => setContent((c) => (c ? { ...c, siteMaintenanceLogo: "" } : c))}
                      className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-white/50 transition-colors hover:text-white"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </label>

              <label className="flex items-center gap-3 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={content.siteMaintenanceShowSocial !== "false"}
                  onChange={(e) =>
                    setContent((c) =>
                      c ? { ...c, siteMaintenanceShowSocial: e.target.checked ? "true" : "false" } : c,
                    )
                  }
                  className="h-4 w-4 accent-[#ffd444]"
                />
                <span className="text-[12.5px] text-white/70">
                  Show the social icons row (each icon needs its URL below)
                </span>
              </label>

              {SOCIAL_FIELDS.map((field) => (
                <label key={field.key}>
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    {field.label}
                  </span>
                  <input
                    value={content[field.key]}
                    onChange={(e) => setContent((c) => (c ? { ...c, [field.key]: e.target.value } : c))}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[12.5px] text-white outline-none transition placeholder:text-white/25 focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
              <p className="text-xs text-white/35">
                Published live to the /maintenance screen — same pipeline as the preloader content.
              </p>
              <button
                type="button"
                disabled={contentBusy}
                onClick={saveContent}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#ffd444] px-4 text-[13px] font-semibold text-[#141400] transition-colors hover:bg-[#e8c13a] disabled:opacity-60"
              >
                {contentBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Save &amp; publish
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
