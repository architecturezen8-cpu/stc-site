"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  ListChecks,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import {
  ADMIN_MODULES,
  ADMIN_ROLES,
  CUSTOM_ROLE,
  FEATURE_GROUPS,
  MODULE_LABELS,
  ROLE_PERMISSIONS,
  customAccessSummary,
  parseCustomPermissions,
  roleLabel,
  type AdminModule,
  type CustomPermissions,
} from "@/lib/admin-roles";
import { GoogleIcon, GoogleMonoIcon } from "@/components/portal/portal-login-cards";
import { useAdminAccess } from "@/components/admin/admin-access";

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** v2.9.10.0 — how this account signs in: "password" | "google" | "supabase". */
  authProvider?: string;
  /** v2.9.12.0 — raw custom-access JSON ("custom" accounts only). */
  permissions?: string | null;
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

/** v2.9.12.0 — a preset role's matrix as a checklist draft (for the access
    editor's starting point when editing a preset-role account). */
function presetMatrixFor(role: string): CustomPermissions {
  const next: CustomPermissions = {};
  const matrix = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
  if (!matrix) return next;
  for (const mod of ADMIN_MODULES) {
    const lvl = matrix[mod];
    if (lvl === "read" || lvl === "edit") next[mod] = lvl;
  }
  return next;
}

/** v2.9.12.0 — the per-account FEATURE CHECKLIST that replaces the old
 *  preset role dropdown (owner: "hama feature ekakma show wenna one — tick
 *  eka dala access denna puluwan wenna one"). Every admin feature with a
 *  Full / View / — tri-state, grouped like the sidebar, plus quick presets.
 *  Full = edit, View = read-only, — = hidden from that person entirely. */
