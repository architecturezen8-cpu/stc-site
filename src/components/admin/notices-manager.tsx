"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  Image as ImageIcon,
  Loader2,
  PencilLine,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { colomboInputToIso, isoToColomboInput } from "@/lib/post-visibility";

/* ── v2.8.85.0 — Notice Board manager (Admin Studio) ────────────────────
   Drafts, pinning and optional auto-hide expiry (a notice for one event
   day disappears from the public board when its time passes). */

type NoticeRow = {
  id: number;
  title: string;
  body: string;
  category: string;
  image: string | null;
  pinned: boolean;
  published: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NoticeDraft = {
  id: number | null;
  title: string;
  body: string;
  category: string;
  image: string;
  pinned: boolean;
  published: boolean;
  /** datetime-local value in Sri Lanka wall time ("" = no expiry). */
  expiresAtInput: string;
};

const BLANK_DRAFT: NoticeDraft = {
  id: null,
  title: "",
  body: "",
  category: "General",
  image: "",
  pinned: false,
  published: true,
  expiresAtInput: "",
};

const SUGGESTED_CATEGORIES = [
  "General",
  "Admissions",
  "Examinations",
  "Events",
  "Sports",
  "Office",
  "Academics",
];

const FILTERS = ["All", "Published", "Drafts", "Pinned"] as const;
type Filter = (typeof FILTERS)[number];

/** "Expires soon" window — 7 days. */
const SOON_MS = 7 * 24 * 60 * 60 * 1000;

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

function rowToDraft(notice: NoticeRow): NoticeDraft {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    category: notice.category,
    image: notice.image ?? "",
    pinned: notice.pinned,
    published: notice.published,
    expiresAtInput: isoToColomboInput(notice.expiresAt),
  };
}

