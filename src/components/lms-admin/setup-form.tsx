"use client";

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";

export function LmsAdminSetupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="w-full max-w-md">
      <div className="la-panel-shadow rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#ffd444] text-black shadow-[0_10px_26px_-10px_rgba(255,212,68,0.7)]">
            <GraduationCap className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="lmsa-gold-link mt-4 text-xs font-bold uppercase tracking-[0.2em]">
            One-time setup
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
            Create the first LMS admin.
          </h1>
          <p className="mt-1 text-sm text-[var(--la-body)]">
            This screen closes permanently after the first account is created. Use a strong
            private password.
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-4 py-3 text-sm font-medium text-[var(--la-danger-text)]"
          >
            {error}
          </div>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/lms-admin/auth/setup", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, email, password, confirmPassword }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
              };
              if (res.ok && data.ok) {
                window.location.assign("/lms-admin");
                return;
              }
              setError(data.error || "Setup failed.");
            } catch {
              setError("Network error — please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label
              htmlFor="lms-setup-name"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--la-muted)]"
            >
              Your name
            </label>
            <input
              id="lms-setup-name"
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="LMS coordinator"
              className="w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-4 py-2.5 text-sm text-[var(--la-heading)] outline-none transition placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
            />
          </div>

          <div>
            <label
              htmlFor="lms-setup-email"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--la-muted)]"
            >
              Email address
            </label>
            <input
              id="lms-setup-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="lms.admin@stcmatale.lk"
              className="w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-4 py-2.5 text-sm text-[var(--la-heading)] outline-none transition placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
            />
          </div>

          <div>
            <label
              htmlFor="lms-setup-password"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--la-muted)]"
            >
              Password
            </label>
            <input
              id="lms-setup-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
              className="w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-4 py-2.5 text-sm text-[var(--la-heading)] outline-none transition placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
            />
          </div>

          <div>
            <label
              htmlFor="lms-setup-confirm"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--la-muted)]"
            >
              Confirm password
            </label>
            <input
              id="lms-setup-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat the password"
              className="w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-4 py-2.5 text-sm text-[var(--la-heading)] outline-none transition placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] focus:ring-2 focus:ring-[rgb(255_212_68/0.25)]"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 py-2.5 text-sm font-bold text-black shadow-[0_10px_24px_-12px_rgba(255,212,68,0.6)] transition-all hover:-translate-y-px hover:bg-[#e8c13a] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Creating…" : "Create the LMS admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
