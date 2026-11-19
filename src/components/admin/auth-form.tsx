"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

const input =
  "h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-[14px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ffd444]";

export function AdminAuthForm({ mode }: { mode: "login" | "setup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupAvailable, setSetupAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/auth/setup")
      .then((r) => r.json())
      .then((data) => {
        setSetupAvailable(Boolean(data.available));
        if (mode === "login" && data.available) router.replace("/admin/setup");
        if (mode === "setup" && !data.available) router.replace("/admin/login");
      })
      .catch(() => setSetupAvailable(false));
  }, [mode, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        mode === "setup" ? "/api/admin/auth/setup" : "/api/admin/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.setup) router.replace("/admin/setup");
        throw new Error(data.error || "Unable to continue.");
      }
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setLoading(false);
    }
  };

  if (setupAvailable === null) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {mode === "setup" && (
        <label className="block">
          <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/45">
            Your name
          </span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
            placeholder="Administrator name"
          />
        </label>
      )}
      <label className="block">
        <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/45">
          Email address
        </span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          placeholder="admin@stcmatale.lk"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/45">
          Password
        </span>
        <span className="relative block">
          <input
            required
            /* v2.8.43.0 — login only needs to ACCEPT the stored password
               (creation rules are enforced at setup: 10+). The old blanket
               minLength=10 silently blocked shorter stored passwords — the
               native validator refused to submit with no visible reason. */
            minLength={mode === "setup" ? 10 : 6}
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${input} pr-12`}
            placeholder={mode === "setup" ? "At least 10 characters" : "Your password"}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-white/45 hover:text-white"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </label>
      {mode === "setup" && (
        <label className="block">
          <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/45">
            Confirm password
          </span>
          <input
            required
            minLength={mode === "setup" ? 10 : 6}
            type={show ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={input}
            placeholder="Type it again"
          />
        </label>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-200">
          {error}
        </div>
      )}

      <button
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#ffd444] text-[13px] font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-60"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : mode === "setup" ? (
          <ShieldCheck size={16} />
        ) : (
          <LockKeyhole size={16} />
        )}
        {loading
          ? "Please wait…"
          : mode === "setup"
            ? "Create secure admin"
            : "Sign in to Admin"}
      </button>
    </form>
  );
}
