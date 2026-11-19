"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Fingerprint, KeyRound, Loader2, ShieldCheck } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.8 — "PASSWORD & SECURITY" panel on the portal profile page
   (owner: "dan google login nathuwan nomal email ekai password ekai dala
   log unama acc eke password eka change karanna ba ne student,lms-admin,
   teachers,principal,parent portal wala … profile eken password eka
   change karanna option ekak na").

   The change-password machinery itself has existed since v2.8.67.0 — but
   it lived only on the buried /account/secure page, so nobody could FIND
   it from the profile. This island brings it onto the profile:

   · Password sign-in → the full form (current verified first, then the
     new one) posting straight to the existing
     POST /api/portal/auth/change-password with the role's own cookie.
   · Google-only account → an honest note: the password lives with
     Google, there is nothing to change here.
   ──────────────────────────────────────────────────────────────────────── */

type Notice = { kind: "ok" | "err"; text: string } | null;

export function PasswordSecurityCard({ role, signIn }: { role: string; signIn: "Password" | "Google" }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [done, setDone] = useState(false);

  const googleOnly = signIn === "Google";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setNotice({ kind: "err", text: "The two passwords don't match. Type them again." });
      return;
    }
    if (password.length < 6 || password.length > 72) {
      setNotice({ kind: "err", text: "Choose a new password with 6–72 characters." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portal/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-role": role },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; status?: string } | null;
      if (!res.ok || !data?.ok) {
        if (data?.status === "unauthorized") {
          window.location.assign("/login");
          return;
        }
        if (data?.status === "bad_current") {
          setNotice({ kind: "err", text: "That current password didn't match. Try again." });
        } else if (data?.status === "bad_password") {
          setNotice({ kind: "err", text: "Choose a new password with 6–72 characters." });
        } else {
          setNotice({ kind: "err", text: "Something went wrong — please try again in a moment." });
        }
        return;
      }
      setDone(true);
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch {
      setNotice({ kind: "err", text: "Something went wrong — please try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[13px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-faint)] focus:border-[var(--pt-accent)]";

  if (googleOnly) {
    return (
      <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pt-muted)]">
          <Fingerprint size={13} aria-hidden="true" /> Password
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
          This account signs in with <span className="font-semibold text-[var(--pt-heading)]">Google</span> — your
          password is managed by Google, so there is nothing to change here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
      {done ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-good-bg)] px-3 py-2.5 text-[12.5px] font-medium text-[var(--pt-good-text)]"
        >
          <ShieldCheck size={15} aria-hidden="true" />
          Password updated — use the new one on your next sign-in.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pt-muted)]">
            <KeyRound size={13} aria-hidden="true" /> Change your password
          </p>

          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-[var(--pt-body)]">Current password</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
              placeholder="The password you use now"
              aria-label="Current password"
              autoComplete="current-password"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[var(--pt-body)]">New password</span>
              <span className="relative block">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="6–72 characters"
                  aria-label="New password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide passwords" : "Show passwords"}
                  className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-[var(--pt-faint)] transition-colors hover:text-[var(--pt-heading)]"
                >
                  {show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[var(--pt-body)]">Repeat the new password</span>
              <input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
                placeholder="Once more"
                aria-label="Repeat the new password"
                autoComplete="new-password"
                required
              />
            </label>
          </div>

          {notice && (
            <p
              role="status"
              className={`rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${
                notice.kind === "ok"
                  ? "border-[var(--pt-border)] bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                  : "border-[var(--pt-border)] bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
              }`}
            >
              {notice.text}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !current || !password || !confirm}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-4 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-colors hover:bg-[var(--pt-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
            {busy ? "Saving…" : "Save the new password"}
          </button>
        </form>
      )}
    </div>
  );
}
