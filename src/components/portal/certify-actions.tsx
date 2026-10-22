"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Lock,
  Stamp,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { portalRoleHeaders } from "@/lib/portal-client";

/* ────────────────────────────────────────────────────────────────────────
   v2.8.63.0 — the certification action panel (Principal only).

   Certify  → server-side stamping: the sheet becomes CERTIFIED, the
              Principal's name snapshot lands on the signature line and
              the signature + seal are served from the database from then
              on. Requires BOTH stamps to be uploaded first.
   Return   → back to the class teacher as a draft, with a required note
              the teacher sees at the top of their editor.
   Both actions are server-side state — the browser never touches the
   stamps, and every transition writes an audit event row.
   ──────────────────────────────────────────────────────────────────────── */

export function CertifyActions({
  cardId,
  status,
  studentName,
  className,
  year,
  hasSign,
  hasSeal,
  certifiedByName,
  certifiedAtLabel,
}: {
  cardId: number;
  status: "draft" | "submitted" | "certified";
  studentName: string;
  className: string;
  year: string;
  hasSign: boolean;
  hasSeal: boolean;
  certifiedByName: string;
  certifiedAtLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"certify" | "return" | null>(null);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);

  async function act(action: "certify" | "return") {
    if (busy) return;
    if (action === "certify") {
      if (!hasSign || !hasSeal) {
        setFlash({
          ok: false,
          text: "Upload your signature and the college seal first (Signature section) — certification stamps them on the sheet.",
        });
        return;
      }
      const ok = window.confirm(
        `Certify ${studentName}'s ${year} report card?\nYour signature and the college seal will be placed on it, and the student and parents will be able to read it.`,
      );
      if (!ok) return;
    } else {
      if (!note.trim()) {
        setFlash({ ok: false, text: "Write a short note for the class teacher — what must change before you can certify." });
        return;
      }
      const ok = window.confirm(
        `Return ${studentName}'s sheet to the class teacher?\nIt becomes a draft again with your note attached.`,
      );
      if (!ok) return;
    }
    setBusy(action);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/report-cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...portalRoleHeaders("principal") },
        body: JSON.stringify(action === "certify" ? { action: "certify" } : { action: "return", note }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; status?: string; error?: string }
        | null;
      if (res.ok && json?.ok) {
        if (action === "certify") {
          setFlash({
            ok: true,
            text: "Certified — your signature and the seal are on the sheet, and the family can read it now.",
          });
        } else {
          setFlash({ ok: true, text: "Returned to the class teacher with your note." });
          setNote("");
          setReturnOpen(false);
        }
        router.refresh();
      } else {
        const text =
          json?.error === "signature_missing"
            ? "Your signature + seal aren't uploaded yet — open the Signature section first."
            : json?.error === "wrong_state"
              ? "This sheet changed state while you were reviewing it — refresh and check again."
              : json?.error === "bad_request"
                ? "The return note is required."
                : "The action failed — refresh and try again.";
        setFlash({ ok: false, text });
      }
    } catch {
      setFlash({ ok: false, text: "Network problem — nothing changed." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pt-rise rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
      {status === "submitted" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => act("certify")}
              disabled={busy != null}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-5 py-2.5 text-[12.5px] font-bold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy === "certify" ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Stamp size={14} aria-hidden="true" />
              )}
              Certify — place signature &amp; seal
            </button>
            <button
              type="button"
              onClick={() => setReturnOpen((v) => !v)}
              disabled={busy != null}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)] disabled:opacity-50"
            >
              <Undo2 size={14} aria-hidden="true" />
              Return with a note
            </button>
          </div>
          {!hasSign || !hasSeal ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-[var(--pt-warn-bg)] px-3.5 py-2.5 text-[11.5px] font-medium text-[var(--pt-warn-text)]">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              {!hasSign && !hasSeal
                ? "Your signature and the college seal are not uploaded yet — certification needs both."
                : !hasSign
                  ? "Your signature is not uploaded yet — certification needs it."
                  : "The college seal is not uploaded yet — certification needs it."}
            </p>
          ) : null}
          {returnOpen ? (
            <div className="mt-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5">
              <label
                htmlFor={`rc-return-note-${cardId}`}
                className="text-[12px] font-semibold text-[var(--pt-heading)]"
              >
                Note to {className}&apos;s class teacher
              </label>
              <textarea
                id={`rc-return-note-${cardId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="e.g. The attendance figures for term 2 look wrong — please recheck with the register."
                className="mt-1.5 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg, var(--pt-panel))] px-3 py-2 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--pt-muted)]">
                  The sheet returns to their drafts with this note on top.
                </p>
                <button
                  type="button"
                  onClick={() => act("return")}
                  disabled={busy != null || !note.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-border-strong)] disabled:opacity-40"
                >
                  {busy === "return" ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Undo2 size={13} aria-hidden="true" />
                  )}
                  Return the sheet
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--pt-good-text)]">
            <CheckCircle2 size={15} aria-hidden="true" />
            Certified{certifiedByName ? ` by ${certifiedByName}` : ""}
            {certifiedAtLabel ? ` · ${certifiedAtLabel}` : ""}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--pt-body)]">
            <Lock size={12} aria-hidden="true" />
            The student and parents can read this sheet. Found a mistake?
          </p>
          <button
            type="button"
            onClick={() => setReturnOpen((v) => !v)}
            disabled={busy != null}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)] disabled:opacity-50"
          >
            <Undo2 size={13} aria-hidden="true" />
            Return with a note (un-certifies)
          </button>
          {returnOpen ? (
            <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5">
              <label
                htmlFor={`rc-return-note-${cardId}`}
                className="text-[12px] font-semibold text-[var(--pt-heading)]"
              >
                Note to the class teacher
              </label>
              <textarea
                id={`rc-return-note-${cardId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Why is this sheet coming back?"
                className="mt-1.5 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg, var(--pt-panel))] px-3 py-2 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--pt-muted)]">
                  The certification is undone; the sheet becomes a draft again.
                </p>
                <button
                  type="button"
                  onClick={() => act("return")}
                  disabled={busy != null || !note.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-4 py-2 text-[12px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-border-strong)] disabled:opacity-40"
                >
                  {busy === "return" ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Undo2 size={13} aria-hidden="true" />
                  )}
                  Return the sheet
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {flash ? (
        <div
          role="status"
          className={`mt-3 rounded-xl border px-4 py-2.5 text-[12px] ${
            flash.ok
              ? "border-transparent bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
              : "border-transparent bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
          }`}
        >
          {flash.text}
        </div>
      ) : null}
    </div>
  );
}
