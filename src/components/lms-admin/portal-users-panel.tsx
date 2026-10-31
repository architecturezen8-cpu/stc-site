"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Landmark,
  Loader2,
  Lock,
  RefreshCcw,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   LMS ADMIN STUDIO → Portal users (v2.8.67.2, owner request).

   "lms-admin ekata portal users kiyala section ekak dammoth hodi ne.
    eke okkoma danata portal eka use karana kattiyage acc wala details
    pennanawa. habai password nathuwa — email eka show unata aulk na.
    teacherslage password reset option ekak danna lms-adminta (backup eka
    widiyata). filter ekakuth danna — teachers, parents, students filter
    karaganna. school register ekath ekka match wela hadapu acc ekak nam
    'Verified' badge ekakuth assign karanna."

   Read-mostly roster: safe details only (passwords NEVER travel to this
   panel), role filter pills, a Verified badge for register-matched
   accounts, and ONE write action — the teacher backup password reset,
   which signs out every device and forces a private password at the next
   sign-in (the D.1 /account/secure flow). Students and parents are
   strictly read-only here — the website Admin Studio stays the manager.
   Every colour reads the .lms-admin-scope --la-* token set (both themes).
   ──────────────────────────────────────────────────────────────────── */

type PortalAccountRow = {
  id: number;
  email: string;
  role: string;
  fullName: string;
  avatarUrl: string | null;
  active: boolean;
  status: string;
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  invitedBy: number | null;
  verified: boolean;
};

type RoleFilter = "all" | "student" | "teacher" | "parent" | "principal" | "lms_admin";

/* Palette constants — copied from the studio's shared manager
   (verification-records-manager) so every control matches the registers. */
const input =
  "h-11 w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-3.5 text-[13.5px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]";
const btnGold =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#141400] shadow-[0_10px_22px_-12px_rgba(255,212,68,0.8)] transition-colors hover:bg-[#e8c13a] disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-border)] px-4 text-[12.5px] font-medium text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)] disabled:opacity-50";
const searchInput =
  "h-10 w-full rounded-full border border-[var(--la-input-border)] bg-[var(--la-input-bg)] pl-9 pr-3.5 text-[13px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]";

const pill =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]";

/* Role badge colours adapted from the website-admin ROLE_META to la tokens:
   students blue-ish, teachers green/teal, parents rose. */
const ROLE_META: Record<
  string,
  { label: string; icon: typeof GraduationCap; badge: string }
> = {
  student: {
    label: "Student",
    icon: GraduationCap,
    badge: "bg-[var(--la-tint-blue)] text-[var(--la-blue-text)]",
  },
  teacher: {
    label: "Teacher",
    icon: BookOpen,
    badge: "bg-[var(--la-good-bg)] text-[var(--la-good-text)]",
  },
  parent: {
    label: "Parent",
    icon: HeartHandshake,
    badge: "bg-[var(--la-tint-coral)] text-[var(--la-coral-text)]",
  },
  lms_admin: {
    label: "LMS Admin",
    icon: GraduationCap,
    badge: "bg-[var(--la-tint-gold)] text-[var(--la-warn-text)]",
  },
  principal: {
    label: "Principal",
    icon: Landmark,
    badge: "bg-[var(--la-chip)] text-[var(--la-chip-text)]",
  },
};

function statusPill(row: PortalAccountRow) {
  if (!row.active)
    return {
      label: "Paused",
      badge: "bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]",
    };
  if (row.status === "active")
    return {
      label: "Active",
      badge: "bg-[var(--la-good-bg)] text-[var(--la-good-text)]",
    };
  if (row.status === "pending")
    return {
      label: "Pending",
      badge: "bg-[var(--la-warn-bg)] text-[var(--la-warn-text)]",
    };
  if (row.status === "rejected")
    return {
      label: "Rejected",
      badge: "bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]",
    };
  return { label: row.status, badge: "bg-[var(--la-chip)] text-[var(--la-chip-text)]" };
}

/* 14-char strong password, no ambiguous characters (same idea as the
   website-admin manager's generator). */
function generatePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789@#$%";
  let out = "";
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 14; i += 1) out += chars[buf[i] % chars.length];
  return out;
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function PersonAvatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full border border-[var(--la-border)] bg-[var(--la-panel-soft)] object-cover"
      />
    );
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--la-tint-blue)] text-[13px] font-semibold text-[var(--la-blue-text)]">
      {initialsOf(name)}
    </span>
  );
}

