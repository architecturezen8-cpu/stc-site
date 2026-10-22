"use client";

import { useState } from "react";
import { Check, Clock, Loader2, Mail, MapPin, Phone, Save, Send } from "lucide-react";

const footerFields = [
  ["footerDescription", "Footer description", "Short college description", true],
  ["address", "Address", "College address", true],
  ["phone", "Main phone", "+94 …", false],
  ["email", "Public email", "office@example.com", false],
  ["officeHours", "Office hours", "Mon – Fri …", false],
] as const;

export function FooterManager({
  initial,
  crestSrc,
}: {
  initial: Record<string, string>;
  /** v2.8.60.0 — the registry crest (preview only; edited in Logos & Crests). */
  crestSrc: string;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (publish: boolean) => {
    setBusy(publish ? "publish" : "save");
    setMessage(null);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, publish }),
    });
    const json = await res.json();
    setMessage(res.ok ? (publish ? "Footer published to the site." : "Footer draft saved.") : json.error);
    setBusy(null);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.75fr]">
      <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <p className="text-[9px] uppercase tracking-[0.25em] text-white/30">Dedicated section</p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em]">Site footer</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
          Everything the public footer shows — description, address and contact
          details — edited in one place, separate from Settings.
        </p>

        <div className="mt-7 grid gap-5">
          {footerFields.map(([key, label, placeholder, long]) => (
            <label key={key} className="block">
              <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">{label}</span>
              {long ? (
                <textarea
                  rows={3}
                  value={data[key] ?? ""}
                  onChange={(e) => setData((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full resize-y rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[13px] leading-relaxed text-white outline-none focus:border-[#ffd444]"
                />
              ) : (
                <input
                  value={data[key] ?? ""}
                  onChange={(e) => setData((d) => ({ ...d, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
                />
              )}
            </label>
          ))}

          {/* v2.8.60.0 — the crest is NOT edited here any more: three
              places edited the same logo and every save replayed a stale
              value over the others (the owner's "okkoma corrupt wei").
              The preview below reads the ONE registry entry instead. */}
          <div className="rounded-xl border border-[#ffd444]/30 bg-[#ffd444]/[0.06] px-4 py-3">
            <p className="text-[12px] font-semibold text-[#ffd444]">
              Footer crest → Logos &amp; Crests
            </p>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-white/40">
              The footer draws the College Crest from the central registry —
              change it once in Admin → Logos &amp; Crests and it updates on
              the footer, navbar and every portal together.
            </p>
          </div>
        </div>

        {message && <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300"><Check size={14} />{message}</div>}
        <div className="mt-7 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
          <button onClick={() => submit(false)} disabled={busy !== null} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-[12px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:opacity-50">{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save draft</button>
          <button onClick={() => submit(true)} disabled={busy !== null} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-6 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50">{busy === "publish" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Publish footer</button>
        </div>
      </section>

      {/* Live footer preview — mirrors the public footer */}
      <aside className="min-w-0 rounded-2xl border border-white/10 bg-[#0d0d0b] p-6 sm:p-7">
        <p className="text-[9px] uppercase tracking-[0.25em] text-[#ffd444]">Live preview</p>
        <div className="mt-6 rounded-xl border border-white/12 bg-[#0a0a09] p-5">
          <div className="flex items-center gap-3">
            {crestSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={crestSrc} alt="" className="h-11 w-11 rounded-full border border-white/15 bg-white object-contain p-1" />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffd444] font-display text-lg font-semibold text-[#0b0b0a]">S</span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-[15px] font-semibold">{data.brandName}</span>
              <span className="block truncate text-[8px] uppercase tracking-[0.26em] text-white/40">{data.brandSubline}</span>
            </span>
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-white/50">{data.footerDescription}</p>
          <div className="mt-5 space-y-2.5 border-t border-white/10 pt-4 text-[11.5px] text-white/45">
            <p className="flex items-start gap-2.5"><MapPin size={13} className="mt-0.5 shrink-0 text-[#ffd444]/70" />{data.address}</p>
            <p className="flex items-center gap-2.5"><Phone size={13} className="shrink-0 text-[#ffd444]/70" />{data.phone}</p>
            <p className="flex items-center gap-2.5"><Mail size={13} className="shrink-0 text-[#ffd444]/70" />{data.email}</p>
            <p className="flex items-center gap-2.5"><Clock size={13} className="shrink-0 text-[#ffd444]/70" />{data.officeHours}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
