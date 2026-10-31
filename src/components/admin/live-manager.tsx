"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Radio,
  Trash2,
  X,
} from "lucide-react";
import { MediaPickerModal, type PickedMedia } from "@/components/admin/media-picker";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";
import { LIVE_PLATFORMS } from "@/lib/live";

type StreamLink = { label: string; url: string };

type StreamRow = {
  id: number;
  title: string;
  description: string | null;
  platform: string;
  url: string;
  embedUrl: string | null;
  bannerUrl: string | null;
  links: StreamLink[];
  liveMode: boolean;
  scheduledAt: string | null;
  sortOrder: number;
  updatedAt: string;
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

type Draft = {
  id?: number;
  title: string;
  description: string;
  platform: string;
  url: string;
  embedUrl: string;
  bannerUrl: string;
  links: StreamLink[];
  liveMode: boolean;
  scheduledAt: string;
  sortOrder: number;
};

const EMPTY: Draft = {
  title: "",
  description: "",
  platform: "youtube",
  url: "",
  embedUrl: "",
  bannerUrl: "",
  links: [],
  liveMode: false,
  scheduledAt: "",
  sortOrder: 100,
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LiveManager() {
  const [rows, setRows] = useState<StreamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // NOTE: no synchronous setState here — initial state is already `loading`.
  const load = useCallback(() => {
    return fetch("/api/admin/live", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data.streams) ? data.streams : []))
      .catch(() => setToast("Could not load streams."))
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
    if (!draft.title.trim() || !draft.url.trim()) {
      setToast("Stream title and URL are required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...draft,
        sortOrder: Number(draft.sortOrder) || 100,
        scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
      };
      const res = await fetch("/api/admin/live", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setDraft(null);
        setToast(draft.id ? "Stream updated." : "Stream added.");
        load();
      } else {
        setToast(data.error || "Save failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const setLiveMode = async (row: StreamRow, liveMode: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/live", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, liveMode }),
      });
      if (res.ok) {
        setRows((prev) => {
          // Only one stream on air at a time — switching live mode flips others off.
          return prev.map((r) =>
            liveMode
              ? { ...r, liveMode: r.id === row.id }
              : r.id === row.id
                ? { ...r, liveMode: false }
                : r,
          );
        });
        setToast(liveMode ? "🔴 LIVE MODE ON — navbar dot is blinking." : "Live mode turned off.");
      } else setToast("Could not change live mode.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: StreamRow) => {
    if (!window.confirm(`Delete the stream "${row.title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/live?id=${row.id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setToast("Stream deleted.");
      } else setToast("Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const setLinkField = (index: number, key: keyof StreamLink, value: string) => {
    if (!draft) return;
    const links = draft.links.map((l, i) => (i === index ? { ...l, [key]: value } : l));
    setDraft({ ...draft, links });
  };

  return (
    <div className="space-y-4">
      {/* Stacked on mobile — paragraph and button get their own rows */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="min-w-0 text-xs leading-relaxed text-white/40">
          YouTube / Facebook / Instagram / TikTok streams — the one in{" "}
          <span className="font-semibold text-red-300">LIVE MODE</span> features on /live and blinks
          in the navbar.
        </p>
        <button
          onClick={() => setDraft({ ...EMPTY, links: [] })}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-xs font-semibold text-black transition-opacity hover:opacity-85 sm:h-9"
        >
          <Plus size={14} /> Add stream
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-white/50">
          <Loader2 size={18} className="animate-spin" /> Loading streams…
        </div>
      ) : !rows.length ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-white/40">
          No streams yet — add your first YouTube, Facebook, Instagram or TikTok live stream.
        </div>
      ) : (
        <div className="hscroll max-h-[64vh] space-y-2.5 overflow-y-auto pr-2.5">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`rounded-2xl border p-4 transition-colors ${
                row.liveMode
                  ? "border-red-400/35 bg-red-400/[0.04]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              {/* v2.8.67.2 — stacked on mobile: the info block gets the full
                  width (no more "Te…" truncation next to GO LIVE) and the
                  action buttons drop to their own row. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="flex min-w-0 items-start gap-3.5 sm:flex-1">
                  {row.bannerUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={adminGridThumbSrc(row.bannerUrl)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-24 shrink-0 rounded-lg border border-white/10 object-cover"
                    />
                  ) : (
                    <span className="grid h-14 w-24 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-white/25">
                      <Radio size={18} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="truncate text-sm font-semibold text-white">{row.title}</span>
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/65">
                        {row.platform}
                      </span>
                      {row.liveMode && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                          </span>
                          ON AIR
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-white/45">
                      {row.description || row.url}
                    </p>
                    {row.scheduledAt && (
                      <p className="mt-0.5 text-[11px] text-white/30">
                        Scheduled: {new Date(row.scheduledAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:shrink-0 sm:justify-end">
                  <button
                    onClick={() => setLiveMode(row, !row.liveMode)}
                    disabled={busy}
                    className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                      row.liveMode
                        ? "bg-red-500 text-white hover:bg-red-400"
                        : "border border-white/12 text-white/60 hover:border-red-400/50 hover:text-red-300"
                    }`}
                  >
                    {row.liveMode ? "End live" : "Go live"}
                  </button>
                  <button
                    onClick={() =>
                      setDraft({
                        id: row.id,
                        title: row.title,
                        description: row.description ?? "",
                        platform: row.platform,
                        url: row.url,
                        embedUrl: row.embedUrl ?? "",
                        bannerUrl: row.bannerUrl ?? "",
                        links: row.links ?? [],
                        liveMode: row.liveMode,
                        scheduledAt: toLocalInput(row.scheduledAt),
                        sortOrder: row.sortOrder,
                      })
                    }
                    className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/70 transition-colors hover:border-white/35 hover:text-white"
                    aria-label="Edit stream"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(row)}
                    disabled={busy}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300"
                    aria-label="Delete stream"
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
                  <Radio size={18} className="text-[#ffd444]" />
                  {draft.id ? "Edit stream" : "Add live stream"}
                </h3>
                <p className="mt-0.5 text-xs text-white/40">
                  Title, description, banner, social links and the stream URL.
                </p>
              </div>
              <button
                onClick={() => setDraft(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/60 hover:text-white"
                aria-label="Close editor"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Title *</span>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Big Match Live — 1st Innings"
                  className={input}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Platform</span>
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

              <label className="sm:col-span-2 block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Stream URL *</span>
                <input
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=… or https://facebook.com/…"
                  className={input}
                />
              </label>

              <label className="sm:col-span-2 block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Description</span>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="What is being streamed…"
                  rows={3}
                  className={`${input} resize-y`}
                />
              </label>

              <div className="sm:col-span-2">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Banner image</span>
                <div className="flex items-center gap-2.5">
                  {draft.bannerUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={draft.bannerUrl} alt="Banner preview" className="h-14 w-24 rounded-lg border border-white/12 object-cover" />
                  ) : null}
                  <button
                    onClick={() => setPickerOpen(true)}
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
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Scheduled at (optional)</span>
                <input
                  type="datetime-local"
                  value={draft.scheduledAt}
                  onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })}
                  className={input}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">Sort order</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                  className={input}
                />
              </label>

              {/* Social / related links */}
              <div className="sm:col-span-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                    Extra links (social media, pages)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })
                    }
                    className="text-[11px] font-medium text-[#ffd444] hover:underline"
                  >
                    + Add link
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.links.map((link, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={link.label}
                        onChange={(e) => setLinkField(i, "label", e.target.value)}
                        placeholder="Label — e.g. Facebook Page"
                        className={`${input} max-w-[40%]`}
                      />
                      <input
                        value={link.url}
                        onChange={(e) => setLinkField(i, "url", e.target.value)}
                        placeholder="https://…"
                        className={input}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, links: draft.links.filter((_, j) => j !== i) })
                        }
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/12 text-white/40 hover:border-red-400/50 hover:text-red-300"
                        aria-label="Remove link"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  {!draft.links.length && (
                    <p className="rounded-xl border border-dashed border-white/10 px-3.5 py-3 text-[11px] text-white/30">
                      No extra links — add the school&apos;s social pages so viewers can follow along.
                    </p>
                  )}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5 sm:col-span-2">
                <span className="text-sm text-white/80">
                  <span className="font-semibold text-red-300">LIVE MODE</span> — stream features on
                  /live and the navbar dot blinks
                </span>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, liveMode: !draft.liveMode })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${draft.liveMode ? "bg-red-500" : "bg-white/15"}`}
                  aria-pressed={draft.liveMode}
                  aria-label="Toggle live mode"
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${draft.liveMode ? "left-[22px]" : "left-0.5"}`}
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
                {draft.id ? "Save changes" : "Add stream"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <MediaPickerModal
          open
          preferFolder="site-assets"
          onSelect={(picked: PickedMedia) => {
            setDraft((d) => (d ? { ...d, bannerUrl: picked.url } : d));
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
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
