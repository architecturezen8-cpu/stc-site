"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { studentAvatarFor } from "@/lib/student-avatar";
import { portalRoleHeaders } from "@/lib/portal-client";
import { ChatComposer } from "@/components/portal/chat-composer";
import {
  ChatMessageList,
  type ChatMessageView,
} from "@/components/portal/chat-message-ui";

export type ChatThreadRow = {
  assignmentId: number;
  assignmentTitle: string;
  subject: string;
  className: string;
  /* teacher side only */
  studentId?: number;
  studentName?: string;
  admissionNo?: string;
  messageCount: number;
  unread: number;
  /** last message is the student's — teacher must answer / student awaits */
  needsReply: boolean;
  lastAuthorRole: "student" | "teacher" | null;
  lastBody: string;
  lastAtLabel: string;
  lastAt: string | null;
};

/** The owner's call: every minute, quietly, no harm — only while visible. */
const AUTO_REFRESH_MS = 60_000;
/** v2.8.52.0 — every manual refresh spins the icon at least this long. */
const SPIN_PULSE_MS = 650;

type Filter = "all" | "unread" | "reply";

/**
 * v2.8.51.0 — the dedicated Chat section (the owner: "apita baida ekata
 * wenama chat section ekak hadanna"), one island serving BOTH sides:
 *
 *   · STUDENT side  — every "Ask the teacher" conversation across their
 *     homework, filtered (All / Unread / Awaiting reply) and searchable, so
 *     a teacher's reply is discovered HERE instead of by walking into the
 *     assignment ("teacherta massage ekak awa kiyala ... assignment ekatama
 *     yanna ona" — fixed).
 *   · TEACHER side  — every student thread across the assignments they set,
 *     filtered (All / Unread / Needs reply) and searchable by student.
 *
 * The open thread auto-refreshes every 60 s (visible tab only — the same
 * quiet cadence the owner asked for on the homework page) and every open
 * marks the other side's messages read, so the badges stay honest.
 */
