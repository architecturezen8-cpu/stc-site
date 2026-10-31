"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const input =
  "h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 text-[14px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ffd444]";

export function AccessRequestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to send your request.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send your request.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-5 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-emerald-300" size={26} />
        <p className="text-[13.5px] font-semibold text-emerald-200">Request received.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-200/70">
          A Super Admin will review it soon. If approved, you will receive your temporary
          password privately.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/45">Your name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
          placeholder="Full name"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/45">Email address</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          placeholder="you@example.lk"
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-white/45">
          Why do you need access? <span className="normal-case text-white/25">(optional)</span>
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={600}
          rows={3}
          className="w-full resize-none rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ffd444]"
          placeholder="e.g. I manage news updates for the college website."
        />
      </label>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-200">
          {error}
        </div>
      )}

      <button
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[#ffd444] text-[13px] font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-60"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
        {loading ? "Sending…" : "Send access request"}
      </button>
    </form>
  );
}
