"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Phone,
  Users,
  X,
} from "lucide-react";

export type Department = {
  icon: "graduation" | "building" | "trophy" | "users";
  name: string;
  phone: string;
  email: string;
  hours: string;
  /** Extra detail shown inside the popup. */
  detail: string;
  slots: string[];
};

const TIME_SLOTS = [
  "8.00 a.m.",
  "9.00 a.m.",
  "10.00 a.m.",
  "11.00 a.m.",
  "1.00 p.m.",
  "2.00 p.m.",
  "3.00 p.m.",
];

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function DepartmentCards({ departments }: { departments: Department[] }) {
  const [active, setActive] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [visitDate, setVisitDate] = useState(tomorrow());
  const [visitTime, setVisitTime] = useState("");
  const [visitors, setVisitors] = useState("1");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; message: string } | null>(
    null,
  );

  const closePopup = () => {
    setActive(null);
    setError(null);
    setDone(null);
    setVisitTime("");
    setPurpose("");
    setNotes("");
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
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                  <span className="mt-5 inline-block rounded-full bg-gold px-4 py-1.5 font-sans text-[10px] uppercase tracking-[0.25em] text-ink">
                    Reference {done.reference}
                  </span>
                  <h4 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">
                    Thank you!
                  </h4>
                  <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-fg/60">
                    {done.message}
                  </p>
                  <button
                    onClick={closePopup}
                    className="mt-7 rounded-full bg-fg px-7 py-3 text-[13px] font-medium text-surface transition-colors duration-300 hover:bg-gold hover:text-ink"
                  >
                    Done
                  </button>
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
                        Weekdays only · max 4 visitors
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
                    <Field label="Preferred date * (weekdays only)">
                      <input
                        required
                        type="date"
                        min={tomorrow()}
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
                        {["1", "2", "3", "4"].map((v) => (
                          <option key={v} value={v}>
                            {v} {v === "1" ? "visitor" : "visitors"}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Preferred time *">
                    <div className="flex flex-wrap gap-2">
                      {(active.slots.length ? active.slots : TIME_SLOTS).map(
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
