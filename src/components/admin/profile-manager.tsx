"use client";

import { useRef, useState } from "react";
import {
  AtSign,
  BadgeCheck,
  Check,
  Clock,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { isUploadCancelled, xhrUpload } from "@/lib/upload-client";
import { speedLabel } from "@/components/portal/upload-progress-row";
import { GoogleIcon } from "@/components/portal/portal-login-cards";

/** Client-safe mirror of AVATAR_ACCEPT in the server-only admin-avatar lib. */
const AVATAR_ACCEPT = ".jpg,.jpeg,.png,.webp";

type Profile = {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  authProvider: string;
  lastLoginAt: string | null;
  createdAt: string | null;
};

const input =
  "h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-[#ffd444]";

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProfileManager({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [avatar, setAvatar] = useState(initial.avatar ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* v2.8.87.0 — PRIVATE photo upload (replaces the public media picker). */
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [prog, setProg] = useState<{ pct: number; bps: number | null } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setProg({ pct: 0, bps: null });
    try {
      const form = new FormData();
      form.append("file", file);
      const up = xhrUpload({
        url: "/api/admin/profile/photo",
        method: "POST",
        body: form,
        onProgress: (info) => setProg({ pct: info.pct, bps: info.bytesPerSecond }),
      });
      abortRef.current = up.abort;
      const res = await up.promise;
      const json = (res.json ?? {}) as { ok?: boolean; avatar?: string; error?: string };
      if (!res.ok || !json.ok || !json.avatar) {
        throw new Error(json.error || "Could not upload the photo.");
      }
      setAvatar(json.avatar);
      setProfile((p) => ({ ...p, avatar: json.avatar! }));
    } catch (cause) {
      if (!isUploadCancelled(cause)) {
        setUploadError(cause instanceof Error ? cause.message : "Could not upload the photo.");
      }
    } finally {
      abortRef.current = null;
      setProg(null);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* password form */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const saveProfile = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, avatar }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setProfile((p) => ({ ...p, name: json.profile.name, avatar: json.profile.avatar }));
      setMessage("Profile updated.");
    } else {
      setError(json.error ?? "Unable to update the profile.");
    }
    setBusy(false);
  };

  const changePassword = async () => {
    setPwMessage(null);
    setPwError(null);
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setPwError("New password must contain at least 10 characters.");
      return;
    }
    setPwBusy(true);
    const res = await fetch("/api/admin/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setPwMessage("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setPwError(json.error ?? "Unable to change the password.");
    }
    setPwBusy(false);
  };

  const initials =
    profile.name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AD";

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
      {/* ── Profile details ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
        <div className="flex items-center gap-2.5">
          <UserRound size={16} className="text-[#ffd444]" />
          <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">Profile details</h2>
        </div>

        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:flex-row">
          <span className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-white font-display text-2xl font-bold text-[#0b0b0a] shadow-[0_2px_14px_rgba(0,0,0,0.30)] ring-1 ring-black/10">
            {avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatar} alt="Profile photo" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="font-display text-lg font-semibold text-white">{profile.name}</p>
            <p className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-white/45 sm:justify-start">
              <ShieldCheck size={12} className="text-[#ffd444]" />
              {profile.role.replaceAll("_", " ")}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-4 text-[11px] font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <UserRound size={13} />}
                Upload photo
                <input
                  ref={fileRef}
                  type="file"
                  accept={AVATAR_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadPhoto(file);
                  }}
                />
              </label>
              {avatar && (
                <button
                  onClick={() => setAvatar("")}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-white/50 hover:text-white"
                >
                  Remove photo
                </button>
              )}
            </div>
            {uploading && prog ? (
              <div className="mt-3 w-full max-w-56 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10.5px] font-semibold text-white/75">
                    Uploading photo…
                  </span>
                  <span className="text-[9.5px] font-semibold tabular-nums text-white/40">
                    {prog.pct}%
                    {speedLabel(prog.bps) ? ` · ${speedLabel(prog.bps)}` : ""}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#ffd444] transition-[width] duration-300"
                    style={{ width: `${Math.max(3, prog.pct)}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => abortRef.current?.()}
                  aria-label="Cancel photo upload"
                  className="mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold text-white/40 transition-colors hover:bg-red-400/10 hover:text-red-300"
                >
                  <X size={10} aria-hidden="true" /> Cancel
                </button>
              </div>
            ) : null}
            {uploadError && (
              <p role="status" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                {uploadError}
              </p>
            )}
            <p className="mt-3 text-[10.5px] leading-relaxed text-white/35">
              JPG, PNG or WebP — up to 3 MB. Your photo is stored{" "}
              <span className="text-white/60">privately</span>: only signed-in admin
              accounts can see it. It never appears on the public website or in the
              Media Library.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
              <UserRound size={10} /> Display name
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Your name" />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
              <AtSign size={10} /> Email (sign-in — read only)
            </span>
            <input value={profile.email} readOnly className={`${input} cursor-default text-white/50`} />
          </label>
        </div>

        {message && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300">
            <Check size={14} /> {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">{error}</div>
        )}
        <div className="mt-6 flex justify-end">
          <button
            onClick={saveProfile}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-6 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save profile
          </button>
        </div>
      </section>

      {/* ── Password + account meta ─────────────────────────────────── */}
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <div className="flex items-center gap-2.5">
            <KeyRound size={16} className="text-[#ffd444]" />
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">Change password</h2>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className={input}
                placeholder="••••••••••"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={input}
                placeholder="At least 10 characters"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={input}
                placeholder="Repeat the new password"
              />
            </label>
          </div>
          {pwMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-3 text-[12px] text-emerald-300">
              <Check size={14} /> {pwMessage}
            </div>
          )}
          {pwError && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">{pwError}</div>
          )}
          <div className="mt-6 flex justify-end">
            <button
              onClick={changePassword}
              disabled={pwBusy || !currentPassword || !newPassword}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-6 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50"
            >
              {pwBusy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Update password
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          <div className="flex items-center gap-2.5">
            <BadgeCheck size={16} className="text-[#ffd444]" />
            <h2 className="font-display text-xl font-semibold tracking-[-0.01em]">Account</h2>
          </div>
          <dl className="mt-4 space-y-3 text-[12px]">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <dt className="flex items-center gap-1.5 text-white/40">
                <Clock size={12} /> Last sign-in
              </dt>
              <dd className="text-white/80">{formatDate(profile.lastLoginAt)}</dd>
            </div>
            {/* Sign-in method — reflects how this account LAST signed in.
                A Google sign-in flips auth_provider to "google" and pulls
                the Google profile photo; a password sign-in flips it back. */}
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <dt className="flex items-center gap-1.5 text-white/40">
                <ShieldCheck size={12} /> Sign-in method
              </dt>
              <dd>
                {profile.authProvider === "google" ? (
                  <span className="inline-flex items-center gap-2 text-white/80">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-white">
                      <GoogleIcon />
                    </span>
                    Google account
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-white/80">
                    <KeyRound size={13} className="text-[#ffd444]" /> Email &amp; password
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <dt className="flex items-center gap-1.5 text-white/40">
                <BadgeCheck size={12} /> Admin since
              </dt>
              <dd className="text-white/80">{formatDate(profile.createdAt)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-white/30">
            {profile.authProvider === "google"
              ? "Signing in with Google keeps this account marked as a Google account and updates the profile photo automatically."
              : "Signing in with the Google button switches this account to Google sign-in and pulls your Google profile photo."}
          </p>
        </section>
      </div>
    </div>
  );
}
