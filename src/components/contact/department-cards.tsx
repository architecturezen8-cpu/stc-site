"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  Mail,
  Phone,
  Users,
  X,
} from "lucide-react";
import { MailSpamNote } from "@/components/mail-spam-note";

export type Department = {
  /** v2.8.92.0 — the card's stable id (matches the settings key the
      office edits from Admin → Forms → Appointments → Form settings). */
  id: string;
  icon: "graduation" | "building" | "trophy" | "users";
  name: string;
  phone: string;
  email: string;
  hours: string;
  /** Extra detail shown inside the popup. */
  detail: string;
  slots: string[];
};

/* v2.8.91.0 — the office's own appointment rules, published from Admin →
   Forms → Appointments → Form settings (sane fallbacks keep the form
   alive even if the props are ever missing). */
export type AptRules = {
  slots: string[];
  maxVisitors: number;
  allowWeekends: boolean;
  minDaysAhead: number;
};

const FALLBACK_RULES: AptRules = {
  slots: [
    "8.00 a.m.",
    "9.00 a.m.",
    "10.00 a.m.",
    "11.00 a.m.",
    "1.00 p.m.",
    "2.00 p.m.",
    "3.00 p.m.",
  ],
  maxVisitors: 4,
  allowWeekends: false,
  minDaysAhead: 1,
};

function daysAheadDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, days));
  return d.toISOString().slice(0, 10);
}

