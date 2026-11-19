"use client";

import { useEffect, useState } from "react";
import { Check, FileWarning, Loader2, X } from "lucide-react";

/* ── v2.8.70.3 — PURGE CONSENT cards (shared) ────────────────────────────
   The message that reaches the file owner when the LMS admin wants to
   delete their storage. Rendered by the School notifications panel (every
   dashboard) AND as a banner on the My Storage pages — ONE component, no
   drift. Accept unlocks the admin's delete; Decline refuses it.

   v2.8.71.0 — with the notifications panel moving OFF the dashboard into
   the header bell + a dedicated page, the dashboard still needs a home for
   these approval requests: PurgeConsentStrip self-fetches the open
   requests (same broadcasts endpoint, so no new API) and renders nothing
   at all when there is nothing pending. */

export type ConsentCard = {
  id: number;
  status: string;
  items: { kind: string; fileId: number; label: string; bytes: number }[];
  totalBytes: number;
  reason: string | null;
  requestedByName: string | null;
  createdAt: string;
};

function fmt(bytes: number): string {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function PurgeConsentCards({
  initial,
  portalRole,
}: {
  initial: ConsentCard[];
  portalRole: string;
}) {
  const [cards, setCards] = useState(initial.filter((c) => c.status === "pending"));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (cards.length === 0 && !note) return null;

  async function respond(id: number, accept: boolean) {
    if (busyId != null) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/portal/storage/purge-requests/respond", {
        method: "POST",
        headers: { "content-type": "application/json", "x-portal-role": portalRole },
        body: JSON.stringify({ id, accept }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setCards((prev) => prev.filter((c) => c.id !== id));
        setNote(
          accept
            ? "Accepted — the school office can now delete the file(s)."
            : "Declined — the school office cannot delete those files.",
        );
      } else {
        setNote(data.error || "Could not save your answer.");
      }
    } catch {
      setNote("Network problem — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {cards.map((card) => (
        <div
          key={card.id}
          className="rounded-2xl border border-[var(--pt-warn-border, var(--pt-border))] bg-[var(--pt-warn-bg)] px-4 py-3"
        >
          <div className="flex items-start gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--pt-warn-text)]/10 text-[var(--pt-warn-text)]">
              <FileWarning size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
                Storage cleanup approval requested
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
                {card.requestedByName ? `${card.requestedByName} asks` : "The school office asks"} to
                delete {card.items.length === 1 ? "1 file" : `${card.items.length} files`} (
                {fmt(card.totalBytes)}):
                {card.items.slice(0, 3).map((i) => i.label).join(", ")}
                {card.items.length > 3 ? "…" : ""}
              </p>
              {card.reason && (
                <p className="mt-1 text-[12px] italic text-[var(--pt-muted)]">“{card.reason}”</p>
              )}
              <p className="mt-1 text-[11px] text-[var(--pt-faint)]">
                Accepting allows the deletion. Declining keeps your files safe.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void respond(card.id, true)}
                  disabled={busyId === card.id}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-[var(--pt-good-text)] px-3.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busyId === card.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => void respond(card.id, false)}
                  disabled={busyId === card.id}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--pt-border)] px-3.5 text-[12.5px] font-semibold text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-chip)] hover:text-[var(--pt-heading)] disabled:opacity-60"
                >
                  <X size={14} />
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {note && (
        <p
          role="status"
          className="rounded-2xl bg-[var(--pt-info-bg)] px-4 py-2.5 text-[12.5px] text-[var(--pt-info-text)]"
        >
          {note}
        </p>
      )}
    </div>
  );
}

/* ── v2.8.71.0 — the dashboard strip ─────────────────────────────────────
   Fetches the account's open consent requests itself and renders the cards
   only when at least one is pending. setState runs post-await only. */
export function PurgeConsentStrip({ portalRole }: { portalRole: string }) {
  const [cards, setCards] = useState<ConsentCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/broadcasts?filter=all", {
          headers: { "x-portal-role": portalRole },
        });
        const data = (await res.json()) as { ok: boolean; consents?: ConsentCard[] };
        if (!cancelled) setCards(data.ok ? (data.consents ?? []) : []);
      } catch {
        if (!cancelled) setCards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [portalRole]);

  if (cards === null || cards.length === 0) return null;
  return <PurgeConsentCards initial={cards} portalRole={portalRole} />;
}
