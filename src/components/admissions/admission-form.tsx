"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

type Programme = "grade-6" | "advanced-level";

const STREAMS = ["Biological Science", "Physical Science", "Commerce", "Arts"];
const MEDIUMS = ["Sinhala", "Tamil", "English"];
const HOUSES = ["Austin", "Bede", "Clement", "Pius", "No preference"];

/** Keep labels short — the column is varchar(20). */
const GRADE_OPTIONS = [
  "Grade 5",
  "Grade 4",
  "Grade 3",
  "Other",
];

const RELATIONSHIPS = ["Father", "Mother", "Legal Guardian", "Other"];

const inputCls =
  "h-11 w-full rounded-xl border border-fg/15 bg-surface px-4 text-[14px] text-fg transition-colors duration-300 placeholder:text-fg/35 hover:border-fg/40 focus:border-gold focus:outline-none";

export function AdmissionForm({ initialProgramme = "grade-6" }: { initialProgramme?: Programme }) {
  const [programme, setProgramme] = useState<Programme>(initialProgramme);

  const [studentName, setStudentName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("Male");
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState("Father");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [currentSchool, setCurrentSchool] = useState("");
  const [currentGrade, setCurrentGrade] = useState("");
  const [stream, setStream] = useState("");
  const [olYear, setOlYear] = useState("");
  const [olIndex, setOlIndex] = useState("");
  const [olResults, setOlResults] = useState("");
  const [medium, setMedium] = useState("Sinhala");
  const [siblingName, setSiblingName] = useState("");
  const [fatherOldThomian, setFatherOldThomian] = useState("No");
  const [fatherYears, setFatherYears] = useState("");
  const [housePreference, setHousePreference] = useState("No preference");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    reference: string;
    message: string;
    programme: string;
  } | null>(null);

  const reset = () => {
    setStudentName("");
    setDob("");
    setGuardianName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCurrentSchool("");
    setCurrentGrade("");
    setStream("");
    setOlYear("");
    setOlIndex("");
    setOlResults("");
    setSiblingName("");
    setFatherYears("");
    setMessage("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programme,
          studentName,
          dob,
          gender,
          guardianName,
          relationship,
          phone,
          email,
          address,
          currentSchool,
          currentGrade: programme === "grade-6" ? currentGrade : undefined,
          stream: programme === "advanced-level" ? stream : undefined,
          olYear: programme === "advanced-level" ? olYear : undefined,
          olIndex: programme === "advanced-level" ? olIndex : undefined,
          olResults: programme === "advanced-level" ? olResults : undefined,
          medium,
          siblingName: siblingName || undefined,
          fatherOldThomian,
          fatherYears: fatherOldThomian === "Yes" ? fatherYears : undefined,
          housePreference,
          message: message || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit application.");
      setSuccess({
        reference: data.reference,
        message: data.message,
        programme: data.programme,
      });
      reset();
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
    <div className="overflow-hidden rounded-xl border border-fg/10 bg-surface shadow-soft">
      {/* Programme tabs */}
      <div className="grid grid-cols-2 gap-px bg-fg/10">
        {(
          [
            { id: "grade-6", label: "Grade 6 Intake", sub: "2027 · Age 10+" },
            { id: "advanced-level", label: "Advanced Level", sub: "Grades 12 – 13" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setProgramme(t.id);
              setError(null);
            }}
            className={`px-4 py-5 text-center transition-colors duration-300 sm:px-6 ${
              programme === t.id
                ? "bg-card text-white"
                : "bg-surface-2 text-fg/60 hover:bg-surface hover:text-fg"
            }`}
          >
            <span className="block font-display text-base font-semibold tracking-[-0.01em] sm:text-lg">
              {t.label}
            </span>
            <span
              className={`mt-1 block font-sans text-[9px] uppercase tracking-[0.2em] ${
                programme === t.id ? "text-gold" : "text-fg/40"
              }`}
            >
              {t.sub}
            </span>
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-8 md:p-10">
        {success ? (
          <div className="animate-fade-up py-6 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gold/20 text-gold">
              <CheckCircle2 size={34} />
            </div>
            <span className="mt-5 inline-block rounded-full bg-gold px-4 py-1.5 font-sans text-[10px] uppercase tracking-[0.25em] text-ink">
              Reference {success.reference}
            </span>
            <h3 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              Application Received
            </h3>
            <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-fg/60">
              {success.message}
            </p>
            <button
              onClick={() => setSuccess(null)}
              className="mt-7 rounded-full bg-fg px-7 py-3 text-[13px] font-medium text-surface transition-colors duration-300 hover:bg-gold hover:text-ink"
            >
              Submit another application
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-8">
            {/* Student */}
            <Section
              title="Student Details"
              note={programme === "grade-6" ? "Grade 6 · 2027 intake" : "Advanced Level · Grades 12 – 13"}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Student's full name *" className="sm:col-span-2">
                  <input
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className={inputCls}
                    placeholder="Enter full name as in the birth certificate"
                  />
                </Field>
                <Field label="Date of birth *">
                  <input
                    required
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Gender *">
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className={inputCls}
                  >
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </Field>
                <Field label="Medium *">
                  <select
                    value={medium}
                    onChange={(e) => setMedium(e.target.value)}
                    className={inputCls}
                  >
                    {MEDIUMS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={
                    programme === "grade-6" ? "Current grade *" : "Current school *"
                  }
                >
                  {programme === "grade-6" ? (
                    <select
                      required
                      value={currentGrade}
                      onChange={(e) => setCurrentGrade(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Select grade…</option>
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      required
                      value={currentSchool}
                      onChange={(e) => setCurrentSchool(e.target.value)}
                      className={inputCls}
                      placeholder="Current school"
                    />
                  )}
                </Field>
                <Field label="Current / previous school *" className="sm:col-span-2">
                  <input
                    required
                    value={currentSchool}
                    onChange={(e) => setCurrentSchool(e.target.value)}
                    className={inputCls}
                    placeholder="Name of present school"
                  />
                </Field>
              </div>
            </Section>

            {/* A/L only */}
            {programme === "advanced-level" && (
              <Section title="Advanced Level Details" note="Stream & O/L results">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Preferred stream *" className="sm:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      {STREAMS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStream(s)}
                          className={`rounded-full border px-4 py-2.5 font-sans text-[11px] font-medium transition-all duration-300 active:scale-95 ${
                            stream === s
                              ? "border-transparent bg-fg text-surface"
                              : "border-fg/15 text-fg/60 hover:border-fg hover:text-fg"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Year sat the O/L examination *">
                    <input
                      required
                      value={olYear}
                      onChange={(e) => setOlYear(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 2025"
                    />
                  </Field>
                  <Field label="O/L index number">
                    <input
                      value={olIndex}
                      onChange={(e) => setOlIndex(e.target.value)}
                      className={inputCls}
                      placeholder="Optional"
                    />
                  </Field>
                  <Field
                    label="O/L results summary *"
                    className="sm:col-span-2"
                  >
                    <textarea
                      required
                      rows={3}
                      value={olResults}
                      onChange={(e) => setOlResults(e.target.value)}
                      className={`${inputCls} h-auto resize-none py-3`}
                      placeholder="e.g. Mathematics A, Science A, English B, Sinhala A, History B, Buddhism A …"
                    />
                  </Field>
                </div>
              </Section>
            )}

            {/* Guardian */}
            <Section title="Parent / Guardian" note="Primary contact">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Guardian's full name *">
                  <input
                    required
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    className={inputCls}
                    placeholder="Full name"
                  />
                </Field>
                <Field label="Relationship to student *">
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className={inputCls}
                  >
                    {RELATIONSHIPS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
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
                <Field label="Email *">
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Residential address *" className="sm:col-span-2">
                  <textarea
                    required
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={`${inputCls} h-auto resize-none py-3`}
                    placeholder="Street, city, postal code"
                  />
                </Field>
              </div>
            </Section>

            {/* College links */}
            <Section title="College Connections" note="Optional — helps with placement">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sibling already at the college">
                  <input
                    value={siblingName}
                    onChange={(e) => setSiblingName(e.target.value)}
                    className={inputCls}
                    placeholder="Sibling's name & grade"
                  />
                </Field>
                <Field label="Is the father an Old Thomian?">
                  <select
                    value={fatherOldThomian}
                    onChange={(e) => setFatherOldThomian(e.target.value)}
                    className={inputCls}
                  >
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </Field>
                {fatherOldThomian === "Yes" && (
                  <Field label="Years at the college">
                    <input
                      value={fatherYears}
                      onChange={(e) => setFatherYears(e.target.value)}
                      className={inputCls}
                      placeholder="e.g. 1978 – 1990"
                    />
                  </Field>
                )}
                <Field label="House preference (sibling legacy)">
                  <select
                    value={housePreference}
                    onChange={(e) => setHousePreference(e.target.value)}
                    className={inputCls}
                  >
                    {HOUSES.map((h) => (
                      <option key={h}>{h}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Anything else we should know?" className="sm:col-span-2">
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className={`${inputCls} h-auto resize-none py-3`}
                    placeholder="Optional message to the admissions office…"
                  />
                </Field>
              </div>
            </Section>

            {error && (
              <div className="g-fade flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                  !
                </span>
                <p className="text-[13px] leading-relaxed text-red-500">{error}</p>
              </div>
            )}

            <div className="flex flex-col gap-4 border-t border-fg/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11.5px] leading-relaxed text-fg/45">
                Submitting records an application only. Supporting documents are
                verified in person at the admissions office.
              </p>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex shrink-0 items-center justify-center gap-2.5 rounded-full bg-gold px-8 py-4 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-fg hover:text-surface disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit Application
                    <Send size={15} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-semibold tracking-[-0.01em]">
          {title}
        </h3>
        <span className="font-sans text-[9px] uppercase tracking-[0.2em] text-fg/40">
          {note}
        </span>
      </div>
      {children}
    </fieldset>
  );
}

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
