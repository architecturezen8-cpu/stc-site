"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Eraser, Loader2, RotateCw, Save, Timer } from "lucide-react";

/* ── v2.8.70.1 — CHAT CLEANUP panel (LMS Admin Studio) ───────────────────
   The owner: "full option thiyenna one lms-adminta eyata kochchara
   kalekinda auto cleanup wenna one kiyala chose karanna option ekak one,
   file auto delete system ekatath duration eka choose karanna option eka
   danna." Two independent dials (messages / attachments), each Off or a
   day count, plus how-much-would-go stats — the automatic sweep rides
   chat traffic at most once every 30 min.

   v2.8.76.3 — the owner's new contract:
   • "clean now kiyana eka click karama database eke danata thiyana okkoma
     chat clear wenna one" → "Clean up now" is a FULL WIPE of every chat
     message + attachment in the database (no cutoff involved).
   • "duration eka select karala thibbama auto e time ekata clear wenna
     one" → the day dials stay the automatic older-than-N sweep.
   • "kochara messages thiyanawada, storage eke kochara use karanawada
     tracking system ekak" → the LIVE TRACKING card shows counts ONLY
     (chats / messages / attachments / bytes) — never content (privacy).

   v2.8.76.4 — THE "DURATION DOESN'T APPLY" BUG, root-caused and fixed:
   the Save button's `dirty` check compared the picks against `stats` —
   but since v2.8.76.2 the live-preview fetch overwrites `stats` with the
   PICKED durations (that is the whole point of the preview), so a split
   second after picking, `stats` matched the picks and the button greys
   itself out — the owner literally could not click "Save durations".
   Fix: the SAVED dials now live in their own `savedDays` state (fed only
   by override-free fetches and the PUT reply); `dirty` compares the picks
   against THAT, never against the preview. Refresh / Clean-now also no
   longer silently revert unsaved picks. And the PUT route now fires the
   throttled sweep right after saving, so the durations apply at once
   instead of waiting for the next chat traffic. */

type Stats = {
  chatRetentionDays: number;
  fileRetentionDays: number;
  messagesOlderThan: number;
  attachmentsOlderThan: number;
  bytesOlderThan: number;
  /* v2.8.76.2 — the cutoffs behind the counts (null when that dial is off). */
  chatCutoffAt: string | null;
  fileCutoffAt: string | null;
};

type Totals = {
  totalChats: number;
  totalMessages: number;
  totalAttachments: number;
  totalBytes: number;
  lastChatCleanupAt: string | null;
  lastFileCleanupAt: string | null;
};

type CleanResult = {
  scope?: "all";
  messagesDeleted: number;
  attachmentsCleared: number;
  bytesReclaimed: number;
  chatRetentionDays?: number;
  fileRetentionDays?: number;
  remainingMessages?: number;
  remainingAttachments?: number;
};

const CHOICES: { value: number; label: string }[] = [
  { value: 0, label: "Keep forever (auto-clear off)" },
  { value: 7, label: "Auto-clear after 7 days" },
  { value: 14, label: "Auto-clear after 14 days" },
  { value: 30, label: "Auto-clear after 30 days (1 month)" },
  { value: 60, label: "Auto-clear after 60 days (2 months)" },
  { value: 90, label: "Auto-clear after 90 days (3 months)" },
  { value: 180, label: "Auto-clear after 180 days (6 months)" },
  { value: 365, label: "Auto-clear after 1 year" },
];