function FeatureAccessPicker({
  value,
  onChange,
  disabled,
}: {
  value: CustomPermissions;
  onChange: (next: CustomPermissions) => void;
  disabled?: boolean;
}) {
  const setLevel = (module: AdminModule, level: "edit" | "read" | null) => {
    const next: CustomPermissions = { ...value };
    if (level) next[module] = level;
    else delete next[module];
    onChange(next);
  };
  const applyPreset = (preset: "full" | "content" | "view" | "clear") => {
    if (preset === "clear") {
      onChange({});
      return;
    }
    const next: CustomPermissions = {};
    if (preset === "view") {
      for (const g of FEATURE_GROUPS) for (const it of g.items) next[it.module] = "read";
    } else if (preset === "content") {
      next.dashboard = "read";
      for (const m of [
        "pages",
        "news",
        "notices",
        "events",
        "staff",
        "clubs",
        "live",
        "filters",
        "media",
        "gallery",
        "unit-gallery",
      ] as AdminModule[])
        next[m] = "edit";
    } else {
      for (const g of FEATURE_GROUPS) for (const it of g.items) next[it.module] = "edit";
    }
    onChange(next);
  };
  const count = Object.keys(value).length;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-3 py-2.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
          Presets
        </span>
        {(
          [
            ["full", "Everything"],
            ["content", "Content & News"],
            ["view", "View only"],
            ["clear", "Clear"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => applyPreset(key)}
            className="rounded-full border border-white/12 px-2.5 py-1 text-[10.5px] font-medium text-white/55 transition-colors hover:border-[#ffd444]/50 hover:text-[#ffd444] disabled:opacity-40"
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[10.5px] text-white/35">
          {count} feature{count === 1 ? "" : "s"} ticked
        </span>
      </div>
      <div className="max-h-[236px] space-y-3.5 overflow-y-auto p-3 [scrollbar-width:thin]">
        {FEATURE_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-white/30">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const level = value[item.module];
                return (
                  <div
                    key={item.module}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-white/85">
                        {MODULE_LABELS[item.module]}
                      </p>
                      {item.note && (
                        <p className="truncate text-[10.5px] text-white/35">{item.note}</p>
                      )}
                    </div>
                    <div
                      className="flex shrink-0 overflow-hidden rounded-lg border border-white/12"
                      role="group"
                      aria-label={`Access level for ${MODULE_LABELS[item.module]}`}
                    >
                      {(
                        [
                          ["edit", "Full"],
                          ["read", "View"],
                          [null, "—"],
                        ] as const
                      ).map(([lvl, label]) => (
                        <button
                          key={label}
                          type="button"
                          disabled={disabled}
                          onClick={() => setLevel(item.module, lvl)}
                          aria-pressed={(level ?? null) === lvl}
                          className={`h-7 w-11 text-[10.5px] font-semibold transition-colors disabled:opacity-40 ${
                            (level ?? null) === lvl
                              ? lvl === "edit"
                                ? "bg-[#ffd444] text-[#0b0b0a]"
                                : lvl === "read"
                                  ? "bg-white/25 text-white"
                                  : "bg-red-500/80 text-white"
                              : "text-white/40 hover:bg-white/[0.06] hover:text-white/75"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** v2.9.10.0 — small sign-in-method badge beside the user's email.
 *  v2.9.10.1 — reborn as a self-contained pill: border + soft fill, the
 *  G centered in its own white disc, everything on one optical line.
 *  Rendered as a flex sibling of the email (shrink-0) so it never clips
 *  against the truncate — the old inline version rode the text baseline
 *  and looked squashed (owner: "google kiyala pennana eka aul"). */
function SignInBadge({ provider }: { provider?: string }) {
  if (provider === "google" || provider === "supabase") {
    return (
      <span
        className="inline-flex h-[19px] shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.08] py-0 pl-[3px] pr-2 text-[9.5px] font-semibold leading-none tracking-[0.02em] text-white/60"
        title={provider === "google" ? "Signs in with the Google button" : "Signs in through the invite identity"}
      >
        {/* v2.9.10.3 — the svg is a DIRECT grid child at its true 9px size:
            the old scale-wrapper was an inline span whose baseline gap
            shoved the G off-centre and out of the 13px disc. */}
        <span className="grid h-[13px] w-[13px] place-items-center rounded-full bg-white text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
          <GoogleMonoIcon size={9} />
        </span>
        Google
      </span>
    );
  }
  return null;
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
  /* v2.9.12.3 — read-only Role Management: view access enters and browses,
     every mutation (add / access editor / reset / disable / delete / review)
     stays out of reach. */
  const { canEdit } = useAdminAccess();
  const ro = !canEdit;

  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [requests, setRequests] = useState<RequestRow[]>(initialRequests);
  const [tab, setTab] = useState<"users" | "requests">("users");
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // add-user dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  /* v2.9.12.0 — the feature checklist replaces the preset role dropdown. */
  const [addFeatures, setAddFeatures] = useState<CustomPermissions>({});
  const [addPassword, setAddPassword] = useState(() => generatePassword());
  /* v2.9.10.0 — Google accounts need NO password: name + email + role.
     v2.9.10.4 — "invite" mints the SAME passwordless account but also
     emails the sign-in brief and hands back a copy/WhatsApp link. */
  const [addLoginType, setAddLoginType] = useState<"password" | "google" | "invite">("password");
  // v2.9.10.4 — post-invite share panel (email status + link + WhatsApp).
  const [inviteDone, setInviteDone] = useState<
    { name: string; email: string; role: string; link: string; emailed: boolean } | null
  >(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // approve dialog
  const [approveId, setApproveId] = useState<number | null>(null);
  const [approveFeatures, setApproveFeatures] = useState<CustomPermissions>({});
  const [approvePassword, setApprovePassword] = useState(() => generatePassword());
  const [approveLoginType, setApproveLoginType] = useState<"password" | "google">("password");

  // reset password dialog
  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState(() => generatePassword());

  /* v2.9.12.0 — per-account ACCESS EDITOR dialog (grant/revoke features for
     an existing email/account — the owner's "mata adala email ekata or acc
     ekata access denawa off karanna option ekak danna"). */
  const [accessUser, setAccessUser] = useState<UserRow | null>(null);
  const [accessDraft, setAccessDraft] = useState<CustomPermissions>({});

  const pendingCount = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);

  /* v2.9.12.1 — the lists are SERVER state arriving as props. The old code
     seeded useState once, so router.refresh() re-rendered the page with new
     props while the table kept the stale seed — a freshly added admin only
     appeared after a full reload (owner bug 2). This is the React-endorsed
     "adjust state when a prop changes" render-time sync (no effect needed). */
  const [seededUsers, setSeededUsers] = useState(initialUsers);
  if (seededUsers !== initialUsers) {
    setSeededUsers(initialUsers);
    setUsers(initialUsers);
  }
  const [seededRequests, setSeededRequests] = useState(initialRequests);
  if (seededRequests !== initialRequests) {
    setSeededRequests(initialRequests);
    setRequests(initialRequests);
  }

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
    features: CustomPermissions;
    loginType: "password" | "google";
    password?: string;
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
      /* v2.9.12.1 — instant feedback: prepend the fresh account to the
         visible list before router.refresh() catches up. */
      if (data.user?.id) {
        setUsers((list) =>
          list.some((u) => u.id === data.user.id)
            ? list
            : [
                {
                  id: data.user.id,
                  name: data.user.name ?? payload.name,
                  email: data.user.email ?? payload.email,
                  role: data.user.role ?? CUSTOM_ROLE,
                  avatar: null,
                  active: true,
                  lastLoginAt: null,
                  createdAt: new Date().toISOString(),
                  authProvider: data.user.authProvider ?? payload.loginType,
                  permissions: data.user.permissions ?? null,
                },
                ...list,
              ],
        );
      }
      payload.after(data);
      refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to create the user.");
    } finally {
      setBusy(false);
    }
  };

  /** v2.9.10.4 — the invite chain: mint the passwordless Google account,
      email the sign-in brief, hand back the shareable link. */
  const sendInvite = async (payload: { name: string; email: string; features: CustomPermissions }) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, origin: window.location.origin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to send the invite.");
      setInviteDone({
        name: payload.name,
        email: payload.email,
        role: CUSTOM_ROLE,
        link: data.inviteUrl || `${window.location.origin}/admin/login`,
        emailed: Boolean(data.emailed),
      });
      setLinkCopied(false);
      refresh();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to send the invite.");
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
            ? {
                id,
                action,
                features: approveFeatures,
                loginType: approveLoginType,
                ...(approveLoginType === "password" ? { password: approvePassword } : {}),
              }
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
            role: data.user.role,
            avatar: null,
            active: true,
            lastLoginAt: null,
            createdAt: new Date().toISOString(),
            authProvider: approveLoginType === "google" ? "google" : "password",
            permissions: data.user.permissions ?? null,
          },
        ]);
        flash(
          "ok",
          approveLoginType === "google"
            ? "Access approved — the Google account with that email can sign in with the Google button."
            : "Access approved — share the temporary password privately.",
        );
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

  /* v2.9.12.0 — the old role dropdown became a per-account ACCESS button.
     The label summarises what this person holds; clicking opens the access
     editor (the main Super Admin's row is locked, per the owner's rule). */
  const accessLabelFor = (user: UserRow) => {
    if (user.role === CUSTOM_ROLE)
      return customAccessSummary(parseCustomPermissions(user.permissions));
    return roleLabel(user.role);
  };

  const accessButtonFor = (user: UserRow) => {
    const self = user.id === currentUser.id;
    const targetProtected = user.role === "super_admin";
    const locked = busy || self || targetProtected;
    /* v2.9.12.3 — view-only accounts see the summary as a plain label; the
       access editor is an edit surface (owner: read-only = "monada thiyenne
       kiyala balanna puluwan"). */
    if (ro) {
      return (
        <span
          className="inline-flex h-10 max-w-full items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[12px] font-medium text-white/60"
          title="View-only access — you can look but not change"
        >
          <ListChecks size={13} className="shrink-0 text-white/40" />
          <span className="truncate">{accessLabelFor(user)}</span>
        </span>
      );
    }
    return (
      <button
        disabled={locked}
        onClick={() => {
          setAccessUser(user);
          setAccessDraft(
            user.role === CUSTOM_ROLE
              ? parseCustomPermissions(user.permissions) ?? {}
              : presetMatrixFor(user.role),
          );
        }}
        className="inline-flex h-10 max-w-full items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-[12px] font-medium text-white outline-none transition-colors hover:border-[#ffd444]/60 disabled:cursor-not-allowed disabled:opacity-40"
        title={
          targetProtected
            ? "The main Super Admin's access is protected"
            : self
              ? "You cannot change your own access"
              : "Change what this person can access"
        }
      >
        <ListChecks size={13} className="shrink-0 text-[#ffd444]" />
        <span className="truncate">{accessLabelFor(user)}</span>
      </button>
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
        {/* v2.9.12.3 — hidden for view-only accounts. */}
        {tab === "users" && !ro && (
          <button
            onClick={() => {
              setAddName("");
              setAddEmail("");
              setAddFeatures({});
              setAddPassword(generatePassword());
              setAddLoginType("password");
              setInviteDone(null);
              setLinkCopied(false);
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
            <span>Access</span>
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
                      <p className="flex min-w-0 items-center gap-2 text-[12px] text-white/45">
                        <span className="truncate">{user.email}</span>
                        <SignInBadge provider={user.authProvider} />
                      </p>
                      {/* suppressHydrationWarning — fmtDate renders in the
                          viewer's timezone; the server's zone can differ by
                          a day for late-night rows. */}
                      <p className="mt-0.5 text-[11px] text-white/30" suppressHydrationWarning>
                        Last login {fmtDate(user.lastLoginAt)} · Joined {fmtDate(user.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div>{accessButtonFor(user)}</div>
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
                    {/* v2.9.12.3 — view-only accounts get NO actions. */}
                    {ro ? (
                      <span className="text-[10.5px] uppercase tracking-[0.14em] text-white/30">
                        View only
                      </span>
                    ) : (
                      <>
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
                      </>
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
                    <p className="mt-0.5 text-[11.5px] text-white/35" suppressHydrationWarning>
                      {fmtDate(req.createdAt)} · {req.status.toUpperCase()}
                      {req.reviewedAt ? ` · reviewed ${fmtDate(req.reviewedAt)}` : ""}
                    </p>
                  </div>
                  {req.status === "pending" ? (
                    /* v2.9.12.3 — view-only accounts cannot review. */
                    ro ? (
                      <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-200">
                        Awaiting review
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={busy}
                          onClick={() => {
                            setApproveFeatures({});
                            setApprovePassword(generatePassword());
                            setApproveLoginType("password");
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
                    )
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

      {/* ADD ADMIN DIALOG — v2.9.12.1: the panel is a flex column with a
          scrollable body, so "Create account" stays reachable on short
          screens (the old whole-panel scroll cut the button off). */}
      {addOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#131311] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-semibold">
                {inviteDone ? "Invite ready to share" : "Add admin account"}
              </h2>
              <button onClick={() => setAddOpen(false)} className="text-white/40 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
            {inviteDone ? (
              /* v2.9.10.4 — post-invite share panel: email status, the
                 login link with copy, and one-tap WhatsApp hand-off. */
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                    <Check size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-semibold">{inviteDone.name}</p>
                    <p className="truncate text-[12px] text-white/45">
                      {inviteDone.email} ·{" "}
                      {inviteDone.role === CUSTOM_ROLE
                        ? "Custom access"
                        : (ADMIN_ROLES.find((r) => r.value === inviteDone.role)?.label ?? inviteDone.role)}
                    </p>
                  </div>
                </div>
                <div
                  className={`rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed ${
                    inviteDone.emailed
                      ? "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200"
                      : "border-amber-400/30 bg-amber-400/[0.07] text-amber-200"
                  }`}
                >
                  {inviteDone.emailed
                    ? `An invite email with the sign-in brief is on its way to ${inviteDone.email}.`
                    : `The invite email could not leave this deployment (mail keys missing) — share the link below with ${inviteDone.email} instead.`}
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                    Invite link
                  </p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={inviteDone.link}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`${input} min-w-0 flex-1 font-mono text-[12px]`}
                      aria-label="Invite link"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteDone.link);
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 1600);
                        } catch {
                          /* clipboard unavailable */
                        }
                      }}
                      className={btnGhost}
                      title="Copy invite link"
                    >
                      {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `You've been invited to the St. Thomas' College Matale Admin Studio. Sign in with Google using ${inviteDone.email}: ${inviteDone.link}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25d366] text-[13px] font-semibold text-[#05301b] transition-colors hover:bg-[#3fe07f]"
                >
                  <MessageCircle size={15} /> Send on WhatsApp
                </a>
                <p className="text-[11.5px] leading-relaxed text-white/40">
                  The link opens the admin login page — they tap Continue with Google with the invited
                  email. No password exists until you add one with Reset.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setInviteDone(null);
                    setAddOpen(false);
                  }}
                  className={`${btnGold} w-full`}
                >
                  Done
                </button>
              </div>
            ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (Object.keys(addFeatures).length === 0) {
                  flash("err", "Tick at least one feature for this account.");
                  return;
                }
                if (addLoginType === "invite") {
                  sendInvite({ name: addName, email: addEmail, features: addFeatures });
                  return;
                }
                createUser({
                  name: addName,
                  email: addEmail,
                  features: addFeatures,
                  loginType: addLoginType,
                  ...(addLoginType === "password" ? { password: addPassword } : {}),
                  after: (data) => {
                    setAddOpen(false);
                    flash(
                      "ok",
                      addLoginType === "google"
                        ? `Account created — the Google account with the email ${data.user?.email ?? addEmail} can sign in with the Google button.`
                        : `Account created — share the temporary password with ${data.user?.email ?? addEmail} privately.`,
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
              {/* v2.9.12.0 — the per-account FEATURE CHECKLIST replaces the
                  preset role dropdown: every admin feature shown, tick what
                  this person may use. The "Portal & LMS Admin" row is where
                  the owner decides who runs the LMS Studio. */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                  Feature access
                </p>
                <FeatureAccessPicker value={addFeatures} onChange={setAddFeatures} disabled={busy} />
              </div>

              {/* v2.9.10.0 — how this person signs in: a temporary password,
                  or their own Google account (no password at all).
                  v2.9.10.4 — super admins get a third way: an emailed invite. */}
              <div
                className={`grid gap-2 ${isSuper ? "grid-cols-3" : "grid-cols-2"}`}
                role="radiogroup"
                aria-label="Sign-in method"
              >
                <button
                  type="button"
                  onClick={() => setAddLoginType("password")}
                  aria-pressed={addLoginType === "password"}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[12.5px] font-semibold transition-colors ${
                    addLoginType === "password"
                      ? "border-[#ffd444] bg-[#ffd444]/10 text-[#ffd444]"
                      : "border-white/15 text-white/55 hover:border-white/35 hover:text-white"
                  }`}
                >
                  <KeyRound size={14} /> Password login
                </button>
                <button
                  type="button"
                  onClick={() => setAddLoginType("google")}
                  aria-pressed={addLoginType === "google"}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[12.5px] font-semibold transition-colors ${
                    addLoginType === "google"
                      ? "border-[#ffd444] bg-[#ffd444]/10 text-[#ffd444]"
                      : "border-white/15 text-white/55 hover:border-white/35 hover:text-white"
                  }`}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-white">
                    <span className="scale-[0.72]"><GoogleIcon /></span>
                  </span>
                  Google login
                </button>
                {isSuper && (
                  <button
                    type="button"
                    onClick={() => setAddLoginType("invite")}
                    aria-pressed={addLoginType === "invite"}
                    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[12.5px] font-semibold transition-colors ${
                      addLoginType === "invite"
                        ? "border-[#ffd444] bg-[#ffd444]/10 text-[#ffd444]"
                        : "border-white/15 text-white/55 hover:border-white/35 hover:text-white"
                    }`}
                  >
                    <Mail size={14} /> Email invite
                  </button>
                )}
              </div>

              {addLoginType === "invite" ? (
                <p className="text-[11.5px] leading-relaxed text-white/40">
                  The invite email with the sign-in brief goes straight to their inbox — and you get
                  the link too, ready to copy or send on WhatsApp. They sign in with Google (no
                  password).
                </p>
              ) : addLoginType === "google" ? (
                <p className="text-[11.5px] leading-relaxed text-white/40">
                  No password needed — just the name, email and role. The Google account holding this
                  email signs in with the <span className="text-white/70">Google button</span> on the admin
                  login page. A password can be added later with Reset.
                </p>
              ) : (
                <>
                  <PasswordField value={addPassword} onChange={setAddPassword} onGenerate={() => setAddPassword(generatePassword())} />
                  <p className="text-[11.5px] leading-relaxed text-white/40">
                    The temporary password is shown only here — copy it and share it privately. The new admin can
                    change it from Profile.
                  </p>
                </>
              )}
              <button disabled={busy} className={`${btnGold} w-full`}>
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : addLoginType === "invite" ? (
                  <Mail size={15} />
                ) : (
                  <Plus size={15} />
                )}
                {addLoginType === "invite" ? "Send invite" : "Create account"}
              </button>
            </form>
            )}
            </div>
          </div>
        </div>
      )}

      {/* APPROVE REQUEST DIALOG — same scrollable-panel pattern. */}
      {approveId !== null && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#131311] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-semibold">Approve access</h2>
              <button onClick={() => setApproveId(null)} className="text-white/40 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (Object.keys(approveFeatures).length === 0) {
                  flash("err", "Tick at least one feature for this account.");
                  return;
                }
                reviewRequest(approveId, "approve");
              }}
            >
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[12.5px] text-white/60">
                {requests.find((r) => r.id === approveId)?.name} ·{" "}
                {requests.find((r) => r.id === approveId)?.email}
              </div>
              {/* v2.9.12.0 — same feature checklist as the Add dialog. */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
                  Feature access
                </p>
                <FeatureAccessPicker
                  value={approveFeatures}
                  onChange={setApproveFeatures}
                  disabled={busy}
                />
              </div>

              {/* v2.9.10.0 — sign-in method for the approved account. */}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sign-in method">
                <button
                  type="button"
                  onClick={() => setApproveLoginType("password")}
                  aria-pressed={approveLoginType === "password"}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[12.5px] font-semibold transition-colors ${
                    approveLoginType === "password"
                      ? "border-[#ffd444] bg-[#ffd444]/10 text-[#ffd444]"
                      : "border-white/15 text-white/55 hover:border-white/35 hover:text-white"
                  }`}
                >
                  <KeyRound size={14} /> Password login
                </button>
                <button
                  type="button"
                  onClick={() => setApproveLoginType("google")}
                  aria-pressed={approveLoginType === "google"}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-[12.5px] font-semibold transition-colors ${
                    approveLoginType === "google"
                      ? "border-[#ffd444] bg-[#ffd444]/10 text-[#ffd444]"
                      : "border-white/15 text-white/55 hover:border-white/35 hover:text-white"
                  }`}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-white">
                    <span className="scale-[0.72]"><GoogleIcon /></span>
                  </span>
                  Google login
                </button>
              </div>

              {approveLoginType === "google" ? (
                <p className="text-[11.5px] leading-relaxed text-white/40">
                  No password — the Google account holding this email signs in with the Google button.
                </p>
              ) : (
                <PasswordField
                  value={approvePassword}
                  onChange={setApprovePassword}
                  onGenerate={() => setApprovePassword(generatePassword())}
                />
              )}
              <button disabled={busy} className={`${btnGold} w-full`}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve &amp; create
                account
              </button>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD DIALOG — same scrollable-panel pattern. */}
      {resetUser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#131311] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-semibold">Reset password</h2>
              <button onClick={() => setResetUser(null)} className="text-white/40 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
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
        </div>
      )}

      {/* ACCESS EDITOR DIALOG — v2.9.12.0 per-account feature grant/revoke.
          v2.9.12.1 — scrollable body so Save is always reachable. */}
      {accessUser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#131311] shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
              <h2 className="font-display text-lg font-semibold">Feature access</h2>
              <button onClick={() => setAccessUser(null)} className="text-white/40 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
              <p className="text-[13.5px] font-semibold">{accessUser.name}</p>
              <p className="text-[11.5px] text-white/45">
                {accessUser.email} · currently {accessLabelFor(accessUser)}
              </p>
            </div>
            <FeatureAccessPicker value={accessDraft} onChange={setAccessDraft} disabled={busy} />
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-white/40">
              Full = they can change it · View = look only · — = hidden from their sidebar. Saving
              makes this a Custom access account with exactly these features. Profile is always
              included for every account.
            </p>
            <button
              disabled={busy || Object.keys(accessDraft).length === 0}
              onClick={async () => {
                await patchUser(
                  accessUser.id,
                  { features: accessDraft },
                  `Access updated for ${accessUser.name}.`,
                );
                setAccessUser(null);
              }}
              className={`${btnGold} mt-4 w-full`}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save access
            </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
