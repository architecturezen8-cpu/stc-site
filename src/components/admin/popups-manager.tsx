"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ExternalLink, Link2, Loader2, Megaphone, Pencil, Plus, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";
import { MediaPickerModal, type PickedMedia } from "@/components/admin/media-picker";
import { LIVE_PLATFORMS } from "@/lib/live";

type PopupLink = { label: string; url: string };

type PopupRow = {
  id: number;
  title: string;
  message: string;
  kind: string;
  bannerUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  eventAt: string | null;
  platform: string | null;
  links: PopupLink[];
  enabled: boolean;
  frequency: string;
  delayMs: number;
  startAt: string | null;
  endAt: string | null;
  updatedAt: string;
};

const KINDS = [
  { value: "message", label: "Special Message" },
  { value: "event", label: "Event" },
  { value: "live", label: "Live Stream" },
];

const FREQUENCIES = [
  { value: "session", label: "Once per session" },
  { value: "once", label: "Only once (until dismissed)" },
  { value: "always", label: "Every page load" },
];

const KIND_BADGE: Record<string, string> = {
  event: "bg-violet-400/15 text-violet-300",
  live: "bg-red-400/15 text-red-300",
  message: "bg-[#ffd444]/15 text-[#ffd444]",
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

type Draft = {
  id?: number;
  title: string;
  message: string;
  kind: string;
  bannerUrl: string;
  linkUrl: string;
  linkLabel: string;
  eventAt: string;
  platform: string;
  links: PopupLink[];
  enabled: boolean;
  frequency: string;
  delayMs: number;
  startAt: string;
  endAt: string;
};

const EMPTY: Draft = {
  title: "",
  message: "",
  kind: "message",
  bannerUrl: "",
  linkUrl: "",
  linkLabel: "Learn more",
  eventAt: "",
  platform: "youtube",
  links: [],
  enabled: true,
  frequency: "session",
  delayMs: 1500,
  startAt: "",
  endAt: "",
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PopupsManager() {
  const [rows, setRows] = useState<PopupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<Draft | null>(null);
  const pickerClosedAt = useRef(0);

  // NOTE: no synchronous setState here — initial state is already `loading`.
  const load = useCallback(() => {
    return fetch("/api/admin/popups", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data.popups) ? data.popups : []))
      .catch(() => setToast("Could not load popups."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.message.trim()) {
      setToast("Title and message are required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...draft,
        delayMs: Number(draft.delayMs) || 1500,
        startAt: draft.startAt ? new Date(draft.startAt).toISOString() : null,
        endAt: draft.endAt ? new Date(draft.endAt).toISOString() : null,
        eventAt: draft.eventAt ? new Date(draft.eventAt).toISOString() : null,
        platform: draft.kind === "live" ? draft.platform || null : null,
        links: draft.links.filter((l) => l.url.trim()),
      };
      const res = await fetch("/api/admin/popups", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setDraft(null);
        setToast(draft.id ? "Popup updated." : "Popup created.");
        load();
      } else {
        setToast(data.error || "Save failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: PopupRow) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/popups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, enabled: !row.enabled } : r)),
        );
        setToast(row.enabled ? "Popup turned OFF." : "Popup turned ON.");
      } else setToast("Could not change the popup.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: PopupRow) => {
    if (!window.confirm(`Delete the popup "${row.title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/popups?id=${row.id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setToast("Popup deleted.");
      } else setToast("Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (v: string | null) =>
    v
      ? new Date(v).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <div className="space-y-4">
      {/* Stacked on mobile — paragraph and button get their own rows (same
          treatment as the Live Streams header) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="min-w-0 text-xs leading-relaxed text-white/40">
          One popup shows at a time — the newest enabled popup inside its schedule window.
        </p>
        <button
          onClick={() => setDraft({ ...EMPTY })}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-xs font-semibold text-black transition-opacity hover:opacity-85 sm:h-9"
        >
          <Plus size={14} /> New popup
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-white/50">
          <Loader2 size={18} className="animate-spin" /> Loading popups…
        </div>
      ) : !rows.length ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-white/40">
          No popups yet — create one to greet visitors with an event, live stream or message.
        </div>
      ) : (
        <div className="hscroll max-h-[64vh] space-y-2.5 overflow-y-auto pr-2.5">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-2xl border p-4 transition-colors ${
                row.enabled
                  ? "border-white/10 bg-white/[0.03] hover:border-white/20"
                  : "border-dashed border-white/10 bg-transparent opacity-70"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="truncate text-sm font-semibold text-white">{row.title}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        KIND_BADGE[row.kind] || "bg-white/10 text-white/70"
                      }`}
                    >
                      {row.kind}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        row.enabled ? "bg-emerald-400/15 text-emerald-300" : "bg-white/8 text-white/40"
                      }`}
                    >
                      {row.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">
                    {row.message}
                  </p>
                  <p className="mt-1 text-[11px] text-white/30">
                    {FREQUENCIES.find((f) => f.value === row.frequency)?.label ?? row.frequency}
                    {fmtDate(row.startAt) ? ` · from ${fmtDate(row.startAt)}` : ""}
                    {fmtDate(row.endAt) ? ` · until ${fmtDate(row.endAt)}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => toggle(row)}
                    disabled={busy}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/70 transition-colors hover:border-white/35 hover:text-white"
                    aria-label={row.enabled ? "Turn popup off" : "Turn popup on"}
                    title={row.enabled ? "Turn OFF" : "Turn ON"}
                  >
                    {row.enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                  </button>
                  <button
                    onClick={() => {
                      // jsonb links can arrive as a string from older rows —
                      // normalise so the links editor always gets a real array.
                      const rawLinks: unknown = row.links;
                      const safeLinks: PopupLink[] = Array.isArray(rawLinks)
                        ? (rawLinks as PopupLink[]).map((l) => ({
                            label: String(l?.label ?? ""),
                            url: String(l?.url ?? ""),
                          }))
                        : [];
                      setDraft({
                        id: row.id,
                        title: row.title,
                        message: row.message,
                        kind: row.kind,
                        bannerUrl: row.bannerUrl ?? "",
                        linkUrl: row.linkUrl ?? "",
                        linkLabel: row.linkLabel ?? "",
                        eventAt: toLocalInput(row.eventAt),
                        platform: row.platform ?? "youtube",
                        links: safeLinks,
                        enabled: row.enabled,
                        frequency: row.frequency,
                        delayMs: row.delayMs,
                        startAt: toLocalInput(row.startAt),
                        endAt: toLocalInput(row.endAt),
                      });
                    }}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/70 transition-colors hover:border-white/35 hover:text-white"
                    aria-label="Edit popup"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(row)}
                    disabled={busy}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300"
                    aria-label="Delete popup"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      {draft && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center sm:p-6">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/12 bg-[#101010] p-6 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-white">
                  <Megaphone size={18} className="text-[#ffd444]" />
                  {draft.id ? "Edit popup" : "New popup"}
                </h3>
                <p className="mt-0.5 text-xs text-white/40">Full control — content, banner, link, schedule and display.</p>
              </div>
              <button
                onClick={() => setDraft(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/60 hover:text-white"
                aria-label="Close editor"
              >
                ✕
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Title *</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Big Match 2026 — Live Now"
                  className={input}
                />
              </label>

              <label className="sm:col-span-2 block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Message *</span>
                <textarea
                  value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                  placeholder="The announcement text shown inside the popup…"
                  rows={4}
                  className={`${input} resize-y`}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Type</span>
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                  className={input}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Show frequency</span>
                <select
                  value={draft.frequency}
                  onChange={(e) => setDraft({ ...draft, frequency: e.target.value })}
                  className={input}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </label>

              {draft.kind === "live" && (
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Streaming platform (shown with its icon)</span>
                  <select
                    value={draft.platform}
                    onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                    className={input}
                  >
                    {LIVE_PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {draft.kind !== "message" && (
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                    <CalendarDays size={12} className="text-[#ffd444]" /> Event date &amp; time (shown on the popup)
                  </span>
                  <input
                    type="datetime-local"
                    value={draft.eventAt}
                    onChange={(e) => setDraft({ ...draft, eventAt: e.target.value })}
                    className={input}
                  />
                </label>
              )}

              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Banner image</span>
                <div className="flex items-center gap-2.5">
                  {draft.bannerUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={draft.bannerUrl} alt="Banner preview" className="h-14 w-24 rounded-lg border border-white/12 object-cover" />
                  ) : null}
                  <button
                    onClick={() => setPickerFor(draft)}
                    className="rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-white/35 hover:text-white"
                  >
                    {draft.bannerUrl ? "Change banner" : "Choose from media library"}
                  </button>
                  {draft.bannerUrl && (
                    <button
                      onClick={() => setDraft({ ...draft, bannerUrl: "" })}
                      className="text-xs text-white/40 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Button link URL</span>
                <input
                  value={draft.linkUrl}
                  onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
                  placeholder="/news or https://youtube.com/…"
                  className={input}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Button label</span>
                <input
                  value={draft.linkLabel}
                  onChange={(e) => setDraft({ ...draft, linkLabel: e.target.value })}
                  placeholder="Learn more"
                  className={input}
                />
              </label>

              {/* Social / watch links — shown as platform icon buttons */}
              <div className="sm:col-span-2">
                <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                  <Link2 size={12} className="text-[#ffd444]" /> Social / watch links (icons on the popup)
                </span>
                <div className="space-y-2.5">
                  {draft.links.map((link, index) => (
                    /* Stacked card: label row + full-width URL row, so the
                       URL input (and its placeholder) never gets squeezed. */
                    <div key={index} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 pl-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <input
                          value={link.label}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              links: draft.links.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)),
                            })
                          }
                          placeholder="Name (e.g. YouTube)"
                          className="h-9 min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.05] px-3 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                        />
                        <button
                          onClick={() =>
                            setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })
                          }
                          aria-label="Remove link"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <input
                        value={link.url}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            links: draft.links.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)),
                          })
                        }
                        placeholder="https://youtube.com/@stcmatale"
                        className="mt-2 h-10 w-full rounded-lg border border-white/12 bg-white/[0.05] px-3 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-3.5 py-2 text-[11px] font-medium text-white/55 transition-colors hover:border-[#ffd444] hover:text-[#ffd444]"
                  >
                    <Plus size={12} /> Add link
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Show from (optional)</span>
                <input
                  type="datetime-local"
                  value={draft.startAt}
                  onChange={(e) => setDraft({ ...draft, startAt: e.target.value })}
                  className={input}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Show until (optional)</span>
                <input
                  type="datetime-local"
                  value={draft.endAt}
                  onChange={(e) => setDraft({ ...draft, endAt: e.target.value })}
                  className={input}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Delay before showing (ms)</span>
                <input
                  type="number"
                  min={0}
                  max={30000}
                  step={250}
                  value={draft.delayMs}
                  onChange={(e) => setDraft({ ...draft, delayMs: Number(e.target.value) })}
                  className={input}
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5 sm:col-span-2">
                <span className="text-sm text-white/80">Enabled — popup is live on the site</span>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${draft.enabled ? "bg-emerald-400/80" : "bg-white/15"}`}
                  aria-pressed={draft.enabled}
                  aria-label="Toggle popup enabled"
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${draft.enabled ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2.5 border-t border-white/10 pt-5">
              <button
                onClick={() => setDraft(null)}
                className="rounded-full border border-white/12 px-5 py-2.5 text-xs font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-2.5 text-xs font-semibold text-black transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                {draft.id ? "Save changes" : "Create popup"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerFor && (
        <MediaPickerModal
          open
          preferFolder="site-assets"
          onSelect={(picked: PickedMedia) => {
            pickerClosedAt.current = Date.now();
            setDraft((d) => (d ? { ...d, bannerUrl: picked.url } : d));
            setPickerFor(null);
          }}
          onClose={() => {
            pickerClosedAt.current = Date.now();
            setPickerFor(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#181818] px-5 py-2.5 text-xs text-white shadow-lift">
          <ExternalLink size={12} className="text-[#ffd444]" /> {toast}
        </div>
      )}
    </div>
  );
}
