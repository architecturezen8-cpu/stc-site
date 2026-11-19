"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";

export type ProfileSessionRow = {
  id: number;
  browser: string;
  os: string;
  createdLabel: string;
  expiresLabel: string;
  current: boolean;
};

/**
 * v2.8.40.0 — Profile page, "signed-in devices" list (owner: "log wela
 * inna anith devices" watenna one). Read-only rows + one guarded action:
 * signing every OTHER device out. The current session can never revoke
 * itself, so this button can not lock the admin out.
 */
export function ProfileSessions({ sessions }: { sessions: ProfileSessionRow[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const othersCount = sessions.filter((s) => !s.current).length;

  async function revokeOthers() {
    if (revoking) return;
    setRevoking(true);
    setFlash(null);
    setError(null);
    try {
      const res = await fetch("/api/lms-admin/profile/sessions", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; revoked?: number };
      if (!res.ok || !data.ok) {
        setError("The other devices could not be signed out. Try again in a moment.");
        return;
      }
      setFlash(
        (data.revoked ?? 0) === 0
          ? "No other devices were signed in."
          : `Signed out ${data.revoked} other device${data.revoked === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch {
      setError("Network hiccup — nothing was changed. Try again.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section
      aria-label="Signed-in devices"
      className="rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--la-tint-blue)] text-[var(--la-blue-text)]">
            <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
              Signed-in devices
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--la-body)]">
              {sessions.length} live session{sessions.length === 1 ? "" : "s"} for this account.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void revokeOthers()}
          disabled={revoking || othersCount === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-3.5 py-2 text-[12px] font-semibold text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {revoking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Sign out other devices
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--la-tint-blue)] text-[var(--la-blue-text)]">
                <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-[13px] font-semibold text-[var(--la-heading)]">
                  {s.browser} · {s.os}
                  {s.current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--la-good-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--la-good-text)]">
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      This device
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-[var(--la-muted)]">
                  Signed in {s.createdLabel} · expires {s.expiresLabel}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {flash && (
        <p className="mt-3 rounded-xl bg-[var(--la-good-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--la-good-text)]">
          {flash}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-[var(--la-danger-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--la-danger-text)]">
          {error}
        </p>
      )}
    </section>
  );
}
