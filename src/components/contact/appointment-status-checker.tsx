"use client";

import { useState } from "react";
import { CalendarCheck2, Clock, Loader2, Search, Users } from "lucide-react";
import { MailSpamNote } from "@/components/mail-spam-note";

/**
 * v2.8.83.0 — the client half of /appointment-status: reference + email →
 * POST /api/appointments/lookup → a calm status card. Styling mirrors the
 * contact page's card language (bg-surface / border-fg/10 / gold accents).
 */

type AppointmentResult = {
  reference: string;
  status: string;
  name: string;
  department: string;
  visitDate: string;
  visitTime: string;
  visitors: string;
};

const STATUS_STYLES: Record<string, { chip: string; label: string; note: string }> = {
  requested: {
    chip: "border-amber-400/40 bg-amber-400/10 text-amber-300",
    label: "Awaiting confirmation",
    note: "The office has your request and will confirm shortly — by phone or the email you booked with.",
  },
  confirmed: {
    chip: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    label: "Confirmed",
    note: "The office has confirmed your visit. Please bring a valid ID (NIC or Passport) — every visitor receives a temporary badge at the security gate.",
  },
  completed: {
    chip: "border-fg/25 bg-fg/5 text-fg/70",
    label: "Completed",
    note: "This visit is marked completed. Thank you for visiting St. Thomas' College Matale.",
  },
  cancelled: {
    chip: "border-rose-400/40 bg-rose-400/10 text-rose-300",
    label: "Cancelled",
    note: "This appointment was cancelled by the office. If that is a surprise, please call the office — or book a new visit from the Contact page.",
  },
};

const inputCls =
  "w-full rounded-lg border border-fg/15 bg-surface px-4 py-3 text-[14px] text-fg outline-none transition-colors placeholder:text-fg/30 focus:border-gold";

export function AppointmentStatusChecker() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppointmentResult | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setNotFound(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/appointments/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Lookup failed. Please try again.");
      if (data.found) setResult(data.appointment as AppointmentResult);
      else setNotFound(String(data.message));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const status = result ? STATUS_STYLES[result.status] ?? STATUS_STYLES.requested : null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-fg/10 bg-card p-6 sm:p-8"
        aria-label="Check your appointment status"
      >
        <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">
          Check your appointment
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg/55">
          Enter the reference code from your booking confirmation and the email
          you booked with.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="apt-reference" className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.2em] text-fg/50">
              Reference code
            </label>
            <input
              id="apt-reference"
              required
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={inputCls}
              placeholder="APT-0001"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="apt-email" className="mb-1.5 block font-sans text-[10px] uppercase tracking-[0.2em] text-fg/50">
              Email used for the booking
            </label>
            <input
              id="apt-email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-fg px-7 py-3.5 text-[13px] font-medium text-surface transition-colors duration-300 hover:bg-gold hover:text-ink disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? "Checking…" : "Check status"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-[13px] text-rose-300">
          {error}
        </p>
      ) : null}

      {notFound ? (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-300">
          {notFound}
        </p>
      ) : null}

      {result && status ? (
        <div className="animate-fade-up mt-5 rounded-2xl border border-fg/10 bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full bg-gold px-4 py-1.5 font-sans text-[10px] uppercase tracking-[0.25em] text-ink">
              Reference {result.reference}
            </span>
            <span
              className={`rounded-full border px-4 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] ${status.chip}`}
            >
              {status.label}
            </span>
          </div>

          <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.02em]">
            {result.department}
          </h3>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-fg/10 bg-surface-2 px-4 py-3">
              <dt className="font-sans text-[9.5px] uppercase tracking-[0.2em] text-fg/45">Date</dt>
              <dd className="mt-1 text-[13.5px] font-semibold text-fg">{result.visitDate}</dd>
            </div>
            <div className="rounded-xl border border-fg/10 bg-surface-2 px-4 py-3">
              <dt className="flex items-center gap-1.5 font-sans text-[9.5px] uppercase tracking-[0.2em] text-fg/45">
                <Clock size={11} className="text-gold" /> Time
              </dt>
              <dd className="mt-1 text-[13.5px] font-semibold text-fg">{result.visitTime}</dd>
            </div>
            <div className="rounded-xl border border-fg/10 bg-surface-2 px-4 py-3">
              <dt className="flex items-center gap-1.5 font-sans text-[9.5px] uppercase tracking-[0.2em] text-fg/45">
                <Users size={11} className="text-gold" /> Visitors
              </dt>
              <dd className="mt-1 text-[13.5px] font-semibold text-fg">{result.visitors}</dd>
            </div>
          </dl>

          <p className="mt-5 flex items-start gap-2.5 text-[13px] leading-relaxed text-fg/60">
            <CalendarCheck2 size={15} className="mt-0.5 shrink-0 text-gold" />
            {status.note}
          </p>

          {/* v2.8.84.0 — the owner's red spam warning (item 2): the lookup page
              exists precisely because emails get missed — name the cause. */}
          <MailSpamNote className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-left text-[12.5px] leading-relaxed text-rose-300" />
        </div>
      ) : null}
    </div>
  );
}
