"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Landmark,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  BookOpen,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  Users,
} from "lucide-react";

type PortalUserRow = {
  id: number;
  email: string;
  role: string;
  fullName: string;
  avatarUrl: string | null;
  active: boolean;
  status?: string;
  hasPassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const input =
  "h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ffd444]";
const btnGold =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-[12.5px] font-medium text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50";

const ROLE_META: Record<string, { label: string; icon: typeof GraduationCap; badge: string }> = {
  student: {
    label: "Student",
    icon: GraduationCap,
    badge: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  },
  teacher: {
    label: "Teacher",
    icon: BookOpen,
    badge: "border-teal-400/40 bg-teal-400/10 text-teal-300",
  },
  parent: {
    label: "Parent",
    icon: HeartHandshake,
    badge: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  },
  lms_admin: {
    label: "LMS Admin",
    icon: GraduationCap,
    badge: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  /* v2.8.63.0 — the report-card certification role. */
  principal: {
    label: "Principal",
    icon: Landmark,
    badge: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
};

/** v2.8.69.0 — the roles this MAIN-studio page still manages by itself. */
const STAFF_PORTAL_ROLES = new Set(["lms_admin", "principal"]);

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

function Initials({ name, src }: { name: string; src?: string | null }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white font-display text-[13px] font-bold text-[#0b0b0a] ring-1 ring-black/10">
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        name
          .split(" ")
          .map((n) => n[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "?"
      )}
    </span>
  );
}

function PasswordField({
  value,
  onChange,
  onGenerate,
}: {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          required
          minLength={8}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${input} pr-11`}
          placeholder="Password (min 8 chars)"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg text-white/45 hover:text-white"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <button type="button" onClick={onGenerate} className={btnGhost} title="Generate a strong password">
        <RefreshCcw size={14} /> Generate
      </button>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard unavailable */
          }
        }}
        className={btnGhost}
        title="Copy password"
        disabled={!value}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/* ── v2.8.69.0 — the row, shared by BOTH views ────────────────────────────
   In the overview only the staff roles (principal / LMS admin) render with
   actions; in the "all portal users" view every row is strictly read-only. */
function UserRow({
  user,
  busy,
  showActions,
  onReset,
  onToggle,
  onDelete,
}: {
  user: PortalUserRow;
  busy: boolean;
  showActions: boolean;
  onReset: (user: PortalUserRow) => void;
  onToggle: (user: PortalUserRow) => void;
  onDelete: (user: PortalUserRow) => void;
}) {
  const meta = ROLE_META[user.role] ?? ROLE_META.student;
  const RoleIcon = meta.icon;
  return (
    <div
      className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(0,1.35fr)] md:items-center md:gap-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Initials name={user.fullName} src={user.avatarUrl} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold">{user.fullName}</p>
          <p className="truncate text-[12px] text-white/45">{user.email}</p>
          <p className="mt-0.5 text-[11px] text-white/30">
            {user.hasPassword ? "Email + password" : "Google only"} · Last login{" "}
            {fmtDate(user.lastLoginAt)}
          </p>
        </div>
      </div>
      <div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${meta.badge}`}
        >
          <RoleIcon size={11} />
          {meta.label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {user.status === "pending" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-300">
            Pending
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
              user.active
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : "border-red-400/40 bg-red-500/10 text-red-300"
            }`}
          >
            {user.active ? "Active" : "Paused"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {showActions ? (
          <>
            <button
              disabled={busy}
              onClick={() => onReset(user)}
              className={btnGhost}
              title="Reset password"
            >
              <KeyRound size={14} /> Reset
            </button>
            <button
              disabled={busy}
              onClick={() => onToggle(user)}
              className={btnGhost}
              title={user.active ? "Pause account" : "Resume account"}
            >
              {user.active ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}
              {user.active ? "Pause" : "Resume"}
            </button>
            <button
              disabled={busy}
              onClick={() => onDelete(user)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-red-400/30 px-3 text-[12.5px] font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              title="Delete account"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : (
          <span className="text-[11px] text-white/25">Read-only</span>
        )}
      </div>
    </div>
  );
}

export function PortalUsersManager({ initialUsers }: { initialUsers: PortalUserRow[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<PortalUserRow[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /* v2.8.69.0 — the default view is the OWNER's brief: counts + the
     principal / LMS-admin accounts only; the full portal list is one click
     away and strictly read-only here (the LMS Admin Studio owns those). */
  const [view, setView] = useState<"overview" | "all">("overview");

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("lms_admin");
  const [addPassword, setAddPassword] = useState(() => generatePassword());

  const [resetUser, setResetUser] = useState<PortalUserRow | null>(null);
  const [resetPassword, setResetPassword] = useState(() => generatePassword());

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((u) => u.role === "student").length,
      teacher: users.filter((u) => u.role === "teacher").length,
      parent: users.filter((u) => u.role === "parent").length,
      lms_admin: users.filter((u) => u.role === "lms_admin").length,
      principal: users.filter((u) => u.role === "principal").length,
      disabled: users.filter((u) => !u.active).length,
    }),
    [users],
  );

  /* Overview shows ONLY the staff roles; the all-view shows everyone. */
  const scoped = useMemo(
    () => (view === "overview" ? users.filter((u) => STAFF_PORTAL_ROLES.has(u.role)) : users),
    [users, view],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [scoped, query]);

  const flash = (kind: "ok" | "err", text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4200);
  };

  const patchUser = async (
    id: number,
    body: Record<string, unknown>,
    okText: string,
  ) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/portal-users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update the account.");
      setUsers((list) =>
        list.map((u) => (u.id === id ? { ...u, ...data.user, hasPassword: u.hasPassword } : u)),
      );
      flash("ok", okText);
      router.refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to update the account.");
    } finally {
      setBusy(false);
    }
  };

  const createUser = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/portal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: addName,
          email: addEmail,
          role: addRole,
          password: addPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to create the account.");
      setUsers((list) => [
        {
          id: data.id,
          email: addEmail.trim().toLowerCase(),
          role: addRole,
          fullName: addName.trim(),
          avatarUrl: null,
          active: true,
          hasPassword: true,
          lastLoginAt: null,
          createdAt: new Date().toISOString(),
        },
        ...list,
      ]);
      setAddOpen(false);
      setAddName("");
      setAddEmail("");
      setAddRole("lms_admin");
      setAddPassword(generatePassword());
      flash("ok", "Account created — share the password privately.");
      router.refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to create the account.");
    } finally {
      setBusy(false);
    }
  };

  const saveResetPassword = async () => {
    if (!resetUser) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/portal-users/${resetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to reset the password.");
      flash("ok", "Password reset — live sessions signed out. Share it privately.");
      setResetUser(null);
      router.refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to reset the password.");
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async (user: PortalUserRow) => {
    if (
      !window.confirm(
        `Delete ${user.fullName} (${user.email}) from the ${user.role} portal? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/portal-users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to delete the account.");
      setUsers((list) => list.filter((u) => u.id !== user.id));
      flash("ok", "Portal account deleted.");
      router.refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to delete the account.");
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
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-red-400/30 bg-red-500/10 text-red-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      {view === "overview" ? (
        <>
          {/* COUNT CARDS — the at-a-glance answer to "how many portal users?"
              v2.8.71.0 (owner item 3) — Principal and LMS Admin joined the
              at-a-glance row so the whole staff body is counted here too. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {(
              [
                { key: "student", label: "Students", value: counts.student, Icon: GraduationCap, tone: "text-sky-300" },
                { key: "teacher", label: "Teachers", value: counts.teacher, Icon: BookOpen, tone: "text-teal-300" },
                { key: "parent", label: "Parents", value: counts.parent, Icon: HeartHandshake, tone: "text-rose-300" },
                { key: "principal", label: "Principals", value: counts.principal, Icon: Landmark, tone: "text-emerald-300" },
                { key: "lms_admin", label: "LMS Admins", value: counts.lms_admin, Icon: GraduationCap, tone: "text-amber-300" },
                { key: "paused", label: "Paused accounts", value: counts.disabled, Icon: UserRoundX, tone: "text-red-300" },
              ] as const
            ).map(({ key, label, value, Icon, tone }) => (
              <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <Icon size={16} className={tone} />
                <p className="mt-2 font-display text-2xl font-semibold text-white">{value}</p>
                <p className="text-xs font-medium text-white/70">{label}</p>
                {key === "paused" ? null : (
                  <p className="mt-0.5 text-[10.5px] text-white/35">
                    {counts.all} portal account{counts.all === 1 ? "" : "s"} in total
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[12.5px] leading-relaxed text-white/50">
            This page manages <strong className="text-white/80">Principal</strong> and{" "}
            <strong className="text-white/80">LMS Admin</strong> accounts. Student, teacher and
            parent accounts live in the LMS Admin Studio → Portal users — view them read-only with
            the button below.
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3">
          <p className="text-[12.5px] leading-relaxed text-amber-200/90">
            <strong>Read-only view</strong> — student, teacher and parent accounts are managed in
            the LMS Admin Studio → Portal users.
          </p>
          <button onClick={() => setView("overview")} className={btnGhost}>
            <ArrowLeft size={14} /> Back to summary
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-72">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or portal…"
            className={`${input} pl-9`}
            aria-label="Search portal users"
          />
        </div>
        <span className="hidden items-center gap-2 text-[11px] text-white/35 sm:flex">
          {view === "overview"
            ? `${counts.lms_admin} LMS admin${counts.lms_admin === 1 ? "" : "s"} · ${counts.principal} principal${counts.principal === 1 ? "" : "s"}`
            : `${counts.student} students · ${counts.teacher} teachers · ${counts.parent} parents`}
          {counts.disabled > 0 && ` · ${counts.disabled} paused`}
        </span>
        <span className="flex-1" />
        {view === "all" ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-white/40">
            <Users size={14} /> Read-only
          </span>
        ) : (
          <button
            onClick={() => {
              setAddName("");
              setAddEmail("");
              setAddRole("lms_admin");
              setAddPassword(generatePassword());
              setAddOpen(true);
            }}
            className={btnGold}
          >
            <Plus size={15} /> Add staff account
          </button>
        )}
      </div>

      {view === "overview" ? (
        <h2 className="font-display text-lg font-semibold text-white">
          Principal &amp; LMS Admin accounts
        </h2>
      ) : null}

      {/* LIST — header and rows share one all-fr grid so columns align */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,0.9fr)_minmax(0,0.85fr)_minmax(0,1.35fr)] gap-4 border-b border-white/10 px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/35 md:grid">
          <span>Person</span>
          <span>Portal</span>
          <span>Status</span>
          <span className="text-right">{view === "overview" ? "Actions" : "Access"}</span>
        </div>
        <div className="max-h-[34rem] divide-y divide-white/[0.06] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-white/40">
              {query
                ? "No accounts match that search."
                : view === "overview"
                  ? "No Principal or LMS Admin accounts yet — add one with the button above."
                  : "No portal accounts yet."}
            </p>
          )}
          {filtered.map((user) => (
            <UserRow
              key={`${user.id}`}
              user={user}
              busy={busy}
              showActions={view === "overview"}
              onReset={(row) => {
                setResetUser(row);
                setResetPassword(generatePassword());
              }}
              onToggle={(row) =>
                patchUser(
                  row.id,
                  { active: !row.active },
                  row.active
                    ? "Account paused — live sessions signed out."
                    : "Account resumed.",
                )
              }
              onDelete={(row) => void deleteUser(row)}
            />
          ))}
        </div>
      </div>

      {view === "overview" ? (
        <button
          onClick={() => {
            setQuery("");
            setView("all");
          }}
          className={btnGhost}
        >
          <Users size={15} /> View all portal users (read-only)
        </button>
      ) : null}

      {/* ADD dialog — the main studio only creates the staff portal roles */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !busy && setAddOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add staff portal account"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/12 bg-[#101010] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold">Add Principal / LMS Admin</h3>
            <p className="mt-1 text-[12.5px] text-white/45">
              Creates a ready-to-use staff account. Student, teacher and parent accounts are added
              from the LMS Admin Studio.
            </p>
            <form
              className="mt-5 space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                createUser();
              }}
            >
              <input
                required
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className={input}
                placeholder="Full name"
                aria-label="Full name"
              />
              <input
                required
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className={input}
                placeholder="Email address"
                aria-label="Email address"
              />
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className={input}
                aria-label="Portal"
              >
                <option value="lms_admin" className="bg-[#141412]">LMS Admin (separate studio)</option>
                <option value="principal" className="bg-[#141412]">Principal (certifies report cards)</option>
              </select>
              <PasswordField
                value={addPassword}
                onChange={setAddPassword}
                onGenerate={() => setAddPassword(generatePassword())}
              />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAddOpen(false)} className={btnGhost} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className={btnGold} disabled={busy}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET dialog */}
      {resetUser && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !busy && setResetUser(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Reset portal password"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/12 bg-[#101010] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold">Reset password</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/45">
              {resetUser.fullName} · {resetUser.email}
              <br />
              Any live sessions are signed out the moment you save.
            </p>
            <div className="mt-5">
              <PasswordField
                value={resetPassword}
                onChange={setResetPassword}
                onGenerate={() => setResetPassword(generatePassword())}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setResetUser(null)} className={btnGhost} disabled={busy}>
                Cancel
              </button>
              <button type="button" onClick={saveResetPassword} className={btnGold} disabled={busy}>
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
