"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { MAX_CHAT_FILE_BYTES, MAX_CHAT_TEXT_LENGTH } from "@/lib/chat-limits";
import {
  ALLOWED_FILE_EXTS,
  FILE_ACCEPT_ATTR,
  extensionFor,
  humanFileSize,
} from "@/lib/file-types";
import { portalRoleHeaders } from "@/lib/portal-client";

/**
 * v2.8.53.0 — the ONE composer every chat surface sends through (the
 * homework "Ask the teacher" card, the Chat hub's open conversation and the
 * teacher register's inline reply). Owns the caption, the ONE optional
 * attachment and the send itself:
 *
 *   · the paperclip accepts ONE file (the same allow-list as every other
 *     uploader, ≤5 MB) with INSTANT pre-upload feedback — a wrong type or
 *     an oversized pick never leaves the browser;
 *   · a file may ride alone with an empty caption (WhatsApp style); without
 *     a file the two-character caption rule stands;
 *   · the POST is multipart/form-data through
 *     /api/portal/assignments/[id]/questions — the server re-checks the
 *     session, ownership, size, type and re-derives the MIME from ITS table.
 *
 * Surfaces keep their own flash UI: the composer reports through
 * onError(...) and calls onSent() after a successful send (so the surface
 * can refresh its thread + list and flash its own wording).
 */
export function ChatComposer({
  role,
  assignmentId,
  studentId,
  placeholder,
  ariaLabel,
  compact = false,
  hint,
  onSent,
  onError,
}: {
  role: "student" | "teacher";
  assignmentId: number;
  /** teacher replies target ONE student's thread */
  studentId?: number;
  placeholder: string;
  ariaLabel: string;
  /** the register's inline reply renders a tighter composer */
  compact?: boolean;
  /** quiet privacy line rendered next to the counter */
  hint?: string;
  onSent: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(
    () => () => {
      /* revoke nothing — no object URLs are used; the input just resets */
    },
    [],
  );

  function pick(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    const ext = extensionFor(next.name);
    if (!ext || !ALLOWED_FILE_EXTS.has(ext)) {
      onError("That file type isn't allowed in chat.");
      return;
    }
    if (next.size > MAX_CHAT_FILE_BYTES) {
      onError("Chat files are limited to 5 MB.");
      return;
    }
    if (next.size === 0) {
      onError("That file is empty.");
      return;
    }
    setFile(next);
  }

  const canSend = !sending && (text.trim().length >= 2 || file != null);

  async function send() {
    if (sending || (text.trim().length < 2 && !file)) return;
    setSending(true);
    try {
      const form = new FormData();
      form.set("body", text.trim());
      if (role === "teacher" && studentId != null) {
        form.set("studentId", String(studentId));
      }
      if (file) form.set("file", file);

      const res = await fetch(`/api/portal/assignments/${assignmentId}/questions`, {
        method: "POST",
        headers: portalRoleHeaders(role),
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not send the message.");
      }
      setText("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onSent();
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Could not send the message.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`rounded-2xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] ${
        compact ? "p-2" : "p-3"
      }`}
    >
      {file ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-2">
          <Paperclip size={13} className="shrink-0 text-[var(--pt-accent-text)]" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--pt-heading)]">
            {file.name}
          </span>
          <span className="shrink-0 text-[10.5px] text-[var(--pt-muted)]">
            {humanFileSize(file.size)}
          </span>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            aria-label="Remove the attached file"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)]"
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      <textarea
        rows={compact ? 2 : 3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_CHAT_TEXT_LENGTH}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`w-full resize-y rounded-xl border border-transparent bg-transparent px-2 py-1 ${
          compact ? "text-[12px]" : "text-[13px]"
        } leading-relaxed text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]`}
      />

      <div
        className={`flex items-center justify-between gap-2 ${
          compact ? "mt-1" : "mt-1.5"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <input
            ref={inputRef}
            type="file"
            accept={FILE_ACCEPT_ATTR}
            className="hidden"
            aria-label="Attach a file"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={sending}
            aria-label="Attach a file (photos, PDFs, documents — up to 5 MB)"
            title="Attach a file — photos, PDFs, documents · up to 5 MB"
            className={`grid shrink-0 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)] disabled:opacity-50 ${
              compact ? "h-8 w-8" : "h-9 w-9"
            } ${file ? "border-[var(--pt-accent)] text-[var(--pt-accent-text)]" : ""}`}
          >
            <Paperclip size={compact ? 13 : 14} />
          </button>
          <p className="truncate text-[10.5px] text-[var(--pt-muted)]">
            {hint ? `${hint} · ` : ""}
            {text.length}/{MAX_CHAT_TEXT_LENGTH}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full bg-[var(--pt-accent)] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50 ${
            compact ? "h-8 px-3.5 text-[11px]" : "h-9 px-4 text-[12px]"
          }`}
        >
          {sending ? (
            <Loader2 size={compact ? 11 : 12} className="animate-spin" />
          ) : (
            <Send size={compact ? 11 : 12} />
          )}
          Send
        </button>
      </div>
    </div>
  );
}
