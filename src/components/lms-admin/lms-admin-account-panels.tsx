"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, Lock, Phone, Save, ShieldCheck, UserRound } from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.8 — LMS ADMIN self-service panels on the studio Profile page.

   · LmsAdminDetailsEditor — the signed-in admin edits their own display
     name + account phone (owner: "aya machan ewage acc eka haduwa
     haduwamai details mukuth adala owner ta edit karanna ba"). The login
     email stays read-only — the office manages the identity.
   · LmsAdminPasswordCard — the studio's FIRST password change option
     (owner: "dan google login nathuwan nomal email ekai password ekai
     dala log unama acc eke password eka change karanna ba ne student,
     lms-admin,teachers,principal,parent portal wala"). Password accounts
     get the full form (current verified first, min 10 chars — the same
     rule the setup screen enforces); Google-only accounts get an honest
     note.

   POST /api/lms-admin/profile/details · POST /api/lms-admin/profile/password
   ──────────────────────────────────────────────────────────────────────── */

const GOLD_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#141400] shadow-[0_10px_22px_-12px_rgba(255,212,68,0.8)] transition-colors hover:bg-[#e8c13a] disabled:cursor-not-allowed disabled:opacity-50";

const INPUT =
  "h-10 w-full rounded-lg border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-3 text-[13px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-faint)] focus:border-[var(--la-border-strong)]";

type Notice = { kind: "ok" | "err"; text: string } | null;

function NoticeRow({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <p
      role="status"
      className={`mt-3 rounded-lg border border-[var(--la-border)] px-3 py-2 text-[12px] leading-relaxed ${
        notice.kind === "ok"
          ? "bg-[var(--la-good-bg,rgba(74,222,128,0.1))] text-[var(--la-good-text,#4ade80)]"
          : "bg-[var(--la-warn-bg,rgba(251,191,36,0.1))] text-[var(--la-warn-text,#fbbf24)]"
      }`}
    >
      {notice.text}
    </p>
  );
}

export function LmsAdminDetailsEditor({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string | null;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [phoneValue, setPhoneValue] = useState(phone ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const dirty = name.trim() !== fullName || phoneValue.trim() !== (phone ?? "");

  const save = async () => {
    if (busy) return;
    const nextName = name.trim().replace(/\s+/g, " ");
    if (nextName.length < 2 || nextName.length > 120) {
      setNotice({ kind: "err", text: "Please give a name between 2 and 120 characters." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/lms-admin/profile/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: nextName, phone: phoneValue.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; status?: string } | null;
      if (!res.ok || !data?.ok) {
        if (res.status === 401) {
          window.location.assign("/lms-admin/login");
          return;
        }
        if (data?.status === "bad_name") {
          setNotice({ kind: "err", text: "Please give a name between 2 and 120 characters." });
        } else if (data?.status === "bad_phone") {
          setNotice({ kind: "err", text: "The phone can only hold digits, spaces and + - ( ) — up to 30 characters." });
        } else {
          setNotice({ kind: "err", text: "Could not save your details — please try again." });
        }
        return;
      }
      setNotice({ kind: "ok", text: "Saved — your details now show across the studio." });
      router.refresh();
    } catch {
      setNotice({ kind: "err", text: "Could not save your details — please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--la-muted)]">
        Your account details
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--la-body)]">
        Edit your display name and contact number any time — the studio header
        and every byline follow straight away. Your sign-in email is managed by
        the main office.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--la-body)]">
            <UserRound size={12} aria-hidden="true" /> Full name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
            placeholder="Your name"
            aria-label="Full name"
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--la-body)]">
            <Phone size={12} aria-hidden="true" /> Phone (optional)
          </span>
          <input
            value={phoneValue}
            onChange={(e) => setPhoneValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
            className={INPUT}
            placeholder="07X XXX XXXX"
            aria-label="Phone number"
            maxLength={30}
            inputMode="tel"
            autoComplete="tel"
          />
        </label>
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-[var(--la-body)]">
        <Lock size={12} className="shrink-0 text-[var(--la-faint)]" aria-hidden="true" />
        <span>
          Sign-in email <span className="font-medium text-[var(--la-heading)]">{email}</span> — managed by the
          main office.
        </span>
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={GOLD_BTN}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
          {busy ? "Saving…" : "Save details"}
        </button>
        {dirty && !busy ? <span className="text-[11.5px] text-[var(--la-muted)]">Unsaved changes</span> : null}
      </div>

      <NoticeRow notice={notice} />
    </div>
  );
}

export function LmsAdminPasswordCard({ loginMethod }: { loginMethod: "google" | "password" }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirm) {
      setNotice({ kind: "err", text: "The two passwords don't match. Type them again." });
      return;
    }
    if (password.length < 10 || password.length > 128) {
      setNotice({ kind: "err", text: "Choose a new password with 10–128 characters (the studio's setup rule)." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/lms-admin/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: password }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; status?: string } | null;
      if (!res.ok || !data?.ok) {
        if (res.status === 401) {
          window.location.assign("/lms-admin/login");
          return;
        }
        if (data?.status === "bad_current") {
          setNotice({ kind: "err", text: "That current password didn't match. Try again." });
        } else if (data?.status === "bad_password") {
          setNotice({ kind: "err", text: "Choose a new password with 10–128 characters." });
        } else if (data?.status === "google_only") {
          setNotice({ kind: "err", text: "This account signs in with Google — there is no studio password to change." });
        } else {
          setNotice({ kind: "err", text: "Something went wrong — please try again in a moment." });
        }
        return;
      }
      setDone(true);
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch {
      setNotice({ kind: "err", text: "Something went wrong — please try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  if (loginMethod === "google") {
    return (
      <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--la-muted)]">Password</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--la-body)]">
          This account signs in with <span className="font-semibold text-[var(--la-heading)]">Google</span> — your
          password is managed by Google, so there is nothing to change here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] p-4">
      {done ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-[var(--la-border)] bg-[var(--la-good-bg,rgba(74,222,128,0.1))] px-3 py-2.5 text-[12.5px] font-medium text-[var(--la-good-text,#4ade80)]"
        >
          <ShieldCheck size={15} aria-hidden="true" />
          Password updated — use the new one on your next sign-in.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--la-muted)]">
            <KeyRound size={13} aria-hidden="true" /> Change your password
          </p>

          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-[var(--la-body)]">Current password</span>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={INPUT}
              placeholder="The password you use now"
              aria-label="Current password"
              autoComplete="current-password"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[var(--la-body)]">New password</span>
              <span className="relative block">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${INPUT} pr-10`}
                  placeholder="10–128 characters"
                  aria-label="New password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide passwords" : "Show passwords"}
                  className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-[var(--la-faint)] transition-colors hover:text-[var(--la-heading)]"
                >
                  {show ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                </button>
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium text-[var(--la-body)]">Repeat the new password</span>
              <input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={INPUT}
                placeholder="Once more"
                aria-label="Repeat the new password"
                autoComplete="new-password"
                required
              />
            </label>
          </div>

          {notice && !done ? <NoticeRow notice={notice} /> : null}

          <button
            type="submit"
            disabled={busy || !current || !password || !confirm}
            className={GOLD_BTN}
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
            {busy ? "Saving…" : "Save the new password"}
          </button>
        </form>
      )}
    </div>
  );
}
