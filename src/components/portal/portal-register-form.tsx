"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Hourglass,
  Info,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  UserRoundPlus,
  X,
} from "lucide-react";
import type { PortalRoleKey } from "@/components/portal/portal-meta";

/* v2.9.15.3 — a parent may have more than one child in the school. Each
   row carries one child's admission number + class; the FIRST child is
   what the register matcher anchors on, the rest ride the same
   verification and appear on the dashboard together. */
type ChildRow = { admissionNo: string; className: string };
const MAX_CHILDREN = 6;

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
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  /** v2.9.13.0 — the student register now demands an email (owner:
      "acc ekak create karaddi email eka optional nemei required"). */
  required?: boolean;
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
        required={required}
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
  /* parent — v2.9.15.3: one row per child, start with a single row. */
  const [children, setChildren] = useState<ChildRow[]>([
    { admissionNo: "", className: "" },
  ]);
  const [relation, setRelation] = useState("father");
  const [guardianName, setGuardianName] = useState("");

  const setChildAt = (idx: number, patch: Partial<ChildRow>) =>
    setChildren((rows) =>
      rows.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  const addChildRow = () =>
    setChildren((rows) =>
      rows.length >= MAX_CHILDREN
        ? rows
        : [...rows, { admissionNo: "", className: "" }],
    );
  const removeChildRow = (idx: number) =>
    setChildren((rows) =>
      rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
    );

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
  /* v2.9.15.10 — LIVE waiting screen: the panel polls the registration
     status so an office approval/rejection shows up on THIS page without
     any refresh (owner: "approve eka enakan inna kena page eka refresh
     karanna ona naththan eka wenne na"), and a rejection shows the office's
     reason with an Edit & resubmit door ("aya hadissiyewath detail ekak
     waradunoth eka edit karanna option ekak na"). */
  const [waitingIdentifier, setWaitingIdentifier] = useState("");
  const [waitingHint, setWaitingHint] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"pending" | "active" | "rejected" | null>(null);
  const [liveReason, setLiveReason] = useState<string | null>(null);

  useEffect(() => {
    if (!waiting || !waitingIdentifier) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/portal/auth/register-status", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role, identifier: waitingIdentifier }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          status?: string;
          reason?: string | null;
        } | null;
        if (cancelled || !data?.ok || !data.status) return;
        if (data.status === "active" || data.status === "rejected" || data.status === "pending") {
          setLiveStatus(data.status);
          setLiveReason(data.status === "rejected" ? data.reason || null : null);
        }
      } catch {
        /* the next tick tries again — the panel stays calm */
      }
    };
    poll();
    const timer = setInterval(poll, 6000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [waiting, waitingIdentifier, role]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setNote(null);

    /* v2.9.15.3 — tidy the child rows: a row with ONLY one of the two
       fields filled can't be verified, so the form asks for the missing
       part instead of sending a half-child to the office. */
    const filledChildren = children
      .map((c) => ({
        admissionNo: c.admissionNo.trim(),
        className: c.className.trim(),
      }))
      .filter((c) => c.admissionNo || c.className);
    if (
      role === "parent" &&
      filledChildren.some((c) => !c.admissionNo || !c.className)
    ) {
      setNote(
        "One of the children is missing its admission number or class — complete that row or remove it.",
      );
      return;
    }

    setBusy(true);

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
      /* v2.9.15.3 — children[] rides along; the legacy single-child fields
         carry the FIRST child so older snapshots keep the same shape. */
      Object.assign(payload, {
        children: filledChildren,
        childAdmissionNo: filledChildren[0]?.admissionNo ?? "",
        childClass: filledChildren[0]?.className ?? "",
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
        admissionLoginHint?: boolean;
      };

      if (data.ok && data.redirect) {
        /* HARD navigation — the fresh session cookie must ride the very
           next request (router.replace raced it and bounced users back). */
        window.location.assign(data.redirect);
        return;
      }
      if (data.ok && data.status === "pending") {
        /* v2.9.15.10 — remember WHAT to poll with: the student's admission
           number first (it maps through admission_ref even when a family
           shares an email), otherwise the email. */
        setWaitingIdentifier(
          role === "student"
            ? (admissionNo.trim() || email.trim())
            : email.trim(),
        );
        setWaitingHint(Boolean(data.admissionLoginHint));
        setLiveStatus(null);
        setLiveReason(null);
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

  /* v2.9.15.10 — leaving the waiting panel to fix a detail keeps every
     field exactly as typed (component state survives); the resubmit then
     updates the SAME registration in the office queue. */
  const backToForm = () => {
    setWaiting(false);
    setLiveStatus(null);
    setLiveReason(null);
  };

  if (waiting) {
    if (liveStatus === "active") {
      return (
        <div
          role="status"
          className="rounded-2xl border border-[var(--pt-good-border,rgba(52,199,123,0.35))] bg-[var(--pt-good-bg,rgba(52,199,123,0.08))] p-5 text-center"
        >
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--pt-good-bg,rgba(52,199,123,0.16))] text-[var(--pt-good-text,#34c77b)]">
            <CheckCircle2 size={22} />
          </span>
          <h2 className="font-display text-[17px] font-semibold text-[var(--pt-heading)]">
            Approved — welcome to the portal!
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--pt-info-text)]">
            The school office just opened your account. Sign in with the same
            details you registered with.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign(`/login/${role}`)}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] text-[14px] font-semibold text-[var(--pt-on-accent)] transition-all hover:-translate-y-px hover:bg-[var(--pt-accent-hover)]"
          >
            Go to sign in
          </button>
        </div>
      );
    }

    if (liveStatus === "rejected") {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-red-400/30 bg-red-500/[0.07] p-5 text-center"
        >
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-red-500/15 text-red-400">
            <ShieldAlert size={22} />
          </span>
          <h2 className="font-display text-[17px] font-semibold text-[var(--pt-heading)]">
            The office couldn&apos;t approve this registration.
          </h2>
          <p className="mt-1.5 rounded-xl bg-red-500/[0.08] px-4 py-2.5 text-[13px] leading-relaxed text-[var(--pt-info-text)]">
            {liveReason
              ? `Office note: ${liveReason}`
              : "The school office rejected this registration."}
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--pt-info-text)]">
            Check the details below, fix anything wrong, and send it again —
            the office re-checks every resubmission.
          </p>
          <button
            type="button"
            onClick={backToForm}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pt-accent)] text-[14px] font-semibold text-[var(--pt-on-accent)] transition-all hover:-translate-y-px hover:bg-[var(--pt-accent-hover)]"
          >
            <Pencil size={15} /> Edit details &amp; send again
          </button>
        </div>
      );
    }

    return (
      <div
        role="status"
        className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] p-5 text-center"
      >
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
          <Hourglass size={22} className="animate-[pulse_2.4s_ease-in-out_infinite]" />
        </span>
        <h2 className="font-display text-[17px] font-semibold text-[var(--pt-heading)]">
          Registration received.
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--pt-info-text)]">
          Your details are with the school office. Once they approve your
          registration, you can sign in with the same details on this page.
        </p>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-[11.5px] text-[var(--pt-muted)]">
          <Loader2 size={12} className="animate-spin" />
          This page updates by itself — no need to refresh.
        </p>
        {waitingHint && (
          <p className="mt-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-2 text-[11.5px] leading-relaxed text-[var(--pt-info-text)]">
            Your email is already used by another student in the family — sign
            in with your <strong>admission number</strong> instead of the
            email.
          </p>
        )}
        <button
          type="button"
          onClick={backToForm}
          className="mx-auto mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-[var(--pt-border)] px-4 text-[12.5px] font-medium text-[var(--pt-body)] transition-colors hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)]"
        >
          <Pencil size={13} /> Edit details while you wait
        </button>
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
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            required
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
          {/* v2.9.15.3 — one card per child. The first child anchors the
              register check; extra children ride the same verification. */}
          <div className="space-y-3">
            {children.map((child, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5 sm:p-4"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-[var(--pt-chip-text)]">
                    {idx === 0 ? "Child 1" : `Child ${idx + 1}`}
                  </span>
                  {idx > 0 && (
                    <button
                      type="button"
                      onClick={() => removeChildRow(idx)}
                      aria-label={`Remove child ${idx + 1} from this registration`}
                      className="grid h-8 w-8 place-items-center rounded-lg text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-chip)] hover:text-[var(--pt-chip-text)]"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <Text
                    label="Admission number"
                    value={child.admissionNo}
                    onChange={(v) => setChildAt(idx, { admissionNo: v })}
                    placeholder="e.g. 1923"
                  />
                  {classList.length > 0 ? (
                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
                        Class (choose from the school list)
                      </span>
                      <select
                        value={child.className}
                        onChange={(e) => setChildAt(idx, { className: e.target.value })}
                        className={field}
                      >
                        <option value="" disabled>
                          Select the class&hellip;
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
                      value={child.className}
                      onChange={(v) => setChildAt(idx, { className: v })}
                      placeholder="e.g. 10-A"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {children.length < MAX_CHILDREN && (
            <button
              type="button"
              onClick={addChildRow}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--pt-border-strong)] text-[13px] font-medium text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
            >
              <Plus size={15} />
              Add another child
            </button>
          )}

          {/* v2.9.15.3 — the small instruction the owner asked for: what this
              section is FOR, in one calm line. */}
          <p className="flex gap-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--pt-info-text)]">
            <Info size={14} className="mt-0.5 shrink-0 text-[var(--pt-accent-text)]" />
            <span>
              One child is enough to open your account. If you have more
              children in the school, add each admission number above — they
              all appear on your dashboard together once the office approves
              you.
            </span>
          </p>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-[var(--pt-chip-text)]">
              You are each child&apos;s
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