function mb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/* v2.8.76.2 — "19 Oct 2026" style labels for the cutoff dates. */
function cutoffLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysLabel(days: number): string {
  if (days === 365) return "1 year";
  if (days === 0) return "off";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function ChatCleanupPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [chatDays, setChatDays] = useState(0);
  const [fileDays, setFileDays] = useState(0);
  /* v2.8.76.4 — what is actually SAVED in the database. Kept apart from
     `stats` because the preview fetch turns `stats` into a mirror of the
     picks (that mirroring is what disabled the Save button before). */
  const [savedDays, setSavedDays] = useState<{ chat: number; file: number } | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  /* v2.8.76.4 — `withDays` = preview fetch against the PICKED dials; the
     reply is pick-based and must NOT touch `savedDays`. An override-free
     fetch is the only moment we learn the real saved dials, and only the
     mount call resets the selects (refresh / clean-now keep the owner's
     unsaved picks on screen). */
  const load = useCallback(
    async (withDays?: { chatDays: number; fileDays: number }, resetPicks = false) => {
      const q =
        withDays && (withDays.chatDays > 0 || withDays.fileDays > 0)
          ? `?chatDays=${withDays.chatDays}&fileDays=${withDays.fileDays}`
          : "";
      const res = await fetch(`/api/lms-admin/chat-settings${q}`);
      const data = (await res.json()) as {
        ok: boolean;
        stats?: Stats;
        totals?: Totals;
      };
      if (data.ok && data.stats) {
        setStats(data.stats);
        if (!q) {
          setSavedDays({ chat: data.stats.chatRetentionDays, file: data.stats.fileRetentionDays });
          if (resetPicks) {
            setChatDays(data.stats.chatRetentionDays);
            setFileDays(data.stats.fileRetentionDays);
          }
        }
      }
      if (data.ok && data.totals) setTotals(data.totals);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load(undefined, true);
      } catch {
        /* the form still renders with defaults */
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /* v2.8.76.2 — the preview always counts against the durations ON SCREEN,
     so the numbers track the picks live (before anything is saved). */
  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const q = chatDays > 0 || fileDays > 0 ? `?chatDays=${chatDays}&fileDays=${fileDays}` : "";
        const res = await fetch(`/api/lms-admin/chat-settings${q}`);
        const data = (await res.json()) as { ok: boolean; stats?: Stats; totals?: Totals };
        if (!cancelled && data.ok && data.stats) setStats(data.stats);
        if (!cancelled && data.ok && data.totals) setTotals(data.totals);
      } catch {
        /* keep the last good preview */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsLoaded, chatDays, fileDays]);

  async function refreshTotals() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      /* v2.8.76.4 — re-fetch against the picks on screen (same contract as
         the live preview) and never reset them. */
      await load(chatDays > 0 || fileDays > 0 ? { chatDays, fileDays } : undefined);
    } catch {
      /* keep the last good numbers */
    } finally {
      setRefreshing(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/lms-admin/chat-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatRetentionDays: chatDays, fileRetentionDays: fileDays }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        stats?: Stats;
        totals?: Totals;
      };
      if (data.ok && data.stats) {
        setStats(data.stats);
        /* v2.8.76.4 — the PUT reply is override-free, so its stats ARE the
           freshly saved dials; `dirty` clears the moment they land. */
        setSavedDays({ chat: data.stats.chatRetentionDays, file: data.stats.fileRetentionDays });
        if (data.totals) setTotals(data.totals);
        setNote({
          tone: "ok",
          text:
            chatDays > 0 || fileDays > 0
              ? `Saved — the auto-clear will now remove ${[
                  chatDays > 0 ? `messages older than ${daysLabel(chatDays)}` : null,
                  fileDays > 0 ? `attachment files older than ${daysLabel(fileDays)}` : null,
                ]
                  .filter(Boolean)
                  .join(" and ")} as chat traffic comes in (checked at most once every 30 minutes).`
              : "Saved — auto-clear is off; chats are kept until you use Clean up now.",
        });
      } else {
        setNote({ tone: "err", text: data.error || "Could not save." });
      }
    } catch {
      setNote({ tone: "err", text: "Network problem — please try again." });
    } finally {
      setSaving(false);
    }
  }

  /* v2.8.76.3 — "Clean up now" = FULL WIPE: every message + attachment in
     the database goes, right now. The dialog says exactly how much. */
  async function cleanNow() {
    if (cleaning) return;
    if (!totals || totals.totalMessages === 0) {
      setNote({
        tone: "ok",
        text: "There is nothing to clean — the database has no chat messages right now.",
      });
      return;
    }
    const confirmText = `Delete ALL chats now?\n\n${totals.totalMessages} message(s) across ${totals.totalChats} chat(s) will be permanently deleted, including ${totals.totalAttachments} attachment(s) (${mb(totals.totalBytes)}).\n\nThis cannot be undone.`;
    if (!window.confirm(confirmText)) {
      return;
    }
    setCleaning(true);
    setNote(null);
    try {
      const res = await fetch("/api/lms-admin/chat-settings/cleanup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "all" }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; result?: CleanResult };
      if (data.ok && data.result) {
        const r = data.result;
        setNote({
          tone: "ok",
          text: `Done — ${r.messagesDeleted} message(s) deleted, ${r.attachmentsCleared} attachment(s) cleared (${mb(r.bytesReclaimed)} freed). The database now has 0 chat messages.`,
        });
        await load();
      } else {
        setNote({ tone: "err", text: data.error || "The cleanup failed." });
      }
    } catch {
      setNote({ tone: "err", text: "Network problem — please try again." });
    } finally {
      setCleaning(false);
    }
  }

  /* v2.8.76.4 — compare the picks against the SAVED dials, never against
     the preview `stats` (the preview mirrors the picks by design, which is
     exactly what used to disable the Save button half a second after a
     pick). */
  const dirty =
    savedDays != null &&
    (savedDays.chat !== chatDays || savedDays.file !== fileDays);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--la-accent-soft)] text-[var(--la-accent-text)]">
            <Timer size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--la-heading)]">Auto-clear durations</h2>
            <p className="text-[12px] text-[var(--la-muted)]">
              Applies to the assignment Q&amp;A chat (student ↔ teacher threads)
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-[var(--la-heading)]">Chat messages</span>
            <select
              value={chatDays}
              onChange={(e) => setChatDays(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-3 text-[13.5px] text-[var(--la-heading)] outline-none focus:border-[var(--la-accent-text)]"
            >
              {CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px] text-[var(--la-muted)]">
              Whole messages (both sides) — text and attachment together
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-[var(--la-heading)]">Chat files / attachments</span>
            <select
              value={fileDays}
              onChange={(e) => setFileDays(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-3 text-[13.5px] text-[var(--la-heading)] outline-none focus:border-[var(--la-accent-text)]"
            >
              {CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11.5px] text-[var(--la-muted)]">
              Files are removed from storage; the message text stays
            </span>
          </label>
        </div>

        {note && (
          <p
            role="status"
            className={`mt-3.5 rounded-xl px-3.5 py-2.5 text-[13px] ${
              note.tone === "ok"
                ? "bg-[var(--la-good-bg)] text-[var(--la-good-text)]"
                : "bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]"
            }`}
          >
            {note.text}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--la-accent-text)] px-4 text-[13px] font-semibold text-[var(--la-panel)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving…" : "Save durations"}
          </button>
        </div>
      </div>

      {/* v2.8.76.3 — LIVE TRACKING: what is in the database RIGHT NOW.
          Counts only — never content (privacy). */}
      <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--la-accent-soft)] text-[var(--la-accent-text)]">
              <Database size={17} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--la-heading)]">
                Live tracking — what&apos;s in the database right now
              </h2>
              <p className="text-[12px] text-[var(--la-muted)]">
                Counts only — message content and files are never shown here (privacy)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refreshTotals()}
            disabled={refreshing}
            aria-label="Refresh tracking numbers"
            title="Refresh"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--la-border)] text-[var(--la-muted)] transition-colors hover:bg-[var(--la-chip)] hover:text-[var(--la-heading)] disabled:opacity-50"
          >
            <RotateCw size={15} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        </div>

        {totals == null ? (
          <div className="mt-3 h-14 animate-pulse rounded-xl bg-[var(--la-chip)]" />
        ) : (
          <>
            <div className="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-[var(--la-border)] px-4 py-3">
                <p className="font-display text-[22px] font-semibold tabular-nums text-[var(--la-heading)]">
                  {totals.totalChats}
                </p>
                <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--la-muted)]">
                  chats (threads)
                </p>
              </div>
              <div className="rounded-xl border border-[var(--la-border)] px-4 py-3">
                <p className="font-display text-[22px] font-semibold tabular-nums text-[var(--la-heading)]">
                  {totals.totalMessages}
                </p>
                <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--la-muted)]">
                  messages
                </p>
              </div>
              <div className="rounded-xl border border-[var(--la-border)] px-4 py-3">
                <p className="font-display text-[22px] font-semibold tabular-nums text-[var(--la-heading)]">
                  {totals.totalAttachments}
                </p>
                <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--la-muted)]">
                  attachments
                </p>
              </div>
              <div className="rounded-xl border border-[var(--la-border)] px-4 py-3">
                <p className="font-display text-[22px] font-semibold tabular-nums text-[var(--la-heading)]">
                  {mb(totals.totalBytes)}
                </p>
                <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--la-muted)]">
                  chat storage used
                </p>
              </div>
            </div>

            <p className="mt-2.5 text-[11.5px] text-[var(--la-muted)]">
              Last message cleanup:{" "}
              <span className="font-medium text-[var(--la-heading)]">
                {cutoffLabel(totals.lastChatCleanupAt) || "never"}
              </span>
              {" · "}Last file cleanup:{" "}
              <span className="font-medium text-[var(--la-heading)]">
                {cutoffLabel(totals.lastFileCleanupAt) || "never"}
              </span>
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void cleanNow()}
                disabled={cleaning}
                className="flex h-10 items-center gap-2 rounded-xl bg-[var(--la-danger-bg)] px-4 text-[13px] font-semibold text-[var(--la-danger-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {cleaning ? <Loader2 size={15} className="animate-spin" /> : <Eraser size={15} />}
                {cleaning ? "Cleaning…" : "Clean up now — delete ALL chats"}
              </button>
              <span className="text-[11.5px] text-[var(--la-muted)]">
                Wipes every message + attachment in the database immediately
              </span>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)] p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-[var(--la-heading)]">What the next AUTO sweep would remove</h2>
        <p className="text-[12px] text-[var(--la-muted)]">
          Live counts for the durations you picked above — the automatic sweep
          rides chat traffic at most once every 30 minutes
        </p>
        {stats == null ? (
          <div className="mt-3 h-14 animate-pulse rounded-xl bg-[var(--la-chip)]" />
        ) : (
          <div className="mt-3.5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--la-border)] px-4 py-3">
              <p className="font-display text-[22px] font-semibold tabular-nums text-[var(--la-heading)]">
                {stats.messagesOlderThan}
              </p>
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--la-muted)]">
                old messages
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--la-muted)]">
                {stats.chatRetentionDays > 0
                  ? `older than ${cutoffLabel(stats.chatCutoffAt)} · ${daysLabel(stats.chatRetentionDays)}`
                  : "auto-clear is off"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--la-border)] px-4 py-3">
              <p className="font-display text-[22px] font-semibold tabular-nums text-[var(--la-heading)]">
                {stats.attachmentsOlderThan}
              </p>
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--la-muted)]">
                old attachments
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--la-muted)]">
                {stats.fileRetentionDays > 0
                  ? `older than ${cutoffLabel(stats.fileCutoffAt)} · ${daysLabel(stats.fileRetentionDays)}`
                  : "auto-clear is off"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--la-border)] px-4 py-3">
              <p className="font-display text-[22px] font-semibold tabular-nums text-[var(--la-heading)]">
                {mb(stats.bytesOlderThan)}
              </p>
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--la-muted)]">
                storage to reclaim
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
