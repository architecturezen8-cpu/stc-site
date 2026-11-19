"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, RefreshCw } from "lucide-react";
import { portalRoleHeaders } from "@/lib/portal-client";
import { ChatComposer } from "@/components/portal/chat-composer";
import {
  ChatMessageList,
  type ChatMessageView,
} from "@/components/portal/chat-message-ui";

export type HomeworkQuestionMessage = ChatMessageView;

/** The owner's call: "auto 1min sarayak refresh wenna dammoth aulak wenne nathi" */
const AUTO_REFRESH_MS = 60_000;
/** v2.8.52.0 — the refresh icon spins at least this long on every click. */
const SPIN_PULSE_MS = 650;

/**
 * v2.8.50.0 — Phase 2.1: the private "Ask the teacher" thread on the
 * homework page. The student sees ONLY their own conversation; the teachers
 * who set the work see it from their side. Plain text, sent through
 * /api/portal/assignments/[id]/questions — the server re-checks enrollment
 * and privacy on every call, so this island just renders and posts.
 *
 * v2.8.51.0 — the owner's chat round: a manual refresh button (no more
 * full-page reloads to see a reply), a quiet 60-second auto-refresh that
 * only runs while the tab is visible, WhatsApp-style delete on your own
 * messages, and the sent/seen ticks.
 *
 * v2.8.53.0 — the composer is the shared ChatComposer: ONE file may ride
 * along with the question (photos of the work, PDFs…), WhatsApp style.
 */
export function HomeworkQuestions({
  assignmentId,
  initialMessages,
}: {
  assignmentId: number;
  initialMessages: HomeworkQuestionMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const mounted = useRef(true);

  /* v2.8.52.0 — the refresh ICON itself spins on every click (min visible
     pulse), the owner's "refresh icon eka click karana animation ekak". */
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

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  /** Silent unless asked — background ticks never flash errors. */
  async function refresh(silent = true) {
    if (!silent) {
      pulseSpin();
      setRefreshing(true);
    }
    try {
      const res = await fetch(`/api/portal/assignments/${assignmentId}/questions`, {
        cache: "no-store",
        headers: portalRoleHeaders("student"),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        thread?: { messages?: HomeworkQuestionMessage[] };
      };
      if (mounted.current && res.ok && json.ok && Array.isArray(json.thread?.messages)) {
        setMessages(json.thread.messages);
      }
    } catch {
      /* a dropped poll is invisible — the next one will catch up */
    } finally {
      if (!silent && mounted.current) setRefreshing(false);
    }
  }

  /* Auto-refresh every minute while the tab is visible (and catch up the
     moment the visitor comes back) — the owner's "no trouble" ask. */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    const t = setInterval(tick, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  async function remove(message: ChatMessageView) {
    if (deletingId) return;
    setDeletingId(message.id);
    setFlash(null);
    try {
      const res = await fetch(
        `/api/portal/assignments/${assignmentId}/questions/${message.id}`,
        { method: "DELETE", headers: portalRoleHeaders("student") },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not delete the message.");
      }
      await refresh();
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

  return (
    <section
      aria-label="Ask the teacher"
      className="pt-rise pt-d3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 sm:p-7"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
          <MessageCircleQuestion size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
            Ask the teacher
          </h2>
          <p className="text-[11.5px] text-[var(--pt-body)]">
            Something unclear in this work? Ask here — privately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh(false)}
          disabled={refreshing}
          aria-label="Refresh the conversation"
          title="Refresh — new replies appear without a page reload"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)] disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={refreshing || spinPulse ? "animate-spin" : ""}
          />
        </button>
      </div>

      {messages.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-5 text-center text-[12.5px] leading-relaxed text-[var(--pt-body)]">
          No questions yet. Anything about the instructions, the files or your
          answer — ask it here and the teacher replies on this page.
        </p>
      ) : (
        <div className="pt-scrollbar mt-4 max-h-[340px] overflow-y-auto pr-0.5">
          <ChatMessageList
            messages={messages}
            viewerRole="student"
            onDelete={(m) => void remove(m)}
            deletingId={deletingId}
          />
        </div>
      )}

      {flash ? (
        <div
          role="status"
          className={`mt-3 rounded-xl px-4 py-2.5 text-[12.5px] ${
            flash.ok
              ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
              : "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      <ChatComposer
        role="student"
        assignmentId={assignmentId}
        placeholder="Type your question — only you and the teachers of this class can read it…"
        ariaLabel="Your question"
        hint="Private · visible to you and this class's teachers only"
        onSent={async () => {
          await refresh();
          setFlash({ ok: true, text: "Sent — your teacher will see it here." });
        }}
        onError={(message) => setFlash({ ok: false, text: message })}
      />
    </section>
  );
}