export function NoticesManager() {
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const [draft, setDraft] = useState<NoticeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  /* Purity rule — "now" is fixed in a lazy initializer, never in the render
     body, so the expiry chips are stable for the lifetime of the page. */
  const [nowMs] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/notices", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (alive) setNotices(data.notices ?? []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const categories = useMemo(
    () =>
      Array.from(
        new Set([...SUGGESTED_CATEGORIES, ...notices.map((n) => n.category)]),
      ).sort(),
    [notices],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "Published":
        return notices.filter((n) => n.published);
      case "Drafts":
        return notices.filter((n) => !n.published);
      case "Pinned":
        return notices.filter((n) => n.pinned);
      default:
        return notices;
    }
  }, [notices, filter]);

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setToast("A notice title is required.");
      return;
    }
    if (!draft.body.trim()) {
      setToast("The notice body is required.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: draft.title,
        body: draft.body,
        category: draft.category,
        image: draft.image.trim() || null,
        pinned: draft.pinned,
        published: draft.published,
        expiresAt: draft.expiresAtInput ? draft.expiresAtInput : null,
      };
      const res = await fetch(
        draft.id ? `/api/admin/notices/${draft.id}` : "/api/admin/notices",
        {
          method: draft.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setToast(json.error ?? "Unable to save the notice.");
        return;
      }
      const saved = json.notice as NoticeRow;
      setNotices((prev) =>
        draft.id
          ? prev.map((n) => (n.id === saved.id ? saved : n))
          : [saved, ...prev],
      );
      setToast(
        saved.published
          ? "Notice published to the board"
          : "Draft saved — publish when ready",
      );
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this notice permanently?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/notices/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast(json.error ?? "Unable to delete the notice.");
        return;
      }
      setNotices((prev) => prev.filter((n) => n.id !== id));
      if (draft?.id === id) setDraft(null);
      setToast("Notice deleted");
    } finally {
      setBusy(false);
    }
  };

  const expiryState = (notice: NoticeRow): "none" | "expired" | "soon" | "later" => {
    if (!notice.expiresAt) return "none";
    const time = new Date(notice.expiresAt).getTime();
    if (Number.isNaN(time)) return "none";
    if (time <= nowMs) return "expired";
    if (time - nowMs <= SOON_MS) return "soon";
    /* v2.8.93.0 — a far-future expiry is still shown (Task 97, C8: the
       owner could not see WHEN a notice expires — labels past the 7-day
       SOON window were suppressed entirely). */
    return "later";
  };

  const expiryLabel = (notice: NoticeRow) => {
    const state = expiryState(notice);
    if (state === "none") return null;
    const label = isoToColomboInput(notice.expiresAt).replace("T", " · ");
    return state === "expired" ? `Expired ${label}` : `Expires ${label}`;
  };

  const expiryClass = (notice: NoticeRow) => {
    const state = expiryState(notice);
    if (state === "expired") return "text-red-400";
    if (state === "soon") return "text-[#fbbf24]";
    return "text-white/50";
  };

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter notices">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full border px-4 py-2 text-[10px] font-medium uppercase tracking-[0.16em] transition-colors ${
                filter === f
                  ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                  : "border-white/12 text-white/50 hover:border-white/30 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...BLANK_DRAFT })}
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-60"
        >
          <Plus size={15} /> New notice
        </button>
      </div>

      {/* Notice list — scrolls once the board grows */}
      <div className="max-h-[560px] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02]">
        <ul className="divide-y divide-white/8">
          {visible.map((notice) => {
            const expiry = expiryLabel(notice);
            return (
              <li
                key={notice.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-white/[0.03] sm:px-5"
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                    notice.pinned
                      ? "bg-[#ffd444] text-[#0b0b0a]"
                      : "border border-white/15 text-white/40"
                  }`}
                  aria-hidden="true"
                >
                  <Pin size={13} className={notice.pinned ? "fill-current" : ""} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-white">
                    {notice.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] uppercase tracking-[0.16em] text-white/35">
                    <span>{notice.category}</span>
                    <span>
                      {new Date(
                        notice.publishedAt ?? notice.createdAt,
                      ).toLocaleDateString()}
                    </span>
                    {expiry && (
                      <span
                        className={`inline-flex items-center gap-1 ${expiryClass(notice)}`}
                      >
                        <CalendarClock size={10} /> {expiry}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`rounded-full px-3 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.16em] ${
                      notice.published
                        ? "bg-[#ffd444]/15 text-[#ffd444]"
                        : "bg-white/10 text-white/45"
                    }`}
                  >
                    {notice.published ? "Published" : "Draft"}
                  </span>
                  {notice.pinned && (
                    <span className="rounded-full border border-[#ffd444]/50 px-3 py-1.5 text-[8.5px] font-bold uppercase tracking-[0.16em] text-[#ffd444]">
                      Pinned
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-px">
                  <button
                    type="button"
                    onClick={() => setDraft(rowToDraft(notice))}
                    className="flex items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-[11px] font-semibold text-[#ffd444] hover:bg-white/5"
                    aria-label={`Edit notice: ${notice.title}`}
                  >
                    <PencilLine size={12} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(notice.id)}
                    disabled={busy}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/35 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                    aria-label={`Delete notice: ${notice.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center">
              <p className="text-sm text-white/40">
                No notices here yet — post the first one with “New notice”.
              </p>
            </li>
          )}
        </ul>
      </div>

      {/* Editor overlay */}
      {draft && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div
            className="g-panel flex max-h-[94svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? "Edit notice" : "New notice"}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="font-display text-lg font-semibold tracking-[-0.01em]">
                {draft.id ? "Edit notice" : "New notice"}
              </h3>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-black/60"
                aria-label="Close editor"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
              <div>
                <label
                  htmlFor="notice-title"
                  className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40"
                >
                  Title
                </label>
                <input
                  id="notice-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. Grades 6–11 classes suspended on Friday"
                  maxLength={200}
                  className={`${input} mt-1.5 h-11 text-[13px]`}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  {/* v2.8.93.0 — the flaky <input list> + <datalist> picker
                      is gone (Task 97, C7): one tap sets a suggested
                      category, and the box below still accepts a custom one. */}
                  <span
                    id="notice-category-label"
                    className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40"
                  >
                    Category
                  </span>
                  <div
                    role="group"
                    aria-labelledby="notice-category-label"
                    className="mt-1.5 flex flex-wrap gap-1.5"
                  >
                    {categories.map((cat) => {
                      const active = draft.category === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setDraft({ ...draft, category: cat })}
                          aria-pressed={active}
                          className={`rounded-full border px-3.5 py-2 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                            active
                              ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                              : "border-white/12 text-white/50 hover:border-white/30 hover:text-white"
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    id="notice-category"
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({ ...draft, category: e.target.value })
                    }
                    placeholder="…or type a custom category"
                    aria-label="Custom category"
                    maxLength={40}
                    className={`${input} mt-2 h-10 text-[12px]`}
                  />
                </div>
                <div>
                  <label
                    htmlFor="notice-expiry"
                    className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40"
                  >
                    Auto-hide after (optional · Sri Lanka time)
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="notice-expiry"
                      type="datetime-local"
                      value={draft.expiresAtInput}
                      onChange={(e) =>
                        setDraft({ ...draft, expiresAtInput: e.target.value })
                      }
                      className={`${input} h-11 text-[12px] [color-scheme:dark]`}
                    />
                    {draft.expiresAtInput && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, expiresAtInput: "" })
                        }
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/12 text-white/45 hover:text-white"
                        aria-label="Clear auto-hide date"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="notice-body"
                  className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40"
                >
                  Notice body
                </label>
                <textarea
                  id="notice-body"
                  rows={8}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="Write the full notice here…"
                  maxLength={8000}
                  className={`${input} mt-1.5 py-3 text-[13px] leading-relaxed`}
                />
              </div>

              <div>
                <label
                  htmlFor="notice-image"
                  className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/40"
                >
                  Image (optional)
                </label>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/12 bg-black">
                    {draft.image.trim() ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={draft.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={14} className="text-white/25" />
                    )}
                  </span>
                  <input
                    id="notice-image"
                    value={draft.image}
                    onChange={(e) =>
                      setDraft({ ...draft, image: e.target.value })
                    }
                    placeholder="/images/… or https://…"
                    className={`${input} h-10 min-w-0 flex-1 text-[11px]`}
                  />
                  <MediaLibraryButton
                    preferFolder="site-assets"
                    onSelect={(picked) =>
                      setDraft({ ...draft, image: picked.url })
                    }
                  />
                </div>
              </div>

              {/* Status toggles */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ ...draft, published: !draft.published })
                  }
                  aria-pressed={draft.published}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    draft.published
                      ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                      : "border-white/12 text-white/45 hover:text-white"
                  }`}
                >
                  {draft.published ? <Check size={11} /> : <X size={11} />}
                  {draft.published ? "Published" : "Draft"}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}
                  aria-pressed={draft.pinned}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    draft.pinned
                      ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                      : "border-white/12 text-white/45 hover:text-white"
                  }`}
                >
                  <Pin size={11} className={draft.pinned ? "fill-current" : ""} />
                  Pinned to top
                </button>
              </div>

              {colomboInputToIso(draft.expiresAtInput) && (
                <p className="text-[10.5px] leading-relaxed text-white/35">
                  This notice hides itself from the public board once the clock
                  passes the auto-hide time above.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#0d0d0b] px-5 py-4">
              {draft.id ? (
                <button
                  type="button"
                  onClick={() => remove(draft.id as number)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 size={13} /> Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-[11px] font-semibold text-white/60 hover:text-white"
                >
                  <X size={13} /> Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-3 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  Save notice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="g-fade fixed bottom-6 left-1/2 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-7">
          <Check size={14} /> {toast}
        </div>
      )}
    </>
  );
}
