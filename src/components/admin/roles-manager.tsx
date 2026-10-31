"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import {
  ADMIN_ROLES,
  type AdminRole,
} from "@/lib/admin-roles";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type RequestRow = {
  id: number;
  name: string;
  email: string;
  reason: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
};

const input =
  "h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#ffd444]";
const btnGold =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-[12.5px] font-medium text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50";

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
          .toUpperCase()
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
          minLength={10}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${input} pr-11`}
          placeholder="Temporary password (min 10 chars)"
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

export function RolesManager({
  currentUser,
  initialUsers,
  initialRequests,
}: {
  currentUser: { id: number; role: string; name: string };
  initialUsers: UserRow[];
  initialRequests: RequestRow[];
}) {
  const router = useRouter();
  const isSuper = currentUser.role === "super_admin";

  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [requests, setRequests] = useState<RequestRow[]>(initialRequests);
  const [tab, setTab] = useState<"users" | "requests">("users");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // add-user dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<AdminRole>("content_editor");
  const [addPassword, setAddPassword] = useState(() => generatePassword());

  // approve dialog
  const [approveId, setApproveId] = useState<number | null>(null);
  const [approveRole, setApproveRole] = useState<AdminRole>("content_editor");
  const [approvePassword, setApprovePassword] = useState(() => generatePassword());

  // reset password dialog
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState(() => generatePassword());

  const pendingCount = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);

  const creatableRoles = useMemo(
    () =>
      ADMIN_ROLES.filter(
        (r) => isSuper || (r.value !== "super_admin" && r.value !== "admin"),
      ),
    [isSuper],
  );

  const flash = (kind: "ok" | "err", text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4200);
  };

  const refresh = () => router.refresh();

  const patchUser = async (id: number, body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update the user.");
      setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
      flash("ok", okText);
      refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to update the user.");
    } finally {
      setBusy(false);
    }
  };

  const createUser = async (payload: {
    name: string;
    email: string;
    role: string;
    password: string;
    after: (data: { user?: { email?: string } }) => void;
  }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to create the user.");
      payload.after(data);
      refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to create the user.");
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async (user: UserRow) => {
    if (!window.confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to delete the user.");
      setUsers((list) => list.filter((u) => u.id !== user.id));
      flash("ok", "Admin account deleted.");
      refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to delete the user.");
    } finally {
      setBusy(false);
    }
  };

  const reviewRequest = async (id: number, action: "approve" | "reject") => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { id, action, role: approveRole, password: approvePassword }
            : { id, action },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to review the request.");
      setRequests((list) =>
        list.map((r) => (r.id === id ? { ...r, status: action === "approve" ? "approved" : "rejected" } : r)),
      );
      if (action === "approve") {
        setUsers((list) => [
          ...list,
          {
            id: data.user.id,
            name: requests.find((r) => r.id === id)?.name ?? "",
            email: data.user.email,
            role: approveRole,
            avatar: null,
            active: true,
            lastLoginAt: null,
            createdAt: new Date().toISOString(),
          },
        ]);
        flash("ok", "Access approved — share the temporary password privately.");
      } else {
        flash("ok", "Request rejected.");
      }
      setApproveId(null);
      refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to review the request.");
    } finally {
      setBusy(false);
    }
  };

  const roleSelectFor = (user: UserRow) => {
    const self = user.id === currentUser.id;
    const targetProtected = !isSuper && user.role === "super_admin";
    return (
      <select
        value={user.role}
        disabled={busy || self || targetProtected}
        onChange={(e) => patchUser(user.id, { role: e.target.value }, "Role updated.")}
        className="h-10 rounded-xl border border-white/15 bg-white/[0.06] px-2.5 text-[12.5px] text-white outline-none focus:border-[#ffd444] disabled:opacity-40"
        aria-label={`Role for ${user.name}`}
      >
        {ADMIN_ROLES.map((r) => (
          <option key={r.value} value={r.value} className="bg-[#141412] text-white">
            {r.label}
          </option>
        ))}
      </select>
    );
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

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab("users")}
          className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold transition-colors ${
            tab === "users" ? "bg-[#ffd444] text-[#0b0b0a]" : "border border-white/15 text-white/60 hover:text-white"
          }`}
        >
          <UserRoundCheck size={14} /> Admin Users
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10.5px]">{users.length}</span>
        </button>
        <button
          onClick={() => setTab("requests")}
          className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold transition-colors ${
            tab === "requests"
              ? "bg-[#ffd444] text-[#0b0b0a]"
              : "border border-white/15 text-white/60 hover:text-white"
          }`}
        >
          <ShieldCheck size={14} /> Access Requests
          {pendingCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10.5px] font-bold text-white">
              {pendingCount} new
            </span>
          )}
        </button>
        <span className="flex-1" />
        {tab === "users" && (
          <button
            onClick={() => {
              setAddName("");
              setAddEmail("");
              setAddRole("content_editor");
              setAddPassword(generatePassword());
              setAddOpen(true);
            }}
            className={btnGold}
          >
            <Plus size={15} /> Add Admin
          </button>
        )}
      </div>

      {/* USERS TAB */}
      {tab === "users" && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          {/* Header and rows share the SAME all-fr grid template. The old
              header used a trailing `auto` column while rows sized that
              column from their button group — each grid then computed
              different fr widths and the STATUS/ACTIONS headers drifted off
              their cells. With every column fr-based, both grids resolve to
              identical widths and stay aligned. */}
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1.35fr)] gap-4 border-b border-white/10 px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.25em] text-white/35 md:grid">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {users.map((user) => {
              const self = user.id === currentUser.id;
              return (
                <div
                  key={user.id}
                  className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,1.35fr)] md:items-center md:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Initials name={user.name} src={user.avatar} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-[13.5px] font-semibold">
                        {user.name}
                        {self && (
                          <span className="rounded-full border border-[#ffd444]/40 bg-[#ffd444]/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#ffd444]">
                            You
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[12px] text-white/45">{user.email}</p>
                      <p className="mt-0.5 text-[11px] text-white/30">
                        Last login {fmtDate(user.lastLoginAt)} · Joined {fmtDate(user.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div>{roleSelectFor(user)}</div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                        user.active
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                          : "border-red-400/40 bg-red-500/10 text-red-300"
                      }`}
                    >
                      {user.active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <button
                      disabled={busy || (!isSuper && user.role === "super_admin")}
                      onClick={() => {
                        setResetUser(user);
                        setResetPassword(generatePassword());
                      }}
                      className={btnGhost}
                      title="Reset password"
                    >
                      <KeyRound size={14} /> Reset
                    </button>
                    <button
                      disabled={busy || self || (!isSuper && user.role === "super_admin")}
                      onClick={() =>
                        patchUser(
                          user.id,
                          { active: !user.active },
                          user.active ? "Account disabled — sessions revoked." : "Account enabled.",
                        )
                      }
                      className={btnGhost}
                      title={user.active ? "Disable account" : "Enable account"}
                    >
                      {user.active ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}
                      {user.active ? "Disable" : "Enable"}
                    </button>
                    {isSuper && !self && (
                      <button
                        disabled={busy}
                        onClick={() => deleteUser(user)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-red-400/30 px-3 text-[12.5px] font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        title="Delete account"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* REQUESTS TAB */}
      {tab === "requests" && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="divide-y divide-white/[0.06]">
            {requests.length === 0 && (
              <p className="px-5 py-10 text-center text-[13px] text-white/40">
                No access requests yet — they arrive from the &ldquo;Request access&rdquo; link on the admin
                login page.
              </p>
            )}
            {requests.map((req) => (
              <div key={req.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold">
                      {req.name}{" "}
                      <span className="font-normal text-white/45">· {req.email}</span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-white/35">
                      {fmtDate(req.createdAt)} · {req.status.toUpperCase()}
                      {req.reviewedAt ? ` · reviewed ${fmtDate(req.reviewedAt)}` : ""}
                    </p>
                  </div>
                  {req.status === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={busy}
                        onClick={() => {
                          setApproveRole("content_editor");
                          setApprovePassword(generatePassword());
                          setApproveId(req.id);
                        }}
                        className={btnGold}
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button disabled={busy} onClick={() => reviewRequest(req.id, "reject")} className={btnGhost}>
                        <X size={14} /> Reject
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${
                        req.status === "approved"
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                          : "border-red-400/40 bg-red-500/10 text-red-300"
                      }`}
                    >
                      {req.status}
                    </span>
                  )}
                </div>
                {req.reason && (
                  <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-white/60">
                    “{req.reason}”
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADD ADMIN DIALOG */}
      {addOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#131311] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Add admin account</h2>
              <button onClick={() => setAddOpen(false)} className="text-white/40 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createUser({
                  name: addName,
                  email: addEmail,
                  role: addRole,
                  password: addPassword,
                  after: (data) => {
                    setAddOpen(false);
                    flash(
                      "ok",
                      `Account created — share the temporary password with ${data.user?.email ?? addEmail} privately.`,
                    );
                  },
                });
              }}
            >
              <input
                required
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className={input}
                placeholder="Full name"
              />
              <input
                required
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className={input}
                placeholder="email@stcmatale.lk"
              />
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as AdminRole)}
                className={input}
                aria-label="Role"
              >
                {creatableRoles.map((r) => (
                  <option key={r.value} value={r.value} className="bg-[#141412] text-white">
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
              <PasswordField value={addPassword} onChange={setAddPassword} onGenerate={() => setAddPassword(generatePassword())} />
              <p className="text-[11.5px] leading-relaxed text-white/40">
                The temporary password is shown only here — copy it and share it privately. The new admin can
                change it from Profile.
              </p>
              <button disabled={busy} className={`${btnGold} w-full`}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* APPROVE REQUEST DIALOG */}
      {approveId !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#131311] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Approve access</h2>
              <button onClick={() => setApproveId(null)} className="text-white/40 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                reviewRequest(approveId, "approve");
              }}
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[12.5px] text-white/60">
                {requests.find((r) => r.id === approveId)?.name} ·{" "}
                {requests.find((r) => r.id === approveId)?.email}
              </div>
              <select
                value={approveRole}
                onChange={(e) => setApproveRole(e.target.value as AdminRole)}
                className={input}
                aria-label="Role"
              >
                {creatableRoles.map((r) => (
                  <option key={r.value} value={r.value} className="bg-[#141412] text-white">
                    {r.label} — {r.description}
                  </option>
                ))}
              </select>
              <PasswordField
                value={approvePassword}
                onChange={setApprovePassword}
                onGenerate={() => setApprovePassword(generatePassword())}
              />
              <button disabled={busy} className={`${btnGold} w-full`}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve &amp; create
                account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD DIALOG */}
      {resetUser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-[#131311] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Reset password</h2>
              <button onClick={() => setResetUser(null)} className="text-white/40 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                patchUser(
                  resetUser.id,
                  { password: resetPassword },
                  `Password reset — existing sessions for ${resetUser.email} were signed out.`,
                );
                setResetUser(null);
              }}
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[12.5px] text-white/60">
                {resetUser.name} · {resetUser.email}
              </div>
              <PasswordField
                value={resetPassword}
                onChange={setResetPassword}
                onGenerate={() => setResetPassword(generatePassword())}
              />
              <p className="text-[11.5px] leading-relaxed text-white/40">
                All existing sessions for this account are signed out immediately.
              </p>
              <button disabled={busy} className={`${btnGold} w-full`}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Reset password
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