export function PortalUsersPanel() {
  const [users, setUsers] = useState<PortalAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<PortalAccountRow | null>(null);
  const [resetPassword, setResetPassword] = useState(() => generatePassword());
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/lms-admin/portal-users?role=all", {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | { users?: PortalAccountRow[]; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Unable to load portal accounts.");
      setUsers(data?.users ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to load portal accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* setState only from the async continuation (never sync in the effect
       body), per the project's react-hooks lint contract. */
    void Promise.resolve().then(load);
  }, [load]);

  const flash = (kind: "ok" | "err", text: string) => setNotice({ kind, text });

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((u) => u.role === "student").length,
      teacher: users.filter((u) => u.role === "teacher").length,
      parent: users.filter((u) => u.role === "parent").length,
      /* v2.8.71.0 — staff accounts joined the roster (read-only). */
      principal: users.filter((u) => u.role === "principal").length,
      lms_admin: users.filter((u) => u.role === "lms_admin").length,
    }),
    [users],
  );

  /* The search box filters the already-loaded list client-side — no refetch. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (roleFilter === "all" || u.role === roleFilter) &&
        (!q ||
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)),
    );
  }, [users, roleFilter, query]);

  const openReset = (row: PortalAccountRow) => {
    setResetPassword(generatePassword());
    setCopied(false);
    setResetTarget(row);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(resetPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const saveReset = async () => {
    if (!resetTarget) return;
    const name = resetTarget.fullName;
    setBusy(true);
    try {
      const res = await fetch("/api/lms-admin/portal-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetTarget.id, password: resetPassword }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Unable to reset the password.");
      }
      setResetTarget(null);
      flash("ok", `New password saved for ${name} — every live session was signed out.`);
      await load();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to reset the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${
            notice.kind === "ok"
              ? "border-[var(--la-good-bg)] bg-[var(--la-good-bg)] text-[var(--la-good-text)]"
              : "border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Privacy promise — small and calm */}
      <div className="flex items-start gap-2.5 rounded-xl border border-[var(--la-border)] bg-[var(--la-panel)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--la-body)]">
        <Lock size={14} className="mt-0.5 shrink-0 text-[var(--la-muted)]" aria-hidden="true" />
        <span>
          Passwords are never stored or shown here. A teacher can be issued a new one —
          they choose their own on next sign-in.
        </span>
      </div>

      {/* Role filter pills + search */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setRoleFilter("all")}
          className={roleFilter === "all" ? btnGold : btnGhost}
        >
          <UsersRound size={14} /> All ({counts.all})
        </button>
        <button
          onClick={() => setRoleFilter("student")}
          className={roleFilter === "student" ? btnGold : btnGhost}
        >
          <GraduationCap size={14} /> Students ({counts.student})
        </button>
        <button
          onClick={() => setRoleFilter("teacher")}
          className={roleFilter === "teacher" ? btnGold : btnGhost}
        >
          <BookOpen size={14} /> Teachers ({counts.teacher})
        </button>
        <button
          onClick={() => setRoleFilter("parent")}
          className={roleFilter === "parent" ? btnGold : btnGhost}
        >
          <HeartHandshake size={14} /> Parents ({counts.parent})
        </button>
        {/* v2.8.71.0 (owner item 3) — the staff accounts show here too:
            principal + LMS admin, read-only like everyone else. */}
        <button
          onClick={() => setRoleFilter("principal")}
          className={roleFilter === "principal" ? btnGold : btnGhost}
        >
          <Landmark size={14} /> Principal ({counts.principal})
        </button>
        <button
          onClick={() => setRoleFilter("lms_admin")}
          className={roleFilter === "lms_admin" ? btnGold : btnGhost}
        >
          <ShieldCheck size={14} /> LMS Admin ({counts.lms_admin})
        </button>
        <span className="flex-1" />
        <div className="relative w-full max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--la-faint)]"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={searchInput}
            placeholder="Search name or email…"
            aria-label="Search portal accounts"
          />
        </div>
      </div>

      {loading ? (
        /* Loading skeleton */
        <div className="la-panel-shadow overflow-hidden rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)]">
          <div className="divide-y divide-[var(--la-divider)]" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--la-chip)]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-44 animate-pulse rounded-full bg-[var(--la-chip)]" />
                  <div className="h-3 w-60 animate-pulse rounded-full bg-[var(--la-chip)]" />
                </div>
                <div className="h-6 w-16 animate-pulse rounded-full bg-[var(--la-chip)]" />
              </div>
            ))}
          </div>
        </div>
      ) : loadError ? (
        <div className="la-panel-shadow rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)] px-5 py-10 text-center">
          <p className="text-[13px] text-[var(--la-danger-text)]">{loadError}</p>
          <button type="button" onClick={() => void load()} className={`${btnGhost} mt-4`}>
            <RefreshCcw size={14} /> Try again
          </button>
        </div>
      ) : (
        <div className="la-panel-shadow overflow-hidden rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)]">
          <div className="la-scrollbar max-h-96 divide-y divide-[var(--la-divider)] overflow-y-auto">
            {visible.length === 0 && (
              <p className="px-5 py-10 text-center text-[13px] text-[var(--la-muted)]">
                {users.length === 0
                  ? "No portal accounts yet."
                  : `No accounts match “${query.trim()}”.`}
              </p>
            )}

            {visible.map((row) => {
              const meta = ROLE_META[row.role] ?? ROLE_META.student;
              const RoleIcon = meta.icon;
              const status = statusPill(row);
              const registerVerified = row.verified && row.role !== "lms_admin";
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[var(--la-panel-soft)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonAvatar name={row.fullName} src={row.avatarUrl} />
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-[var(--la-heading)]">
                        {row.fullName}
                      </p>
                      <p className="truncate text-[12px] text-[var(--la-muted)]">{row.email}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--la-faint)]">
                        Last sign-in {fmtDate(row.lastLoginAt)} · Added {fmtDate(row.createdAt)}
                        {!row.hasPassword ? " · Google-only sign-in" : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className={`${pill} ${meta.badge}`}>
                      <RoleIcon size={11} aria-hidden="true" /> {meta.label}
                    </span>
                    <span className={`${pill} ${status.badge}`}>{status.label}</span>

                    {/* Verification: register-matched accounts earn the emerald
                        shield; pending/rejected accounts already show their
                        status; live-but-unmatched ones get a quiet hint. */}
                    {registerVerified ? (
                      <span
                        title="Details matched the school register at sign-up"
                        className={`${pill} cursor-help bg-[var(--la-good-bg)] text-[var(--la-good-text)]`}
                      >
                        <ShieldCheck size={11} aria-hidden="true" /> Verified
                      </span>
                    ) : row.active && row.status === "active" && row.role !== "lms_admin" ? (
                      <span
                        title="No school-register match on file"
                        className={`${pill} cursor-help bg-[var(--la-chip)] text-[var(--la-chip-text)]`}
                      >
                        Self/team added
                      </span>
                    ) : null}

                    {/* ONE write action — teachers only. Students and parents
                        are read-only here by design. */}
                    {row.role === "teacher" && (
                      <button
                        type="button"
                        onClick={() => openReset(row)}
                        className={btnGhost}
                        title="Issue a new password (backup reset)"
                      >
                        <KeyRound size={14} /> Reset password
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reset password dialog — teachers only */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setResetTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Reset teacher password"
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Reset teacher password
            </h3>
            <p className="mt-1 text-[12.5px] text-[var(--la-muted)]">
              {resetTarget.fullName} ·{" "}
              <span className="text-[var(--la-body)]">{resetTarget.email}</span>
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--la-body)]">
              Share the new password privately — the teacher chooses their own at the
              next sign-in.
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={resetPassword}
                  className={`${input} font-mono`}
                  aria-label="New password"
                />
                <button
                  type="button"
                  onClick={() => setResetPassword(generatePassword())}
                  className={btnGhost}
                  title="Generate another strong password"
                >
                  <RefreshCcw size={14} /> Generate
                </button>
                <button
                  type="button"
                  onClick={copyPassword}
                  className={btnGhost}
                  title="Copy password"
                  disabled={!resetPassword}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="rounded-xl border border-[var(--la-warn-bg)] bg-[var(--la-warn-bg)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--la-warn-text)]">
                Any live sessions are signed out the moment you save. The teacher must
                choose a private password at their next sign-in.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className={btnGhost}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" onClick={saveReset} className={btnGold} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                Save new password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