export function DepartmentCards({
  departments,
  fallbackSlots,
  maxVisitors,
  allowWeekends,
  minDaysAhead,
}: {
  departments: Department[];
  fallbackSlots?: string[];
  maxVisitors?: number;
  allowWeekends?: boolean;
  minDaysAhead?: number;
}) {
  const rules: AptRules = {
    slots: fallbackSlots?.length ? fallbackSlots : FALLBACK_RULES.slots,
    maxVisitors:
      typeof maxVisitors === "number" && maxVisitors >= 1 && maxVisitors <= 12
        ? maxVisitors
        : FALLBACK_RULES.maxVisitors,
    allowWeekends: allowWeekends === true,
    minDaysAhead:
      typeof minDaysAhead === "number" && minDaysAhead >= 1 && minDaysAhead <= 30
        ? minDaysAhead
        : FALLBACK_RULES.minDaysAhead,
  };
  const minDate = daysAheadDate(rules.minDaysAhead);
  const visitorOptions = Array.from({ length: rules.maxVisitors }, (_, i) => String(i + 1));
  const [active, setActive] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [visitDate, setVisitDate] = useState(minDate);
  const [visitTime, setVisitTime] = useState("");
  const [visitors, setVisitors] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; message: string } | null>(
    null,
  );
  /* v2.8.84.0 — the reference chip now has a one-tap COPY (owner: "eka
     copy karaganna option ekak danna wei ne"). */
  const [copied, setCopied] = useState(false);

  const closePopup = () => {
    setActive(null);
    setError(null);
    setDone(null);
    setVisitTime("");
    setPurpose("");
    setNotes("");
    setCopied(false);
  };

  const copyReference = async () => {
    if (!done) return;
    try {
      await navigator.clipboard.writeText(done.reference);
    } catch {
      /* Clipboard blocked (older browser) — fall back to a select-all. */
      const range = document.createRange();
      const el = document.getElementById("apt-reference-chip");
      if (el) {
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  useEffect(() => {
    document.body.style.overflow = active ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          department: active.name,
          visitDate,
          visitTime,
          visitors,
          purpose,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to book appointment.");
      setDone({ reference: data.reference, message: data.message });
      setName("");
      setEmail("");
      setPhone("");
      setVisitTime("");
      setPurpose("");
      setNotes("");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* v2.8.90.0 — breathing room below the "Already booked?" line. */}
      <div className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 md:mt-12">
        {departments.map((dept, i) => {
          return (
            <button
              key={dept.name}
              onClick={() => setActive(dept)}
              className="g-tile group flex h-full min-w-0 flex-col justify-between rounded-xl border border-fg/10 bg-surface p-7 text-left transition-all duration-300 hover:-translate-y-1 hover:border-gold hover:shadow-soft"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="min-w-0">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-fg text-surface transition-colors duration-300 group-hover:bg-gold group-hover:text-ink">
                  <CalendarDays size={18} />
                </span>
                <h3 className="mt-5 break-words font-display text-xl font-semibold tracking-[-0.01em]">
                  {dept.name}
                </h3>
                <div className="mt-4 space-y-2 text-sm text-fg/60">
                  <p className="flex items-center gap-2">
                    <Phone size={13} className="shrink-0 text-gold" />
                    {dept.phone}
                  </p>
                  <p className="flex items-start gap-2 break-words">
                    <Mail size={13} className="mt-1 shrink-0 text-gold" />
                    {dept.email}
                  </p>
                </div>
              </div>
              <div className="mt-6 border-t border-fg/10 pt-4">
                <p className="flex items-start gap-2 font-sans text-[9px] uppercase leading-relaxed tracking-[0.2em] text-fg/40">
                  <Clock size={11} className="mt-0.5 shrink-0 text-gold" />
                  {dept.hours}
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 font-sans text-[9px] uppercase tracking-[0.2em] text-gold">
                  Book an appointment
                  <span className="h-px w-5 bg-gold transition-all duration-300 group-hover:w-8" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ——— Popup ——— */}
      {active && (
        <div
          onClick={closePopup}
          className="g-fade fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-ink/90 p-3 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="g-panel relative my-auto w-full max-w-2xl overflow-hidden rounded-xl bg-surface text-fg shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-fg/10 bg-surface-2 p-5 sm:p-6">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-sans text-[9px] uppercase tracking-[0.28em] text-gold">
                  <CalendarDays size={12} />
                  Department Appointment
                </p>
                <h3 className="mt-2 break-words font-display text-xl font-semibold tracking-[-0.01em] sm:text-2xl">
                  {active.name}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-fg/60">
                  {active.detail}
                </p>
              </div>
              <button
                onClick={closePopup}
                aria-label="Close"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-fg/15 text-fg/60 transition-all duration-300 hover:rotate-90 hover:bg-fg hover:text-surface"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] overflow-y-auto p-5 sm:p-7">
              {done ? (
                <div className="animate-fade-up py-6 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gold/20 text-gold">
                    <CheckCircle2 size={34} />
                  </div>
                  {/* v2.8.84.0 — copyable reference (owner item 1). */}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <span
                      id="apt-reference-chip"
                      className="inline-block rounded-full bg-gold px-4 py-1.5 font-sans text-[10px] uppercase tracking-[0.25em] text-ink"
                    >
                      Reference {done.reference}
                    </span>
                    <button
                      type="button"
                      onClick={copyReference}
                      aria-label={`Copy reference ${done.reference}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] transition-all duration-300 active:scale-95 ${
                        copied
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600"
                          : "border-fg/20 text-fg/70 hover:border-gold hover:text-fg"
                      }`}
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <h4 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">
                    Thank you!
                  </h4>
                  <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-fg/60">
                    {done.message}
                  </p>
                  {/* v2.8.84.0 — the owner's red spam warning (item 2). */}
                  <MailSpamNote className="mx-auto mt-4 flex max-w-md items-start gap-2.5 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-left text-[12.5px] leading-relaxed text-red-600" />
                  {/* v2.8.83.0 — track the booking without phoning the office. */}
                  <a
                    href="/appointment-status"
                    className="mt-5 inline-flex items-center gap-1.5 font-sans text-[11px] uppercase tracking-[0.2em] text-gold transition-colors hover:text-fg"
                  >
                    Track this appointment
                    <span className="h-px w-5 bg-gold transition-all duration-300" />
                  </a>
                  <div>
                    <button
                      onClick={closePopup}
                      className="mt-6 rounded-full bg-fg px-7 py-3 text-[13px] font-medium text-surface transition-colors duration-300 hover:bg-gold hover:text-ink"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-5">
                  {/* Office info strip */}
                  <div className="grid gap-3 rounded-xl border border-fg/10 bg-surface-2 p-4 sm:grid-cols-3">
                    <p className="flex items-start gap-2 text-[12px] text-fg/60">
                      <Clock size={13} className="mt-0.5 shrink-0 text-gold" />
                      <span className="break-words">{active.hours}</span>
                    </p>
                    <p className="flex items-start gap-2 text-[12px] text-fg/60">
                      <Phone size={13} className="mt-0.5 shrink-0 text-gold" />
                      <span className="break-words">{active.phone}</span>
                    </p>
                    <p className="flex items-start gap-2 text-[12px] text-fg/60">
                      <Users size={13} className="mt-0.5 shrink-0 text-gold" />
                      <span className="break-words">
                        {rules.allowWeekends ? "Mon – Sat" : "Weekdays only"} · max{" "}
                        {rules.maxVisitors} visitor{rules.maxVisitors === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Your name *">
                      <input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputCls}
                        placeholder="A. B. Perera"
                      />
                    </Field>
                    <Field label="Phone *">
                      <input
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={inputCls}
                        placeholder="+94 77 123 4567"
                      />
                    </Field>
                    <Field label="Email *" className="sm:col-span-2">
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputCls}
                        placeholder="you@example.com"
                      />
                    </Field>
                    <Field
                      label={`Preferred date * (${rules.allowWeekends ? "any day" : "weekdays only"})`}
                    >
                      <input
                        required
                        type="date"
                        min={minDate}
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Number of visitors">
                      <select
                        value={visitors}
                        onChange={(e) => setVisitors(e.target.value)}
                        className={inputCls}
                      >
                        {visitorOptions.map((v) => (
                          <option key={v} value={v}>
                            {v} {v === "1" ? "visitor" : "visitors"}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Preferred time *">
                    <div className="flex flex-wrap gap-2">
                      {(active.slots.length ? active.slots : rules.slots).map(
                        (t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setVisitTime(t)}
                            className={`rounded-full border px-4 py-2 font-sans text-[11px] font-medium tracking-[0.04em] transition-all duration-300 active:scale-95 ${
                              visitTime === t
                                ? "border-transparent bg-fg text-surface"
                                : "border-fg/15 text-fg/60 hover:border-fg hover:text-fg"
                            }`}
                          >
                            {t}
                          </button>
                        ),
                      )}
                    </div>
                  </Field>

                  <Field label="Purpose of visit *">
                    <input
                      required
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Admission inquiry for 2027 Grade 6 intake"
                    />
                  </Field>

                  <Field label="Notes (optional)">
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={`${inputCls} resize-none`}
                      placeholder="Anything the office should know before your visit…"
                    />
                  </Field>

                  {error && (
                    <div className="g-fade flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3.5">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                        !
                      </span>
                      <p className="text-[13px] leading-relaxed text-red-500">
                        {error}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-3 border-t border-fg/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11.5px] leading-relaxed text-fg/45">
                      Bring a valid ID for the visitor badge at the gate.
                    </p>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex shrink-0 items-center justify-center gap-2.5 rounded-full bg-gold px-7 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-fg hover:text-surface disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Booking…
                        </>
                      ) : (
                        <>
                          Request Appointment
                          <CalendarDays size={15} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-fg/15 bg-surface px-4 text-[14px] text-fg transition-colors duration-300 placeholder:text-fg/35 hover:border-fg/40 focus:border-gold focus:outline-none";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-2 block font-sans text-[10px] uppercase tracking-[0.2em] text-fg/50">
        {label}
      </span>
      {children}
    </label>
  );
}
