"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Hourglass, Loader2, UserRoundPlus } from "lucide-react";
import type { PortalRoleKey } from "@/components/portal/portal-meta";

/** Gentle, non-technical outcomes — same calm tone as the sign-in form. */
const PHRASES: Record<string, string> = {
  exists:
    "That identity already has an account on this portal. Try signing in instead.",
  invalid:
    "Please check the details — every required field must be filled in, and the password needs at least 8 characters.",
  password_mismatch: "The two passwords don't match. Please type them again.",
  rate_limited:
    "Too many attempts right now. Please wait a few minutes and try again.",
  bad_request: "Please fill in every required field.",
  server_error: "Something went wrong on our side. Please try again in a moment.",
};

/* Shared field styling — themed via portal tokens, matches the sign-in form. */
const field =
  "h-12 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 text-[14.5px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] focus:ring-2 focus:ring-[var(--pt-ring)]";

function Text({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={field}
      />
    </label>
  );
}

export function PortalRegisterForm({
  role,
  defaultEmail = "",
}: {
  role: PortalRoleKey;
  defaultEmail?: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  /* student */
  const [admissionNo, setAdmissionNo] = useState("");
  const [registerNo, setRegisterNo] = useState("");
  const [className, setClassName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  /* teacher */
  const [teacherId, setTeacherId] = useState("");
  /* parent */
  const [childAdmissionNo, setChildAdmissionNo] = useState("");
  const [childClass, setChildClass] = useState("");
  const [relation, setRelation] = useState("father");
  const [guardianName, setGuardianName] = useState("");

  /* v2.8.59.0 — the owner: "class eka type karanna denne nathuwa selection
     list ekak demuda ... account ekka create karana than walath ehema karamu
     ne." The Class / Child's class fields become dropdowns fed from the
     school's REAL class names, so a typo can never break verification. A
     text input stands in when the list can't load (no dead ends). */
  const [classList, setClassList] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/register-classes", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { classes?: string[] } | null;
        if (!cancelled && res.ok && Array.isArray(json?.classes)) {
          setClassList(json.classes);
        }
      } catch {
        /* the fallback text input keeps the form usable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNote(null);

    const payload: Record<string, unknown> = {
      role,
      password,
      confirmPassword,
      phone: phone || undefined,
    };
    if (role === "student") {
      Object.assign(payload, {
        admissionNo,
        fullName,
        className,
        registerNo,
        fatherName,
        motherName,
        email: email || undefined,
      });
    } else if (role === "teacher") {
      Object.assign(payload, { teacherId, fullName, email });
    } else {
      Object.assign(payload, {
        childAdmissionNo,
        childClass,
        relation,
        guardianName,
        email,
      });
    }

    try {
      const res = await fetch("/api/portal/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        redirect?: string;
        status?: string;
      };

      if (data.ok && data.redirect) {
        /* HARD navigation — the fresh session cookie must ride the very
           next request (router.replace raced it and bounced users back). */
        window.location.assign(data.redirect);
        return;
      }
      if (data.ok && data.status === "pending") {
        setWaiting(true);
        setBusy(false);
        return;
      }
      setNote(PHRASES[data.status || ""] || PHRASES.server_error);
    } catch {
      setNote(PHRASES.server_error);
    } finally {
      setBusy(false);
    }
  }

  if (waiting) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] p-5 text-center"
      >
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
          <Hourglass size={22} />
        </span>
        <h2 className="font-display text-[17px] font-semibold text-[var(--pt-heading)]">
          Registration received.
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--pt-info-text)]">
          Your details are with the school office. Once they approve your
          registration, you can sign in with the same details on this page.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3" noValidate>
      {role === "student" && (
        <>
          <Text
            label="Admission number"
            value={admissionNo}
            onChange={setAdmissionNo}
            placeholder="e.g. 1923"
          />
          <Text
            label="Full name (as on the school register)"
            value={fullName}
            onChange={setFullName}
            placeholder="e.g. A.P. Silva"
            autoComplete="name"
          />
          {/* v2.8.62.0 — the owner: "godak welawata thawa details danna
              wenawa ne" — only admission no, name and class are REQUIRED;
              the register-matcher skips whatever the office has not
              recorded, so these can never block a family. */}
          <Text
            label="Register number (optional)"
            value={registerNo}
            onChange={setRegisterNo}
            placeholder="e.g. 1187"
          />
          {/* v2.8.59.0 — pick the class from the school's list. */}
          {classList.length > 0 ? (
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
                Class (choose from the school list)
              </span>
              <select
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className={field}
              >
                <option value="" disabled>
                  Select your class&hellip;
                </option>
                {classList.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Text
              label="Class"
              value={className}
              onChange={setClassName}
              placeholder="e.g. 10-A"
            />
          )}
          <Text
            label="Father's full name (optional)"
            value={fatherName}
            onChange={setFatherName}
            placeholder="e.g. W.A. Silva"
          />
          <Text
            label="Mother's full name (optional)"
            value={motherName}
            onChange={setMotherName}
            placeholder="e.g. K.G. Silva"
          />
          <Text
            label="Phone number (optional)"
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="e.g. 077 123 4567"
            autoComplete="tel"
          />
          <Text
            label="Email (optional)"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
          />
        </>
      )}

      {role === "teacher" && (
        <>
          <Text
            label="Teacher ID"
            value={teacherId}
            onChange={setTeacherId}
            placeholder="e.g. T-012"
          />
          <Text
            label="Full name (as on the staff register)"
            value={fullName}
            onChange={setFullName}
            placeholder="e.g. R.K. Wijesinghe"
            autoComplete="name"
          />
          <Text
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="username"
          />
          <Text
            label="Phone number (optional)"
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="e.g. 077 123 4567"
            autoComplete="tel"
          />
        </>
      )}

      {role === "parent" && (
        <>
          <Text
            label="Child's admission number"
            value={childAdmissionNo}
            onChange={setChildAdmissionNo}
            placeholder="e.g. 1923"
          />
          {/* v2.8.59.0 — the same dropdown for the parent's child class. */}
          {classList.length > 0 ? (
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
                Child&apos;s class (choose from the school list)
              </span>
              <select
                value={childClass}
                onChange={(e) => setChildClass(e.target.value)}
                className={field}
              >
                <option value="" disabled>
                  Select the class…
                </option>
                {classList.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Text
              label="Child's class"
              value={childClass}
              onChange={setChildClass}
              placeholder="e.g. 10-A"
            />
          )}
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
              You are the child&apos;s
            </span>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              className={field}
            >
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="guardian">Other guardian</option>
            </select>
          </label>
          <Text
            label="Your full name (with initials)"
            value={guardianName}
            onChange={setGuardianName}
            placeholder="e.g. W.A. Silva"
            autoComplete="name"
          />
          <Text
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="username"
          />
          <Text
            label="Phone number (optional)"
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="e.g. 077 123 4567"
            autoComplete="tel"
          />
        </>
      )}

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
          Password
        </span>
        <span className="relative block">
          <input
            type={show ? "text" : "password"}
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={`${field} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-chip)] hover:text-[var(--pt-chip-text)]"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
          Confirm password
        </span>
        <input
          type={show ? "text" : "password"}
          name="confirm-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Type the same password again"
          className={field}
        />
      </label>

      {note && (
        <p
          role="status"
          className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--pt-info-text)]"
        >
          {note}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] text-[14.5px] font-semibold text-[var(--pt-on-accent)] transition-all duration-300 hover:-translate-y-px hover:bg-[var(--pt-accent-hover)] hover:shadow-[0_10px_24px_-12px_rgb(255_212_68/0.5)] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
      >
        {busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <UserRoundPlus size={17} />
        )}
        {busy ? "Checking your details…" : "Create my account"}
      </button>
    </form>
  );
}