export function ChatHub({
  role,
  initialThreads,
}: {
  role: "student" | "teacher";
  initialThreads: ChatThreadRow[];
}) {
  const [threads, setThreads] = useState<ChatThreadRow[]>(initialThreads);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const [open, setOpen] = useState<ChatThreadRow | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  /* v2.8.52.0 — the refresh ICON itself spins on every click (min visible
     pulse), so a fast local fetch still gives the click feedback the owner
     asked for: "refresh icon eka click karana animation ekak danawada". */
  const [spinPulse, setSpinPulse] = useState(false);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
    },
    [],
  );
  function pulseSpin() {
    setSpinPulse(true);
    if (spinTimer.current) clearTimeout(spinTimer.current);
    spinTimer.current = setTimeout(() => setSpinPulse(false), SPIN_PULSE_MS);
  }

  /* the interval closures read these, never the stale props */
  const openRef = useRef<ChatThreadRow | null>(null);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const isTeacher = role === "teacher";

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  /* ── data loads ─────────────────────────────────────────────────────── */

  const loadList = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/chat", {
        cache: "no-store",
        headers: portalRoleHeaders(role),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: ChatThreadRow[];
      };
      if (res.ok && json.ok && Array.isArray(json.threads)) {
        setThreads(json.threads);
      }
    } catch {
      /* a dropped poll is invisible */
    }
  }, [role]);

  const loadThread = useCallback(
    async (row: ChatThreadRow, showSpinner = false) => {
      if (showSpinner) setThreadLoading(true);
      try {
        const qs =
          role === "teacher" && row.studentId
            ? `?studentId=${row.studentId}`
            : "";
        const res = await fetch(
          `/api/portal/assignments/${row.assignmentId}/questions${qs}`,
          { cache: "no-store", headers: portalRoleHeaders(role) },
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          thread?: { messages?: ChatMessageView[] };
          error?: string;
        };
        if (res.ok && json.ok && json.thread) {
          setMessages(json.thread.messages ?? []);
          setThreadError(null);
          /* opened = read: the row's badge clears in place */
          setThreads((cur) =>
            cur.map((t) =>
              t.assignmentId === row.assignmentId &&
              (role === "student" || t.studentId === row.studentId)
                ? { ...t, unread: 0 }
                : t,
            ),
          );
        } else if (!res.ok) {
          setThreadError(
            json.error === "not_found"
              ? "This conversation is no longer available."
              : "Could not open the conversation.",
          );
        }
      } catch {
        setThreadError("Could not open the conversation.");
      } finally {
        if (showSpinner) setThreadLoading(false);
      }
    },
    [role],
  );

  /* every minute: refresh the list, and the open thread too — visible only */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadList();
      if (openRef.current) void loadThread(openRef.current);
    };
    const t = setInterval(tick, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [loadList, loadThread]);

  function openThread(row: ChatThreadRow) {
    setOpen(row);
    setThreadError(null);
    setMessages([]);
    void loadThread(row, true);
  }

  function closeThread() {
    setOpen(null);
    setMessages([]);
    setThreadError(null);
    /* leaving a conversation refreshes the badges quietly */
    void loadList();
  }

  /* ── actions ────────────────────────────────────────────────────────── */

  async function remove(message: ChatMessageView) {
    const row = open;
    if (!row || deletingId) return;
    setDeletingId(message.id);
    setFlash(null);
    try {
      const res = await fetch(
        `/api/portal/assignments/${row.assignmentId}/questions/${message.id}`,
        { method: "DELETE", headers: portalRoleHeaders(role) },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not delete the message.");
      }
      await Promise.all([loadThread(row), loadList()]);
      setFlash({ ok: true, text: "Message deleted." });
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not delete the message.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function manualRefresh() {
    pulseSpin();
    setRefreshing(true);
    try {
      await loadList();
      if (openRef.current) await loadThread(openRef.current);
    } finally {
      setRefreshing(false);
    }
  }

  /* ── derived ────────────────────────────────────────────────────────── */

  const unreadTotal = useMemo(
    () => threads.reduce((sum, t) => sum + t.unread, 0),
    [threads],
  );
  const replyCount = useMemo(
    () => threads.filter((t) => t.needsReply).length,
    [threads],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((t) => {
      if (filter === "unread" && t.unread === 0) return false;
      if (filter === "reply" && !t.needsReply) return false;
      if (!q) return true;
      return (
        t.assignmentTitle.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.className.toLowerCase().includes(q) ||
        (t.studentName ?? "").toLowerCase().includes(q) ||
        (t.admissionNo ?? "").toLowerCase().includes(q)
      );
    });
  }, [threads, filter, query]);

  /* ── pieces ─────────────────────────────────────────────────────────── */

  const FILTERS: Array<{ key: Filter; label: string; count: number | null }> = [
    { key: "all", label: "All", count: threads.length },
    { key: "unread", label: isTeacher ? "Unread" : "Unread", count: unreadTotal },
    {
      key: "reply",
      label: isTeacher ? "Needs reply" : "Awaiting reply",
      count: replyCount,
    },
  ];

  function ThreadRow({ row }: { row: ChatThreadRow }) {
    const title = isTeacher ? row.studentName || "Student" : row.assignmentTitle;
    const sub = isTeacher
      ? `${row.assignmentTitle} · ${row.className}`
      : `${row.subject} · ${row.className}`;
    const preview = row.lastBody
      ? `${row.lastAuthorRole === (isTeacher ? "teacher" : "student") ? "You: " : ""}${row.lastBody}`
      : isTeacher
        ? "Conversation"
        : "No messages yet";
    return (
      <button
        type="button"
        onClick={() => openThread(row)}
        className={`w-full rounded-xl border p-3 text-left transition-colors ${
          open &&
          open.assignmentId === row.assignmentId &&
          (isTeacher ? open.studentId === row.studentId : true)
            ? "border-[var(--pt-accent)] bg-[var(--pt-accent-soft)]"
            : "border-[var(--pt-border)] bg-[var(--pt-panel-soft)] hover:border-[var(--pt-border-strong)]"
        }`}
      >
        <div className="flex items-start gap-3">
          {isTeacher ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={studentAvatarFor(row.admissionNo ?? String(row.studentId ?? ""))}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
              <BookOpen size={15} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                {title}
              </p>
              <span className="shrink-0 text-[10.5px] text-[var(--pt-muted)]">
                {row.lastAtLabel.split("·")[1]?.trim() ?? row.lastAtLabel}
              </span>
            </div>
            <p className="truncate text-[11px] text-[var(--pt-body)]">{sub}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--pt-muted)]">
                {preview}
              </p>
              {row.needsReply ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${
                    isTeacher
                      ? "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
                      : "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                  }`}
                >
                  {isTeacher ? "needs reply" : "awaiting"}
                </span>
              ) : null}
              {row.unread > 0 ? (
                <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--pt-accent)] px-1.5 text-[10.5px] font-bold text-[var(--pt-on-accent)]">
                  {row.unread}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>
    );
  }

  /* ── render ─────────────────────────────────────────────────────────── */

  const listPane = (
    <div
      className={`space-y-3 ${
        open ? "hidden lg:block" : "block"
      }`}
      aria-label="Conversation list"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
          {threads.length} conversation{threads.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => void manualRefresh()}
          disabled={refreshing}
          aria-label="Refresh the list"
          title="Refresh — new messages appear without a page reload"
          className="grid h-8 w-8 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)] disabled:opacity-50"
        >
          <RefreshCw
            size={13}
            className={refreshing || spinPulse ? "animate-spin" : ""}
          />
        </button>
      </div>

      <label className="flex h-10 items-center gap-2.5 rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-3.5">
        <Search size={13} className="shrink-0 text-[var(--pt-body)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            isTeacher
              ? "Find a student, assignment or class…"
              : "Find an assignment or subject…"
          }
          className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)]"
        />
      </label>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
              filter === f.key
                ? "bg-[var(--pt-accent)] text-[var(--pt-on-accent)]"
                : "border border-[var(--pt-border)] text-[var(--pt-body)] hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
            }`}
          >
            {f.label}
            {f.count != null && f.count > 0 ? (
              <span
                className={`rounded-full px-1.5 text-[9.5px] font-bold ${
                  filter === f.key
                    ? "bg-[var(--pt-on-accent)]/20"
                    : "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                }`}
              >
                {f.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-6 text-center text-[12.5px] leading-relaxed text-[var(--pt-body)]">
          {threads.length === 0
            ? isTeacher
              ? "No questions yet — when a student asks about your work, the conversation appears here."
              : "Nothing here yet. Open any homework and use “Ask the teacher” — the conversation shows up here."
            : "Nothing matches this filter."}
        </p>
      ) : (
        <div className="pt-scrollbar max-h-[560px] space-y-2 overflow-y-auto pr-0.5">
          {visible.map((row) => (
            <ThreadRow
              key={`${row.assignmentId}-${row.studentId ?? "me"}`}
              row={row}
            />
          ))}
        </div>
      )}
    </div>
  );

  const threadPane = (
    <div
      className={`${open ? "block" : "hidden lg:flex"} min-h-[420px] flex-col rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)]`}
      aria-label="Conversation"
    >
      {open ? (
        <>
          <div className="flex items-center gap-2.5 border-b border-[var(--pt-divider)] p-4">
            <button
              type="button"
              onClick={closeThread}
              aria-label="Back to the conversation list"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)] lg:hidden"
            >
              <ArrowLeft size={15} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                {isTeacher ? open.studentName : open.assignmentTitle}
              </p>
              <p className="truncate text-[11px] text-[var(--pt-body)]">
                {isTeacher
                  ? `${open.assignmentTitle} · ${open.subject} · ${open.className}`
                  : `${open.subject} · ${open.className}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                pulseSpin();
                void loadThread(open);
              }}
              disabled={threadLoading}
              aria-label="Refresh the conversation"
              title="Refresh — new messages appear without a page reload"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)] disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={threadLoading || spinPulse ? "animate-spin" : ""}
              />
            </button>
          </div>

          <div className="pt-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            {threadError ? (
              <p className="rounded-xl bg-[var(--pt-danger-bg)] px-4 py-3 text-[12.5px] text-[var(--pt-danger-text)]">
                {threadError}
              </p>
            ) : messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-6 text-center text-[12.5px] leading-relaxed text-[var(--pt-body)]">
                No messages in this conversation yet — say hello below.
              </p>
            ) : (
              <ChatMessageList
                messages={messages}
                viewerRole={role}
                onDelete={(m) => void remove(m)}
                deletingId={deletingId}
              />
            )}
          </div>

          {flash ? (
            <div
              role="status"
              className={`mx-4 rounded-xl px-4 py-2.5 text-[12.5px] ${
                flash.ok
                  ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                  : "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
              }`}
            >
              {flash.text}
            </div>
          ) : null}

          <div className="border-t border-[var(--pt-divider)] p-4">
            <ChatComposer
              key={`${open.assignmentId}-${open.studentId ?? "me"}`}
              role={role}
              assignmentId={open.assignmentId}
              studentId={role === "teacher" ? open.studentId : undefined}
              compact
              placeholder={
                isTeacher
                  ? `Reply to ${open.studentName ?? "the student"} — only they see it…`
                  : "Type your question — only you and this class's teachers can read it…"
              }
              ariaLabel="Your message"
              hint="Private"
              onSent={async () => {
                await Promise.all([loadThread(open), loadList()]);
                setFlash({ ok: true, text: "Sent." });
              }}
              onError={(message) => setFlash({ ok: false, text: message })}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <MessageSquare size={20} />
          </span>
          <p className="text-[13px] font-semibold text-[var(--pt-heading)]">
            Pick a conversation
          </p>
          <p className="max-w-[300px] text-[12px] leading-relaxed text-[var(--pt-body)]">
            {isTeacher
              ? "Choose a student's question from the list — the conversation opens here and the badge clears once you've read it."
              : "Choose a conversation from the list — your teacher's replies open here and the badge clears once you've read them."}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      {/* the whole list card hides on mobile while a thread is open — not
          just its contents, or an empty bordered shell would linger */}
      <div
        className={`pt-rise pt-d1 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5 ${
          open ? "hidden lg:block" : "block"
        }`}
      >
        {listPane}
      </div>
      <div className={`${open ? "block" : "hidden lg:block"} pt-rise pt-d2`}>{threadPane}</div>
    </div>
  );
}
