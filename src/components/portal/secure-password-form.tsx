"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";

/**
 * v2.8.67.0 — the "choose your own password" screen. Two shapes:
 * - FORCED (teacher-issued temp password): only the new password is asked.
 * - VOLUNTARY: the current password must be verified first.
 * On success the browser hard-navigates to the portal home (fresh cookie).
 */
export function SecurePasswordForm({
  redirect,
  forced,
  role,
}: {
  redirect: string;
  forced: boolean;
  role: string;
}) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setNote("The two passwords don't match. Type them again.");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/portal/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-portal-role": role },
        body: JSON.stringify({
          ...(forced ? {} : { currentPassword: current }),
          newPassword: password,
        }),
      });
      const data = (await res.json()) as { ok: boolean; status?: string };
      if (!data.ok) {
        if (data.status === "bad_current") {
          setNote("That current password didn't match. Try again.");
        } else if (data.status === "bad_password") {
          setNote("Choose a new password with at least 6 characters.");
        } else if (data.status === "unauthorized") {
          window.location.assign("/login");
          return;
        } else {
          setNote("Something went wrong on our side. Please try again in a moment.");
        }
        return;
      }
      setDone(true);
      setTimeout(() => window.location.assign(redirect), 900);
    } catch {
      setNote("Something went wrong on our side. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-6 text-center">
        <ShieldCheck size={26} className="mx-auto mb-3 text-amber-300" />
        <p className="text-[14.5px] font-semibold">Password saved.</p>
        <p className="mt-1 text-[13px] text-zinc-400">Taking you to your portal…</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3" noValidate>
      {!forced && (
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">
            Current password
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="The password you just used"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-[14.5px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">
          New password
        </span>
        <span className="relative block">
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters — something only you know"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 pr-12 text-[14.5px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-400">
          Repeat the new password
        </span>
        <input
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Once more"
          className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-[14.5px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/20"
        />
      </label>

      {note && (
        <div
          role="status"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[13px] leading-relaxed text-zinc-300"
        >
          {note}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-[14.5px] font-semibold text-zinc-950 transition-all duration-300 hover:-translate-y-px hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
        {busy ? "Saving…" : "Save the new password"}
      </button>
    </form>
  );
}
