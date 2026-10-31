"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Clock, Loader2, Megaphone, Pencil, Send, Trash2, X } from "lucide-react";
import {
  colomboInputToIso,
  formatScheduleLabel,
  isoToColomboInput,
} from "@/lib/post-visibility";

/* ── v2.8.70.0 — SCHOOL BROADCASTS composer (shared) ─────────────────────
   ONE component serves both panels — the website Admin Studio and the
   LMS Admin Studio (the owner: "main admin ekata + lms-admin ekatath messages
   danna puluwan wenna one"). Sending side filters: the audience switch
   picks teachers / students / parents / everyone, and the kind sets how
   the card is badged in the portals (maintenance, urgent…).

   v2.8.71.0 — EDIT (owner item 4: "aya massage ekak dammama eka edit
   karanna option ekak danna. danata delete option eka witharane thiyenne"):
   every sent card now carries an Edit pencil next to Delete. Picking one
   flips the form above into edit mode — the same fields, a gold "editing"
   banner, Save changes + Cancel — and the save goes to PATCH, keeping the
   read counts.

   v2.8.76.0 — THEME FIX (owner: the section went LIGHT inside the dark
   Admin Studio). This composer is shared: the LMS studio defines --la-*
   (dark by default) but the website Admin Studio does NOT, so every light
   fallback (#fff, gray-100, stone text…) painted a white card on the
   cinematic dark canvas. All fallbacks are now the STUDIO DARK palette —
   gold accent, translucent panels — while the --la-* variables still
   drive the LMS studio's own light/dark themes. Zero markup changes. */

type SentItem = {
  id: number;
  title: string;
  body: string;
  kind: string;
  audience: string;
  authorVia: string;
  authorName: string | null;
  linkUrl: string | null;
  createdAt: string;
  reads: number;
  /* v2.8.89.0 — scheduled auto-publish (ISO or null; future = office-only). */
  scheduledAt: string | null;
};

const KINDS: { value: string; label: string; hint: string }[] = [
  { value: "general", label: "General notice", hint: "everyday school information" },
  { value: "maintenance", label: "Maintenance", hint: "site / portal downtime alerts" },
  { value: "event", label: "Event", hint: "school events and programmes" },
  { value: "urgent", label: "Urgent", hint: "must-see alerts" },
];

const AUDIENCES: { value: string; label: string }[] = [
  { value: "all", label: "Everyone (students, teachers, parents)" },
  { value: "teachers", label: "Teachers only" },
  { value: "students", label: "Students only" },
  { value: "parents", label: "Parents only" },
];

