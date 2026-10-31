"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2, MailCheck } from "lucide-react";
import { MailSpamNote } from "@/components/mail-spam-note";

/**
 * v2.8.67.0 — D.1 self-service password reset panel (the owner: a
 * 12-year-old must never have to call the office to change a password).
 *
 * Step 1 — the account identity (email, or admission number for students).
 * Step 2 — the 6-digit code from the email + a new private password.
 * The reset applies to every portal account on that email identity.
 *
 * Students whose account still carries the synthetic adm-… identity (no
 * real email yet) are pointed at the class teacher — the ONE fallback
 * that always reaches a child. That path lives in the teacher portal.
 */

const REQUEST_PHRASES: Record<string, string> = {
  sent:
    "If that identity is on our list, a 6-digit code is on its way. The code works for 10 minutes.",
  no_email:
    "This account doesn't have a working email address yet. Please ask your CLASS TEACHER to reset your password — it takes a minute.",
  rate_limited:
    "Too many codes were requested for this identity just now. Please wait a little while and try again.",
  bad_request: "Please type your email (or admission number).",
  server_error: "Something went wrong on our side. Please try again in a moment.",
};

const RESET_PHRASES: Record<string, string> = {
  invalid: "That code didn't match. Check the email and try again.",
  expired:
    "That code has expired or was already used. Send a fresh one from the first step.",
  too_many_attempts:
    "Too many wrong tries. Send a fresh code from the first step and start again.",
  bad_password: "Choose a new password with at least 6 characters.",
  bad_request: "Fill in the code and the new password.",
  server_error: "Something went wrong on our side. Please try again in a moment.",
};

export function PortalForgotPassword({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState<"identity" | "code">("identity");
  const [identity, setIdentity] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/portal/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: identity }),
      });
      const data = (await res.json()) as { ok: boolean; status?: string };
      if (!data.ok) {
        setNote(REQUEST_PHRASES[data.status || ""] || REQUEST_PHRASES.server_error);
        return;
      }
      if (data.status === "no_email") {
        setNote(REQUEST_PHRASES.no_email);
        return;
      }
      if (data.status === "rate_limited") {
        setNote(REQUEST_PHRASES.rate_limited);
        return;
      }
      setStep("code");
      setNote(REQUEST_PHRASES.sent);
    } catch {
      setNote(REQUEST_PHRASES.server_error);
    } finally {
      setBusy(false);
    }
  }

  async function applyReset(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setNote("The two passwords don't match. Type them again.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/portal/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: identity, code, password }),
      });
      const data = (await res.json()) as { ok: boolean; status?: string };
      if (!data.ok) {
        setNote(RESET_PHRASES[data.status || ""] || RESET_PHRASES.server_error);
        return;
      }
      setDone(true);
      setNote(null);
    } catch {
      setNote(RESET_PHRASES.server_error);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="w-full rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-5 py-6 text-center">
        <MailCheck size={26} className="mx-auto mb-3 text-[var(--pt-accent)]" />
        <p className="text-[14.5px] font-semibold text-[var(--pt-heading)]">
          Password updated.
        </p>
        <p className="mt-1 text-[13px] text-[var(--pt-info-text)]">
          Sign in below with your new password.
        </p>
        <button
          type="button"
          onClick={() => onDone?.()}
          className="mt-4 h-11 w-full rounded-xl bg-[var(--pt-accent)] text-[13.5px] font-semibold text-[var(--pt-on-accent)] transition-colors hover:bg-[var(--pt-accent-hover)]"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-3">
        <KeyRound size={16} className="mt-0.5 shrink-0 text-[var(--pt-accent)]" />
        <p className="text-[12.5px] leading-relaxed text-[var(--pt-info-text)]">
          {step === "identity"
            ? "Enter the email on your account — students can type the admission number instead. We'll send a 6-digit code."
            : "Type the 6-digit code we emailed you, then choose a new password."}
        </p>
      </div>

      {step === "identity" ? (
        <form onSubmit={requestCode} className="w-full space-y-3" noValidate>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
              Email or admission number
            </span>
            <input
              type="text"
              name="identity"
              autoComplete="username"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="e.g. 1923  ·  you@example.com"
              className="h-12 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 text-[14.5px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] focus:ring-2 focus:ring-[var(--pt-ring)]"
            />
          </label>

          {note && (
            <div
              role="status"
              className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--pt-info-text)]"
            >
              {note}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] text-[14.5px] font-semibold text-[var(--pt-on-accent)] transition-all duration-300 hover:-translate-y-px hover:bg-[var(--pt-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <MailCheck size={17} />}
            {busy ? "Sending…" : "Send the code"}
          </button>
        </form>
      ) : (
        <form onSubmit={applyReset} className="w-full space-y-3" noValidate>
          {/* v2.8.84.0 — the owner's red spam warning (item 2): the code email
              often lands in Spam, so say it BEFORE the user gives up. */}
          <MailSpamNote className="flex items-start gap-2.5 rounded-xl border border-[var(--pt-danger-text)]/30 bg-[var(--pt-danger-bg)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--pt-danger-text)]" />
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
              6-digit code
            </span>
            <input
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 042917"
              className="h-12 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 text-[18px] tracking-[0.35em] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] placeholder:tracking-normal focus:border-[var(--pt-accent)] focus:ring-2 focus:ring-[var(--pt-ring)]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
              New password
            </span>
            <span className="relative block">
              <input
                type={show ? "text" : "password"}
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="h-12 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 pr-12 text-[14.5px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] focus:ring-2 focus:ring-[var(--pt-ring)]"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-chip)] hover:text-[var(--pt-chip-text)]"
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
              Repeat the new password
            </span>
            <input
              type={show ? "text" : "password"}
              name="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Once more"
              className="h-12 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 text-[14.5px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] focus:ring-2 focus:ring-[var(--pt-ring)]"
            />
          </label>

          {note && (
            <div
              role="status"
              className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--pt-info-text)]"
            >
              {note}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] text-[14.5px] font-semibold text-[var(--pt-on-accent)] transition-all duration-300 hover:-translate-y-px hover:bg-[var(--pt-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
            {busy ? "Saving…" : "Set the new password"}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("identity");
              setNote(null);
            }}
            className="h-10 w-full rounded-xl text-[13px] font-medium text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-chip)] hover:text-[var(--pt-chip-text)]"
          >
            Send a new code
          </button>
        </form>
      )}
    </div>
  );
}
