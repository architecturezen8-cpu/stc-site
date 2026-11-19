"use client";

import Link from "next/link";
import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";

type ErrorKey =
  | "oauth_failed"
  | "oauth_unconfigured"
  | "no_access"
  | string;

const ERROR_MESSAGES: Record<string, string> = {
  no_account: "No LMS admin account exists for this email.",
  bad_password: "Incorrect password.",
  no_password: "This account is Google-only — use the Google button below.",
  inactive: "This account has been deactivated.",
  pending: "This account is awaiting approval.",
  oauth_failed: "Google sign-in failed. Please try again.",
  oauth_unconfigured:
    "Google sign-in is not configured yet — use email & password, or contact the site owner.",
  no_access:
    "This Google account does not hold an LMS admin account. Ask the site owner to create one.",
};

export function LmsAdminLoginForm({
  googleEnabled,
  setupAvailable,
  initialError,
  initialEmail,
  logoSrc,
}: {
  googleEnabled: boolean;
  setupAvailable: boolean;
  initialError?: ErrorKey;
  initialEmail?: string;
  /** v2.8.60.0 — the synced admin logo (registry), empty → built-in cap. */
  logoSrc?: string;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    initialError ? (ERROR_MESSAGES[initialError] ?? "Sign-in failed.") : null,
  );
  const [busy, setBusy] = useState(false);

  const noticeKey = initialError === "no_access" ? initialEmail : null;

  return (
    <div className="w-full max-w-md">
      <div className="la-panel-shadow rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt=""
              className="h-14 w-14 rounded-2xl border border-white/15 bg-white object-contain p-1 shadow-[0_10px_26px_-10px_rgba(0,0,0,0.5)]"
            />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#ffd444] text-black shadow-[0_10px_26px_-10px_rgba(255,212,68,0.7)]">
              <GraduationCap className="h-7 w-7" aria-hidden="true" />
            </span>
          )}
          <h1 className="mt-4 font-display text-xl font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
            LMS Admin Studio
          </h1>
          <p className="mt-1 text-sm text-[var(--la-body)]">
            St. Thomas&apos; College, Matale — learning-management back office
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-4 py-3 text-sm font-medium text-[var(--la-danger-text)]"
          >
            {error}
            {noticeKey ? (
              <span className="mt-1 block text-xs font-normal opacity-80">
                ({decodeURIComponent(noticeKey)})
              </span>
            ) : null}
          </div>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/lms-admin/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, password }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
              };
              if (res.ok && data.ok) {
                window.location.assign("/lms-admin");
                return;
              }
              setError(data.error || "Sign-in failed.");
            } catch {
              setError("Network error — please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label
              htmlFor="lms-admin-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--la-muted)]"
            >
              Email
            </label>
            <input
              id="lms-admin-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="lms.admin@stcmatale.lk"
              className="w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-4 py-2.5 text-sm text-[var(--la-heading)] outline-none transition placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
            />
          </div>

          <div>
            <label
              htmlFor="lms-admin-password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--la-muted)]"
            >
              Password
            </label>
            <input
              id="lms-admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
              className="w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-4 py-2.5 text-sm text-[var(--la-heading)] outline-none transition placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 py-2.5 text-sm font-bold text-black shadow-[0_10px_24px_-12px_rgba(255,212,68,0.6)] transition-all hover:-translate-y-px hover:bg-[#e8c13a] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {googleEnabled ? (
          <>
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--la-border)]" />
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--la-faint)]">
                or
              </span>
              <span className="h-px flex-1 bg-[var(--la-border)]" />
            </div>
            <a
              href="/api/lms-admin/auth/google"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] px-4 py-2.5 text-sm font-semibold text-[var(--la-heading)] transition-colors hover:bg-[var(--la-panel-soft)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
                />
              </svg>
              Sign in with Google
            </a>
          </>
        ) : (
          <p className="mt-5 rounded-2xl bg-[var(--la-panel-soft)] px-4 py-3 text-center text-xs text-[var(--la-body)]">
            Google sign-in activates once the site owner adds the Supabase API key.
          </p>
        )}

        {setupAvailable ? (
          <p className="mt-5 text-center text-sm text-[var(--la-body)]">
            First time here?{" "}
            <a href="/lms-admin/setup" className="lmsa-gold-link font-bold hover:underline">
              Create the first LMS admin →
            </a>
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-center text-xs text-[var(--la-muted)]">
        Student / teacher / parent portals live at{" "}
        <Link href="/login" className="font-semibold underline">
          /login
        </Link>
      </p>
    </div>
  );
}