const KIND_CHIP: Record<string, string> = {
  general: "bg-[var(--la-chip,rgba(255,255,255,0.06))] text-[var(--la-chip-text,#c6c9d5)]",
  maintenance: "bg-[var(--la-warn-bg,rgba(251,191,36,0.13))] text-[var(--la-warn-text,#fcd34d)]",
  event: "bg-[var(--la-tint-blue,rgba(101,132,214,0.16))] text-[var(--la-blue-text,#aec6f0)]",
  urgent: "bg-[var(--la-danger-bg,rgba(244,63,94,0.13))] text-[var(--la-danger-text,#fda4af)]",
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone",
  teachers: "Teachers",
  students: "Students",
  parents: "Parents",
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BroadcastComposer({ via }: { via: "site" | "lms" }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("general");
  const [audience, setAudience] = useState("all");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [sent, setSent] = useState<SentItem[] | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  /* v2.8.71.0 — the sent item currently loaded into the form, if any. */
  const [editingId, setEditingId] = useState<number | null>(null);

  /* v2.8.89.0 — scheduled auto-publish: null = publish now; an ISO instant
     = reach the portals only at that moment. Render-stable "now" for the
     Scheduled chips (purity rule: Date.now() in the lazy initializer). */
  const [scheduleIso, setScheduleIso] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());
  const isScheduledFuture = (value: string | null | undefined) =>
    Boolean(value && new Date(value).getTime() > nowMs);
  /* "Schedule" defaults to tomorrow 8.00 a.m. Sri Lanka time. */
  const defaultScheduleIso = () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const datePart = isoToColomboInput(tomorrow.toISOString()).slice(0, 10);
    return colomboInputToIso(`${datePart}T08:00`) ?? "";
  };

  /* Every setState happens POST-AWAIT (never synchronously inside the
     effect) — the site-brand pattern that satisfies
     react-hooks/set-state-in-effect. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/broadcasts");
        const data = (await res.json()) as { ok: boolean; items?: SentItem[] };
        if (!cancelled && data.ok && data.items) setSent(data.items);
      } catch {
        /* the compose form still works — history just stays stale */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshSent() {
    const listRes = await fetch("/api/admin/broadcasts");
    const listData = (await listRes.json()) as { ok: boolean; items?: SentItem[] };
    if (listData.ok && listData.items) setSent(listData.items);
  }

  function startEdit(item: SentItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setKind(item.kind);
    setAudience(item.audience);
    setLinkUrl(item.linkUrl ?? "");
    setScheduleIso(item.scheduledAt ?? null);
    setNote(null);
    document.getElementById("broadcast-form")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setKind("general");
    setAudience("all");
    setLinkUrl("");
    setScheduleIso(null);
    setNote(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    const editing = editingId;
    try {
      const res = await fetch(
        editing ? `/api/admin/broadcasts/${editing}` : "/api/admin/broadcasts",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, body, kind, audience, linkUrl, scheduledAt: scheduleIso }),
        },
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        if (editing) {
          setNote({
            tone: "ok",
            text: isScheduledFuture(scheduleIso)
              ? `Changes saved — the updated message reaches the portals ${formatScheduleLabel(scheduleIso as string)}.`
              : "Changes saved — the updated message is live now.",
          });
          setEditingId(null);
          setTitle("");
          setBody("");
          setLinkUrl("");
          setKind("general");
          setAudience("all");
          setScheduleIso(null);
        } else {
          setNote({
            tone: "ok",
            text: isScheduledFuture(scheduleIso)
              ? `Scheduled — it reaches the selected portals ${formatScheduleLabel(scheduleIso as string)}.`
              : "Posted — it is live in the selected portals now.",
          });
          setTitle("");
          setBody("");
          setLinkUrl("");
          setKind("general");
          setAudience("all");
          setScheduleIso(null);
        }
        await refreshSent();
      } else {
        setNote({ tone: "err", text: data.error || "Could not save the notification." });
      }
    } catch {
      setNote({ tone: "err", text: "Network problem — please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (deletingId != null) return;
    if (!window.confirm("Delete this notification? It disappears from every portal immediately.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/broadcasts/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        if (editingId === id) cancelEdit();
        setSent((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      } else {
        window.alert(data.error || "Could not delete it.");
      }
    } catch {
      window.alert("Network problem — please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const editingItem = editingId != null ? (sent ?? []).find((s) => s.id === editingId) : undefined;

  return (
    <div className="space-y-5">
      <form
        id="broadcast-form"
        onSubmit={onSubmit}
        className="rounded-2xl border border-[var(--la-border,rgba(255,255,255,0.1))] bg-[var(--la-panel,#171715)] p-4 sm:p-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--la-accent-soft,rgba(255,212,68,0.12))] text-[var(--la-accent,#ffd444)]">
            <Megaphone size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--la-heading,#fafafa)]">
              {editingId != null ? "Edit notification" : "Post a school notification"}
            </h2>
            <p className="text-[12px] text-[var(--la-muted,#a1a1aa)]">
              {editingId != null
                ? "Change anything and save — portals see the updated version instantly"
                : "Reaches the portal dashboards of the audience you pick below"}
            </p>
          </div>
        </div>

        {editingId != null && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-[var(--la-warn-bg,rgba(251,191,36,0.12))] px-3.5 py-2.5 text-[12.5px] text-[var(--la-warn-text,#fcd34d)]">
            <span className="min-w-0">
              <strong className="font-semibold">Editing:</strong>{" "}
              {editingItem ? editingItem.title : `notification #${editingId}`}
            </span>
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-400/40 bg-[var(--la-panel,#171715)] px-3 text-[12px] font-semibold text-[var(--la-warn-text,#fcd34d)] transition-colors hover:bg-[var(--la-warn-bg,rgba(251,191,36,0.2))]"
            >
              <X size={13} /> Cancel edit
            </button>
          </div>
        )}

        <div className="mt-4 space-y-3.5">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-[var(--la-heading,#fafafa)]">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="e.g. Portal maintenance tonight 10 PM – 11 PM"
              className="h-11 w-full rounded-xl border border-[var(--la-border,rgba(255,255,255,0.13))] bg-[var(--la-input-bg,rgba(255,255,255,0.05))] px-3.5 text-[13.5px] text-[var(--la-heading,#fafafa)] outline-none placeholder:text-[var(--la-placeholder,#6f7382)] focus:border-[var(--la-accent,#ffd444)]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-[var(--la-heading,#fafafa)]">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="Write the full message students, teachers or parents will read…"
              className="w-full rounded-xl border border-[var(--la-border,rgba(255,255,255,0.13))] bg-[var(--la-input-bg,rgba(255,255,255,0.05))] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[var(--la-heading,#fafafa)] outline-none placeholder:text-[var(--la-placeholder,#6f7382)] focus:border-[var(--la-accent,#ffd444)]"
            />
          </label>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-[var(--la-heading,#fafafa)]">Type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--la-border,rgba(255,255,255,0.13))] bg-[var(--la-input-bg,rgba(255,255,255,0.05))] px-3 text-[13.5px] text-[var(--la-heading,#fafafa)] outline-none focus:border-[var(--la-accent,#ffd444)]"
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label} — {k.hint}
                  </option>
                ))}
              </select>
            </label>

            {/* The owner's send-side filter: who receives this */}
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium text-[var(--la-heading,#fafafa)]">Send to</span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--la-border,rgba(255,255,255,0.13))] bg-[var(--la-input-bg,rgba(255,255,255,0.05))] px-3 text-[13.5px] text-[var(--la-heading,#fafafa)] outline-none focus:border-[var(--la-accent,#ffd444)]"
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-[var(--la-heading,#fafafa)]">
              Link <span className="font-normal text-[var(--la-muted,#a1a1aa)]">(optional — Drive, YouTube, any URL)</span>
            </span>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              maxLength={500}
              type="url"
              placeholder="https://…"
              className="h-11 w-full rounded-xl border border-[var(--la-border,rgba(255,255,255,0.13))] bg-[var(--la-input-bg,rgba(255,255,255,0.05))] px-3.5 text-[13.5px] text-[var(--la-heading,#fafafa)] outline-none placeholder:text-[var(--la-placeholder,#6f7382)] focus:border-[var(--la-accent,#ffd444)]"
            />
          </label>

          {/* ── v2.8.89.0 — scheduled auto-publish ─────────────────────── */}
          <div className="rounded-xl border border-[var(--la-border,rgba(255,255,255,0.1))] bg-[var(--la-chip,rgba(255,255,255,0.03))] px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--la-heading,#fafafa)]">
                <Clock size={13} className="text-[var(--la-accent,#ffd444)]" /> Go live
              </span>
              <button
                type="button"
                onClick={() => setScheduleIso(null)}
                className={`rounded-full border px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide transition-colors ${
                  !scheduleIso
                    ? "border-transparent bg-[var(--la-accent,#ffd444)] text-[var(--la-on-accent,#0b0b0a)]"
                    : "border-[var(--la-border,rgba(255,255,255,0.13))] text-[var(--la-muted,#a1a1aa)] hover:text-[var(--la-heading,#fafafa)]"
                }`}
              >
                Publish now
              </button>
              <button
                type="button"
                onClick={() => setScheduleIso(scheduleIso || defaultScheduleIso())}
                className={`rounded-full border px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide transition-colors ${
                  scheduleIso
                    ? "border-transparent bg-[var(--la-accent,#ffd444)] text-[var(--la-on-accent,#0b0b0a)]"
                    : "border-[var(--la-border,rgba(255,255,255,0.13))] text-[var(--la-muted,#a1a1aa)] hover:text-[var(--la-heading,#fafafa)]"
                }`}
              >
                Schedule
              </button>
              {scheduleIso && (
                <label className="ml-auto flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={isoToColomboInput(scheduleIso)}
                    onChange={(e) => {
                      const iso = colomboInputToIso(e.target.value);
                      if (iso) setScheduleIso(iso);
                    }}
                    className="rounded-lg border border-[var(--la-border,rgba(255,255,255,0.13))] bg-[var(--la-input-bg,rgba(255,255,255,0.05))] px-2.5 py-1.5 text-[12px] text-[var(--la-heading,#fafafa)] outline-none focus:border-[var(--la-accent,#ffd444)] [color-scheme:dark]"
                  />
                  <span className="text-[10.5px] text-[var(--la-muted,#a1a1aa)]">Sri Lanka time</span>
                </label>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--la-muted,#a1a1aa)]">
              {scheduleIso
                ? `Portals and bells receive it ${formatScheduleLabel(scheduleIso)} — until then only this studio can see it in the sent list.`
                : "Goes out the moment you post it — or schedule it for the exact minute it should reach the portals."}
            </p>
          </div>

          {note && (
            <p
              role="status"
              className={`rounded-xl px-3.5 py-2.5 text-[13px] ${
                note.tone === "ok"
                  ? "bg-[var(--la-good-bg,rgba(16,185,129,0.13))] text-[var(--la-good-text,#6ee7b7)]"
                  : "bg-[var(--la-danger-bg,rgba(244,63,94,0.13))] text-[var(--la-danger-text,#fda4af)]"
              }`}
            >
              {note.text}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--la-accent,#ffd444)] px-5 text-[13.5px] font-semibold text-[var(--la-on-accent,#0b0b0a)] transition-colors hover:bg-[var(--la-accent-hover,#fde047)] disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {busy ? "Saving…" : editingId != null ? "Save changes" : "Post notification"}
            </button>
            {editingId != null && (
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="flex h-11 items-center gap-2 rounded-xl border border-[var(--la-border,rgba(255,255,255,0.13))] px-5 text-[13.5px] font-semibold text-[var(--la-muted,#a1a1aa)] transition-colors hover:text-[var(--la-heading,#fafafa)] disabled:opacity-60"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      <div className="rounded-2xl border border-[var(--la-border,rgba(255,255,255,0.1))] bg-[var(--la-panel,#171715)] p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-[var(--la-heading,#fafafa)]">Sent notifications</h2>
        <p className="text-[12px] text-[var(--la-muted,#a1a1aa)]">
          Read counts update as portal users open them
        </p>

        <div className="mt-3.5 max-h-96 space-y-2.5 overflow-y-auto pr-1">
          {sent === null ? (
            <div className="h-14 animate-pulse rounded-xl bg-[var(--la-chip,rgba(255,255,255,0.06))]" />
          ) : sent.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[var(--la-muted,#a1a1aa)]">
              Nothing posted yet.
            </p>
          ) : (
            sent.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border px-4 py-3 ${
                  editingId === item.id
                    ? "border-amber-400/40 bg-[var(--la-warn-bg,rgba(251,191,36,0.07))]"
                    : "border-[var(--la-border,rgba(255,255,255,0.1))]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${KIND_CHIP[item.kind] ?? KIND_CHIP.general}`}>
                        {item.kind}
                      </span>
                      <span className="rounded-full border border-[var(--la-border,rgba(255,255,255,0.1))] px-2 py-0.5 text-[10.5px] font-medium text-[var(--la-muted,#a1a1aa)]">
                        {AUDIENCE_LABEL[item.audience] ?? item.audience}
                      </span>
                      {isScheduledFuture(item.scheduledAt) && (
                        <span className="rounded-full bg-[var(--la-warn-bg,rgba(251,191,36,0.13))] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--la-warn-text,#fcd34d)]">
                          Scheduled
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--la-muted,#a1a1aa)]">
                        {item.reads} read
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] font-semibold text-[var(--la-heading,#fafafa)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[12.5px] text-[var(--la-muted,#a1a1aa)]">
                      {item.body}
                    </p>
                    <p className="mt-1.5 text-[11px] text-[var(--la-faint,#71717a)]">
                      {item.authorName ? `${item.authorName} · ` : ""}
                      {dateLabel(item.createdAt)}
                    </p>
                    {isScheduledFuture(item.scheduledAt) && (
                      <p className="mt-1.5 rounded-lg bg-[var(--la-warn-bg,rgba(251,191,36,0.08))] px-2.5 py-1.5 text-[11px] leading-relaxed text-[var(--la-warn-text,#fcd34d)]">
                        Reaches the portals {formatScheduleLabel(item.scheduledAt ?? "")} —
                        office-only until then.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* v2.8.71.0 — EDIT: load the message back into the form */}
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      disabled={deletingId === item.id}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--la-border,rgba(255,255,255,0.1))] text-[var(--la-muted,#a1a1aa)] transition-colors hover:border-amber-400/50 hover:text-[var(--la-warn-text,#fcd34d)] disabled:opacity-50"
                      aria-label={`Edit "${item.title}"`}
                      title="Edit this notification"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      disabled={deletingId === item.id}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--la-border,rgba(255,255,255,0.1))] text-[var(--la-muted,#a1a1aa)] transition-colors hover:border-red-400/50 hover:text-[var(--la-danger-text,#fda4af)] disabled:opacity-50"
                      aria-label={`Delete "${item.title}"`}
                    >
                      {deletingId === item.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
