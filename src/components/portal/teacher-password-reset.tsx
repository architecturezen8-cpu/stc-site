"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, RotateCcw, ShieldAlert } from "lucide-react";

/**
 * v2.8.67.0 — the TEACHER fallback of D.1. Students whose account carries
 * the synthetic adm-… identity (no reachable email yet) get their password
 * reset by a teacher who teaches their class / is its class teacher. The
 * temp password is shown ONCE; the student replaces it at the next login.
 */

export type TeacherResetGroup = {
  className: string;
  students: Array<{
    accountId: number;
    name: string;
    admissionNo: string;
  }>;
};

export function TeacherPasswordResetCard({ groups }: { groups: TeacherResetGroup[] }) {
  const [confirming, setConfirming] = useState<{ accountId: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const totalStudents = groups.reduce((n, g) => n + g.students.length, 0);

  async function issue(studentAccountId: number, name: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/students/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-portal-role": "teacher" },
        body: JSON.stringify({ studentAccountId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        status?: string;
        tempPassword?: string;
      };
      if (!data.ok) {
        setError(
          data.status === "not_enrolled"
            ? "This student is not in one of your classes."
            : data.status === "no_account"
              ? "This student has no portal account."
              : "Something went wrong. Please try again.",
        );
        setConfirming(null);
        return;
      }
      setIssued({ name, tempPassword: data.tempPassword || "" });
      setConfirming(null);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-[var(--pt-heading)]">
            <KeyRound size={15} className="text-[var(--pt-accent)]" aria-hidden="true" />
            Student password resets
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
            A student forgot their password and can&apos;t reach the email step? Issue a
            one-time temporary password — they choose their own at the next login.
          </p>
        </div>
      </div>

      {issued ? (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <ShieldAlert size={15} aria-hidden="true" />
            Temporary password for {issued.name}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-amber-400/30 bg-black/30 px-3 py-2.5 text-[16px] font-bold tracking-[0.18em] text-amber-100">
              {issued.tempPassword}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued.tempPassword);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard blocked — the code is visible anyway */
                }
              }}
              aria-label="Copy the temporary password"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-400/30 text-amber-200 transition-colors hover:bg-amber-400/10"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-amber-200/80">
            Shown only this once. Tell the student to sign in with it — the site will ask
            them to set their own password right away.
          </p>
          <button
            type="button"
            onClick={() => {
              setIssued(null);
              setCopied(false);
            }}
            className="mt-3 flex h-9 items-center gap-1.5 rounded-lg border border-[var(--pt-border)] px-3 text-[12.5px] font-medium text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Back to the list
          </button>
        </div>
      ) : confirming ? (
        <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-4">
          <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
            Issue a temporary password to {confirming.name}?
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
            Their current password stops working immediately, and their next login asks
            for a new private one. This action is recorded in the audit log.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => issue(confirming.accountId, confirming.name)}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--pt-accent)] text-[13px] font-semibold text-[var(--pt-on-accent)] transition-colors hover:bg-[var(--pt-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
              {busy ? "Issuing…" : "Yes, issue it"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(null)}
              className="h-10 rounded-lg border border-[var(--pt-border)] px-4 text-[13px] font-medium text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <p
              role="status"
              className="mb-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-[12.5px] text-red-200"
            >
              {error}
            </p>
          )}
          {totalStudents === 0 ? (
            <p className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-3 text-[12.5px] text-[var(--pt-body)]">
              None of your classes have students with portal accounts yet.
            </p>
          ) : (
            <div className="pt-scrollbar max-h-[280px] space-y-4 overflow-y-auto pr-1">
              {groups.map((group) => (
                <div key={group.className}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-faint)]">
                    {group.className}
                  </p>
                  <div className="space-y-1.5">
                    {group.students.map((student) => (
                      <div
                        key={student.accountId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--pt-heading)]">
                            {student.name}
                          </p>
                          <p className="text-[11px] text-[var(--pt-muted)]">
                            Adm. {student.admissionNo}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirming({ accountId: student.accountId, name: student.name })
                          }
                          className="shrink-0 rounded-lg border border-[var(--pt-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
                        >
                          Reset
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
      {children}
    </section>
  );
}
