"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const INQUIRY_TYPES = [
  "General Inquiries",
  "Academics & Scholarships",
  "Sports & Co-Curricular",
  "Old Thomians' Association",
  "Media & Press",
];


const GRADES = [
  "Grade 6 (Primary to Middle)",
  "Grade 7 – 9 (Middle School)",
  "Grade 10 – 11 (G.C.E. O/L)",
  "Grade 12 – 13 (G.C.E. A/L)",
];

export function ContactForm({ initialType = "" }: { initialType?: string }) {
  const [inquiryType, setInquiryType] = useState(() => {
    if (!initialType) return "General Inquiries";
    const found = INQUIRY_TYPES.find((t) =>
      t.toLowerCase().includes(initialType.toLowerCase()),
    );
    return found || "General Inquiries";
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [grade, setGrade] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    reference: string;
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          inquiryType,
          grade: inquiryType.startsWith("Admissions") ? grade : undefined,
          message,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit inquiry.");
      }

      setSuccess({
        reference: data.reference,
        message: data.message,
      });

      setName("");
      setEmail("");
      setPhone("");
      setGrade("");
      setMessage("");
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
    <div className="rounded-2xl border border-fg/10 bg-surface p-8 shadow-soft md:p-12">
      {success ? (
        <div className="animate-fade-up py-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gold/20 text-gold">
            <CheckCircle2 size={36} />
          </div>
          <span className="mt-6 inline-block rounded-full bg-gold px-4 py-1.5 font-sans text-[10px] uppercase tracking-[0.25em] text-ink">
            Reference {success.reference}
          </span>
          <h3 className="mt-4 font-display text-3xl font-semibold tracking-[-0.02em] text-fg">
            Inquiry Received
          </h3>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-fg/60">
            {success.message} A confirmation email has been logged to our
            admissions and administrative desk.
          </p>

          <button
            onClick={() => setSuccess(null)}
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-fg/20 px-6 py-3 text-sm font-medium text-fg transition-colors hover:border-fg hover:bg-fg hover:text-surface"
          >
            Submit Another Inquiry
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block font-sans text-[10px] uppercase tracking-[0.3em] text-fg/60">
              Inquiry Type *
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {INQUIRY_TYPES.map((type) => {
                const isSelected = type === inquiryType;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setInquiryType(type)}
                    className={`rounded-full border px-4 py-2 text-left font-sans text-[10px] uppercase tracking-[0.2em] transition-colors ${
                      isSelected
                        ? "border-transparent bg-fg text-surface"
                        : "border-fg/15 text-fg/60 hover:border-fg hover:text-fg"
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="name"
                className="block font-sans text-[10px] uppercase tracking-[0.3em] text-fg/60"
              >
                Full Name *
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mr. Sahan Jayawardena"
                className="mt-2 w-full rounded-xl border border-fg/15 bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg/30 transition-colors focus:border-gold focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block font-sans text-[10px] uppercase tracking-[0.3em] text-fg/60"
              >
                Email Address *
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sahan@example.com"
                className="mt-2 w-full rounded-xl border border-fg/15 bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg/30 transition-colors focus:border-gold focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label
                htmlFor="phone"
                className="block font-sans text-[10px] uppercase tracking-[0.3em] text-fg/60"
              >
                Phone Number *
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+94 77 123 4567"
                className="mt-2 w-full rounded-xl border border-fg/15 bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg/30 transition-colors focus:border-gold focus:outline-none"
              />
            </div>

            {inquiryType.startsWith("Admissions") && (
              <div>
                <label
                  htmlFor="grade"
                  className="block font-sans text-[10px] uppercase tracking-[0.3em] text-fg/60"
                >
                  Grade Applying For
                </label>
                <select
                  id="grade"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-fg/15 bg-surface px-4 py-3 text-sm text-fg transition-colors focus:border-gold focus:outline-none"
                >
                  <option value="">Select Target Grade</option>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="message"
              className="block font-sans text-[10px] uppercase tracking-[0.3em] text-fg/60"
            >
              Message / Details *
            </label>
            <textarea
              id="message"
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please provide details regarding your inquiry..."
              className="mt-2 w-full rounded-xl border border-fg/15 bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg/30 transition-colors focus:border-gold focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="font-sans text-[9px] uppercase tracking-[0.2em] text-fg/40">
              All inquiries logged to College Registry
            </p>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2.5 rounded-full bg-gold px-8 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-fg hover:text-surface disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  Submit Inquiry
                  <Send size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
