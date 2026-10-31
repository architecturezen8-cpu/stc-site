"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import {
  PortalGoogleButton,
} from "@/components/portal/portal-login-cards";
import {
  PORTAL_META,
  type PortalRoleKey,
} from "@/components/portal/portal-meta";
import { PortalForgotPassword } from "@/components/portal/portal-forgot-password";

/** Gentle, non-technical outcomes — the tone stays calm on purpose. */
const PHRASES: Record<string, string> = {
  no_account:
    "We couldn't find that identity on this portal's list. You can register below — the school register will verify your details.",
  no_password:
    "This account signs in with Google. Try the Continue with Google button above.",
  bad_password: "That password didn't match. Please try again.",
  inactive:
    "This account is paused right now. Please contact the school office.",
  pending:
    "This account is waiting for the school office to approve the registration. Please try again once the office confirms it.",
  bad_request: "Enter both your identity and password.",
  /* v2.8.78.0 — the new in-route attempt limiter (8 fails / 15 min). */
  rate_limited:
    "Too many sign-in attempts from this connection. Please wait a few minutes and try again.",
  server_error: "Something went wrong on our side. Please try again in a moment.",
};

export function PortalPasswordForm({
  role,
  defaultEmail = "",
}: {
  role: PortalRoleKey;
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /* Set when the credentials open a DIFFERENT portal than the page the
     visitor is on — shows the "no access here" notice + one-tap switch. */
  const [swapRole, setSwapRole] = useState<PortalRoleKey | null>(null);
  /* v2.8.67.0 — the D.1 self-service reset panel replaces the form. */
  const [forgot, setForgot] = useState(false);

  async function signIn(roleToUse: PortalRoleKey) {
    if (busy) return;
    setBusy(true);
    setNote(null);

    try {
      const res = await fetch("/api/portal/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: roleToUse, email, password }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        redirect?: string;
        status?: string;
        role?: string;
        mustChangePassword?: boolean;
      };

      if (data.ok && data.redirect) {
        /* v2.8.67.0 — a teacher-issued temp password bounces to the
           "choose your own" screen before entering the portal. */
        const target = data.mustChangePassword ? "/account/secure" : data.redirect;
        /* HARD navigation — the fresh session cookie must ride the very
           next request (router.replace raced it and bounced users back). */
        window.location.assign(target);
        return;
      }
      if (data.status === "wrong_role" && data.role) {
        const their = data.role as PortalRoleKey;
        setSwapRole(their);
        setNote(
          `This email isn't registered for the ${PORTAL_META[role].title} portal. It does have access to the ${PORTAL_META[their].title} portal — continue below.`,
        );
        return;
      }
      setSwapRole(null);
      setNote(PHRASES[data.status || ""] || PHRASES.server_error);
    } catch {
      setNote(PHRASES.server_error);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSwapRole(null);
    await signIn(role);
  }

  return (
    <div className="w-full">
      {forgot ? (
        <>
          <PortalForgotPassword onDone={() => setForgot(false)} />
          <button
            type="button"
            onClick={() => {
              setForgot(false);
              setNote(null);
            }}
            className="mt-3 h-10 w-full rounded-xl text-[13px] font-medium text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-chip)] hover:text-[var(--pt-chip-text)]"
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--pt-faint)]">
            <span className="h-px flex-1 bg-[var(--pt-border)]" />
            or email &amp; password
            <span className="h-px flex-1 bg-[var(--pt-border)]" />
          </div>

          <form onSubmit={onSubmit} className="w-full space-y-3" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
            {role === "student" ? "Admission number or email" : "Email"}
          </span>
          <input
            type={role === "student" ? "text" : "email"}
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={role === "student" ? "e.g. 1923" : "you@example.com"}
            className="h-12 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 text-[14.5px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] focus:ring-2 focus:ring-[var(--pt-ring)]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
            Password
          </span>
          <span className="relative block">
            <input
              type={show ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
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

        {note && (
          <div
            role="status"
            className="space-y-2.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--pt-info-text)]"
          >
            <p>{note}</p>
            {swapRole && (
              <button
                type="button"
                onClick={() => signIn(swapRole)}
                disabled={busy}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--pt-accent)] text-[13.5px] font-semibold text-[var(--pt-on-accent)] transition-colors hover:bg-[var(--pt-accent-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : null}
                Continue to the {PORTAL_META[swapRole].title} portal
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] text-[14.5px] font-semibold text-[var(--pt-on-accent)] transition-all duration-300 hover:-translate-y-px hover:bg-[var(--pt-accent-hover)] hover:shadow-[0_10px_24px_-12px_rgb(255_212_68/0.5)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
        >
          {busy ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <LogIn size={17} />
          )}
          {busy ? "Signing in…" : "Sign in"}
        </button>

          <button
            type="button"
            onClick={() => {
              setForgot(true);
              setNote(null);
            }}
            className="mt-1 h-10 w-full rounded-xl text-[13px] font-medium text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-chip)] hover:text-[var(--pt-chip-text)]"
          >
            Forgot your password?
          </button>
        </form>
        </>
      )}
    </div>
  );
}

export { PortalGoogleButton };
