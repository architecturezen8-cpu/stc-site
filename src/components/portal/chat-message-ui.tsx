"use client";

import { Check, CheckCheck, Download, FileText, Trash2 } from "lucide-react";

/**
 * v2.8.51.0 — the ONE bubble list every chat surface renders: the student
 * homework thread, the teacher's register Q&A and the new Chat hub.
 *
 * WhatsApp-style behaviours live here so they stay identical everywhere:
 *   · soft-deleted messages show the italic "message deleted" stub (the
 *     server already withholds the body);
 *   · the viewer's OWN messages can be deleted (trash icon → confirm) —
 *     only when the surface passes onDelete;
 *   · own messages carry the WhatsApp tick ladder (v2.8.52.0):
 *       ✓          sent — stored, not yet reached the other side;
 *       ✓✓ (grey)  delivered — their app has fetched it;
 *       ✓✓ (accent) seen — they opened the conversation.
 *
 * v2.8.53.0 — FILE ATTACHMENTS (the owner: "files attach karanna bari eka
 * witharai"): ONE optional file per message, the text is its caption.
 * Images render inline (tap → full view); every other type renders as a
 * file card with the size and a download link. The bytes are fetched
 * through the permission-checked /api/portal/chat/file/[messageId] route —
 * the URL carries nothing but the message id, so the server re-checks the
 * viewer on EVERY fetch.
 */

export type ChatAttachmentView = {
  name: string;
  mime: string;
  size: number;
};

export type ChatMessageView = {
  id: number;
  authorRole: "student" | "teacher";
  authorName: string;
  body: string;
  atLabel: string;
  deleted: boolean;
  read: boolean;
  /** v2.8.52.0 — their app fetched the message (grey ✓✓ until seen). */
  delivered?: boolean;
  /** v2.8.53.0 — the optional ONE file (the text is its caption). */
  attachment?: ChatAttachmentView | null;
};

function fileUrl(messageId: number): string {
  return `/api/portal/chat/file/${messageId}`;
}

function AttachmentBlock({ message }: { message: ChatMessageView }) {
  const att = message.attachment;
  if (!att || message.deleted) return null;
  const url = fileUrl(message.id);

  if (att.mime.startsWith("image/")) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${att.name}`}
        className="mt-1 block overflow-hidden rounded-xl border border-[var(--pt-border)] bg-black/10"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={att.name}
          loading="lazy"
          className="max-h-64 w-full max-w-[260px] object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      download={att.name}
      className="mt-1 flex max-w-[260px] items-center gap-2 rounded-xl border border-[var(--pt-border)] bg-black/10 px-3 py-2 transition-colors hover:border-[var(--pt-accent)]"
    >
      <FileText size={16} className="shrink-0 text-[var(--pt-accent-text)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
          {att.name}
        </span>
        <span className="block text-[10.5px] text-[var(--pt-muted)]">
          {att.size > 0 ? `${Math.max(1, Math.round(att.size / 1024))} KB` : "file"} · tap to download
        </span>
      </span>
      <Download size={14} className="shrink-0 text-[var(--pt-muted)]" />
    </a>
  );
}

export function ChatMessageList({
  messages,
  viewerRole,
  onDelete,
  deletingId,
}: {
  messages: ChatMessageView[];
  /** which side is looking — flips the bubbles and the delete rights */
  viewerRole: "student" | "teacher";
  /** omit on read-only surfaces */
  onDelete?: (message: ChatMessageView) => void;
  deletingId?: number | null;
}) {
  return (
    <ul className="space-y-2.5">
      {messages.map((m) => {
        const mine = m.authorRole === viewerRole;
        const canDelete = mine && !m.deleted && onDelete;
        return (
          <li
            key={m.id}
            className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
          >
            <div className="flex max-w-[92%] items-end gap-1.5 sm:max-w-[80%]">
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this message for everyone? This can't be undone.",
                      )
                    ) {
                      onDelete(m);
                    }
                  }}
                  disabled={deletingId === m.id}
                  aria-label="Delete this message"
                  title="Delete this message"
                  className="mb-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)] disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
              <div
                className={`min-w-0 rounded-2xl px-4 py-2.5 ${
                  m.deleted
                    ? "border border-dashed border-[var(--pt-border-strong)] bg-transparent"
                    : mine
                      ? "bg-[var(--pt-accent-soft)] text-[var(--pt-heading)]"
                      : "border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] text-[var(--pt-heading)]"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
                  {mine ? "You" : m.authorName}
                </p>
                {m.deleted ? (
                  <p className="mt-1 text-[12.5px] italic leading-relaxed text-[var(--pt-muted)]">
                    This message was deleted
                  </p>
                ) : (
                  <>
                    <AttachmentBlock message={m} />
                    {m.body ? (
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed break-words">
                        {m.body}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <p className="mt-1 flex items-center gap-1 px-1 text-[10.5px] text-[var(--pt-muted)]">
              {mine && !m.deleted ? (
                m.read ? (
                  <CheckCheck
                    size={12}
                    aria-label="Seen"
                    className="text-[var(--pt-accent-text)]"
                  />
                ) : m.delivered ? (
                  <CheckCheck size={12} aria-label="Delivered" />
                ) : (
                  <Check size={12} aria-label="Sent" />
                )
              ) : null}
              {m.atLabel}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
