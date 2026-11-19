"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, Phone, Save, UserRound } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.8 — "MY DETAILS" editor on the portal profile page
   (owner: "aya machan ewage acc eka haduwa haduwamai details mukuth adala
   owner ta edit karanna ba" — accounts the office created froze every
   detail; the signed-in owner could change nothing).

   v2.9.15.10 — THREE fields the owner controls now: the display NAME, the
   PHONE and the EMAIL (owner: "profile page eken phone numbers,email ehema
   update karama eka verification records walath change wenna ona ne —
   email,phone numbers ehema hamadama ekama thiyenne na ne ekai"). A save
   writes every place the contact details live: the account row, the office
   register row (what the Verification Records manager shows) and the
   verification snapshot the approvals queue re-checks. Google-only
   accounts keep their Google sign-in email — the register/snapshot still
   follow, with an honest note.
   ──────────────────────────────────────────────────────────────────── */

type Notice = { kind: "ok" | "err"; text: string } | null;

export function ProfileDetailsEditor({
  role,
  fullName,
  phone,
  email,
  signInKind = "Password",
}: {
  role: string;
  fullName: string;
  phone: string | null;
  email: string;
  /** v2.9.15.10 — "Password" rows own their sign-in email; Google rows get
      the honest note instead of a false promise. */
  signInKind?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [emailValue, setEmailValue] = useState(email);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const dirty =
    name.trim() !== fullName ||
    phoneValue.trim() !== (phone ?? "") ||
    emailValue.trim().toLowerCase() !== email.trim().toLowerCase();

  const save = async () => {
    if (busy) return;
    const nextName = name.trim().replace(/\s+/g, " ");
    if (nextName.length < 2 || nextName.length > 120) {
      setNotice({ kind: "err", text: "Please give a name between 2 and 120 characters." });
      return;
    }
    const nextEmail = emailValue.trim();
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setNotice({ kind: "err", text: "That email address doesn't look right — please check the spelling." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portal/profile/details", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-role": role },
        body: JSON.stringify({
          fullName: nextName,
          phone: phoneValue.trim(),
          contactEmail: nextEmail,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        emailChanged?: boolean;
        registerSynced?: boolean;
      } | null;
      if (!res.ok || !data?.ok) {
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        throw new Error(data?.error ?? "Could not save your details.");
      }
      const where = data.registerSynced
        ? "your portal, the office register and the verification records"
        : "your portal and the verification records";
      setNotice({
        kind: "ok",
        text: data.emailChanged
          ? `Saved — your contact details now match everywhere: ${where}. Your sign-in email changed too, so use the new one next time.`
          : `Saved — your contact details now match everywhere: ${where}.`,
      });
      router.refresh();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Could not save your details." });
    } finally {
      setBusy(false);
    }
  };

  const googleOnly = signInKind !== "Password";

  return (
    <div className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--pt-muted)]">
        Your account details
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--pt-body)]">
        These are YOUR details — edit them any time. Saving a phone or email
        also updates the office register and your verification records, so
        every place in the school system carries the same truth. The register
        record above stays the office&apos;s file otherwise.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--pt-body)]">
            <UserRound size={12} aria-hidden="true" /> Full name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[13px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-faint)] focus:border-[var(--pt-accent)]"
            placeholder="Your name"
            aria-label="Full name"
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--pt-body)]">
            <Phone size={12} aria-hidden="true" /> Phone (optional)
          </span>
          <input
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            className="h-10 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[13px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-faint)] focus:border-[var(--pt-accent)]"
            placeholder="07X XXX XXXX"
            aria-label="Phone number"
            maxLength={30}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--pt-body)]">
            <Mail size={12} aria-hidden="true" /> Email
          </span>
          <input
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            className="h-10 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[13px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-faint)] focus:border-[var(--pt-accent)]"
            placeholder="you@example.com"
            aria-label="Email address"
            maxLength={180}
            inputMode="email"
            autoComplete="email"
          />
          {googleOnly ? (
            <span className="mt-1 block text-[11px] leading-relaxed text-[var(--pt-muted)]">
              Saving updates the register and the office records — but your
              sign-in stays with Google&apos;s own address ({email}).
            </span>
          ) : (
            <span className="mt-1 block text-[11px] leading-relaxed text-[var(--pt-muted)]">
              Double-check the spelling — for password accounts this also
              becomes your sign-in email. Students can always sign in with
              their admission number.
            </span>
          )}
        </label>
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-[var(--pt-body)]">
        <Lock size={12} className="shrink-0 text-[var(--pt-faint)]" aria-hidden="true" />
        <span>
          Identity fields on the register (admission number, class, parents)
          are the office&apos;s file — contact them for those.
        </span>
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-4 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-colors hover:bg-[var(--pt-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
          {busy ? "Saving…" : "Save details"}
        </button>
        {dirty && !busy ? <span className="text-[11.5px] text-[var(--pt-muted)]">Unsaved changes</span> : null}
      </div>

      {notice && (
        <p
          role="status"
          className={`mt-2.5 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${
            notice.kind === "ok"
              ? "border-[var(--pt-border)] bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
              : "border-[var(--pt-border)] bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
