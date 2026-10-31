"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ImagePlus, Loader2, Send } from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";

const brandFields = [
  ["brandName", "Brand name", "St. Thomas' College"],
  ["brandSubline", "Brand subline", "Matale · Est. 1873"],
  ["admissionsYear", "Admissions year", "2027"],
] as const;

export function SettingsForm({ initial }: { initial: Record<string, string> }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /* v2.8.60.0 — ONE save button that PUBLISHES. The old draft/publish pair
     was the exact trap the owner kept hitting: save draft, reload the
     site, and every live surface still showed the previous (default)
     values. Identity settings are meant to be live the moment they save. */
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, publish: true }),
    });
    const json = await res.json();
    setMessage(res.ok ? "Saved — live on the site now." : json.error);
    setBusy(false);
  };

  const falconSrc = (data.falconImage ?? "").trim();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.65fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        {/* ── Browser tab icon (favicon) — v2.8.60.0 ──────────────────
            The owner: "falcon emblem eken watenna one browser eke uda
            falcon eka." This section now controls ONLY the little icon at
            the top of the browser tab. College-level logos for the site,
            the portals and the admin studio moved to Logos & Crests. */}
        <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Browser identity</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">
          Browser tab icon
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
          The small icon at the very top of the browser (the falcon). Upload
          your own artwork and it appears on every browser tab after the
          next page load. Leave empty to keep the built-in falcon.
        </p>

        <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
          {/* Realtime preview — a mini browser tab, exactly where it renders */}
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 rounded-t-lg bg-white/10 px-3 py-2">
              <span className="relative grid h-4 w-4 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                {falconSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={falconSrc} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="font-display text-[7px] font-bold text-[#0b0b0a]">F</span>
                )}
              </span>
              <span className="max-w-[110px] truncate text-[9px] text-white/60">
                St. Thomas&apos; College…
              </span>
              <span className="text-[9px] text-white/30">×</span>
            </div>
            <p className="text-[8px] uppercase tracking-[0.22em] text-white/35">Browser tab</p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2">
              <input
                value={data.falconImage ?? ""}
                onChange={(e) => setData((d) => ({ ...d, falconImage: e.target.value }))}
                placeholder="Tab icon URL — or choose from the Library"
                className="min-w-0 flex-1 bg-transparent text-[11.5px] text-white outline-none placeholder:text-white/30"
              />
              <MediaLibraryButton
                preferFolder="site-assets"
                onSelect={(picked) => setData((d) => ({ ...d, falconImage: picked.url }))}
              />
              {falconSrc && (
                <button
                  onClick={() => setData((d) => ({ ...d, falconImage: "" }))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-white/50 hover:text-white"
                >
                  <ImagePlus size={11} /> Use built-in falcon
                </button>
              )}
            </div>
            <p className="text-[10.5px] leading-relaxed text-white/30">
              A square image looks best — the browser crops it into a tiny
              circle/rounded square automatically.
            </p>
          </div>
        </div>

        {/* ── Brand basics ──────────────────────────────────────────── */}
        <div className="mt-9 border-t border-white/10 pt-7">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Brand basics</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {brandFields.map(([key, label, placeholder]) => (
              <label key={key}>
                <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">{label}</span>
                <input
                  value={data[key] ?? ""}
                  onChange={(e) => setData((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
                />
              </label>
            ))}
            {/* v2.8.60.0 — the old "College crest (synced by ID)" field is
                GONE on purpose: three places edited the same logo and every
                save replayed a stale value over the others. ALL college +
                portal logos now live in ONE place: Logos & Crests. */}
            <Link
              href="/admin/logos"
              className="group flex items-center justify-between gap-3 rounded-xl border border-[#ffd444]/30 bg-[#ffd444]/[0.06] px-4 py-3 transition-colors hover:border-[#ffd444]/60 sm:col-span-2"
            >
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-[#ffd444]">
                  College crest &amp; portal logos → Logos &amp; Crests
                </span>
                <span className="mt-0.5 block text-[10.5px] leading-relaxed text-white/40">
                  One place sets the crest for the public site, the Student,
                  Teacher and Parent portals, the login pages and the Admin
                  Studio — saves there go live immediately.
                </span>
              </span>
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 group-hover:text-[#ffd444]">
                Open →
              </span>
            </Link>
          </div>
        </div>

        {message && <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300"><Check size={14} />{message}</div>}
        <div className="mt-7 flex justify-end border-t border-white/10 pt-5">
          <button onClick={submit} disabled={busy} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-6 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Save &amp; publish
          </button>
        </div>
      </section>

      {/* Live brand preview */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[#0d0d0b] p-6 sm:p-7">
          <p className="text-[9px] uppercase tracking-[0.25em] text-[#ffd444]">Live preview</p>
          <div className="mt-6 flex flex-col items-center rounded-xl border border-white/12 p-6">
            <span
              className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-white text-[#0b0b0a] shadow-[0_2px_14px_rgba(0,0,0,0.30)] ring-1 ring-black/10"
            >
              {falconSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={falconSrc}
                  alt=""
                  className="absolute inset-0 h-full w-full rounded-full object-contain"
                />
              ) : (
                <span className="font-display text-xl font-bold text-[#0b0b0a]">F</span>
              )}
            </span>
            <p className="mt-4 text-center font-display text-lg font-semibold leading-tight">{data.brandName}</p>
            <p className="mt-1 text-center text-[8px] uppercase tracking-[0.28em] text-white/40">{data.brandSubline}</p>
          </div>
          <p className="mt-4 text-center text-[10.5px] leading-relaxed text-white/35">
            The crest, portal logos and the Admin Studio emblem are managed in{" "}
            <span className="font-semibold text-white/55">Admin → Logos &amp; Crests</span>.
          </p>
        </div>
        <p className="px-2 text-[11px] leading-relaxed text-white/30">
          Footer text, address and contact details now live in their own
          section: Admin → Footer.
        </p>
      </aside>
    </div>
  );
}
