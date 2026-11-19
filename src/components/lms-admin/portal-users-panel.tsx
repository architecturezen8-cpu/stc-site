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
  Mail,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
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
   panel), role filter pills, and an HONEST verification badge — the
   office's manual classification (Verified / Unverified / Guest) wins,
   otherwise the register match decides; a wrong registration approved by
   hand shows UNVERIFIED, never a green shield (v2.9.15.0).

   Write actions (v2.9.15.0):
   · teacher backup password reset (the original emergency action),
   · manual verification classification (per-row dropdown, Auto = let the
     register match decide),
   · edit the sign-in email (teacher/parent/principal/lms_admin — student
     logins follow the admission number, so students show a hint instead),
   · link/unlink children on parent accounts (by admission number),
   · v2.9.15.2 — ADD PARENT ACCOUNT: the creation form carries the
     children list itself (staged admission-number chips + instructions),
     so a whole family is set up in one go — and the row "Link child"
     dialog now shows the linked children and stays open for multiples.
   · trash (soft delete — signed out immediately, restorable) and
     Delete permanently from the Trash tab (irreversible purge).
   Every colour reads the .lms-admin-scope --la-* token set (both themes).
   ──────────────────────────────────────────────────────────────────── */

type PortalChildRow = {
  studentId: number;
  fullName: string;
  admissionNo: string;
};

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
  verificationState: string | null;
  registerMatched: boolean;
  effectiveVerification: "verified" | "unverified" | "guest" | null;
  verified: boolean;
  deletedAt: string | null;
  children?: PortalChildRow[];
};

type RoleFilter = "all" | "student" | "teacher" | "parent" | "principal" | "lms_admin";
type ViewTab = "live" | "trash";

/* Palette constants — copied from the studio's shared manager
   (verification-records-manager) so every control matches the registers. */
const input =
  "h-11 w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-3.5 text-[13.5px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]";
const btnGold =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#141400] shadow-[0_10px_22px_-12px_rgba(255,212,68,0.8)] transition-colors hover:bg-[#e8c13a] disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-border)] px-4 text-[12.5px] font-medium text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)] disabled:opacity-50";
const btnDanger =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-danger-bg)] px-4 text-[12.5px] font-medium text-[var(--la-danger-text)] transition-colors hover:bg-[var(--la-danger-bg)] disabled:opacity-50";
const searchInput =
  "h-10 w-full rounded-full border border-[var(--la-input-border)] bg-[var(--la-input-bg)] pl-9 pr-3.5 text-[13px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]";

const pill =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]";

/* v2.9.15.0 — the per-row classification dropdown, styled to read like a
   pill (native select, no new dependencies). */
const selectCls =
  "h-8 cursor-pointer rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] px-2.5 text-[11.5px] font-semibold text-[var(--la-body)] outline-none transition-colors hover:border-[var(--la-border-strong)] focus:border-[#ffd444]";

/* Parent children chips + the student email hint chip. */
const childChip =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--la-body)]";
const childUnlinkBtn =
  "grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--la-faint)] transition-colors hover:bg-[var(--la-danger-bg)] hover:text-[var(--la-danger-text)]";
const hintChip =
  "inline-flex items-center rounded-full bg-[var(--la-chip)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--la-chip-text)]";

/* Roles whose login email may be edited here — students follow the
   admission number instead. */
const EMAIL_EDITABLE_ROLES = ["teacher", "parent", "principal", "lms_admin"];

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

  /* v2.9.15.0 — Active users / Trash tabs. The trash count is fetched
     lazily the first time the Trash tab opens (and refreshed by every
     reload made from inside the trash). */
  const [viewTab, setViewTab] = useState<ViewTab>("live");
  const [trashCount, setTrashCount] = useState<number | null>(null);

  const [resetTarget, setResetTarget] = useState<PortalAccountRow | null>(null);
  const [resetPassword, setResetPassword] = useState(() => generatePassword());
  const [copied, setCopied] = useState(false);

  const [emailTarget, setEmailTarget] = useState<PortalAccountRow | null>(null);
  const [emailDraft, setEmailDraft] = useState("");

  const [linkTarget, setLinkTarget] = useState<PortalAccountRow | null>(null);
  const [linkAdmission, setLinkAdmission] = useState("");
  /* v2.9.15.2 — the link dialog stays open: children linked in this
     session join the chips immediately, plus an inline note per action. */
  const [linkSessionChildren, setLinkSessionChildren] = useState<PortalChildRow[]>([]);
  const [linkNote, setLinkNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  /* v2.9.15.2 — Add parent account: one dialog creates the sign-in and
     links every child (staged admission numbers) in the same request. */
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState(() => generatePassword());
  const [addCopied, setAddCopied] = useState(false);
  const [addChildren, setAddChildren] = useState<string[]>([]);
  const [addAdmission, setAddAdmission] = useState("");
  const [addNotice, setAddNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/lms-admin/portal-users?role=all&view=${viewTab}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as
        | { users?: PortalAccountRow[]; view?: string; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "Unable to load portal accounts.");
      const rows = data?.users ?? [];
      setUsers(rows);
      if (viewTab === "trash") setTrashCount(rows.length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to load portal accounts.");
    } finally {
      setLoading(false);
    }
  }, [viewTab]);

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

  /* v2.9.15.0 — one helper for the action-keyed PATCH writes. */
  const patchAccount = async (payload: Record<string, unknown>, okText: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/lms-admin/portal-users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message ?? data?.error ?? "The action failed.");
      }
      flash("ok", okText);
      await load();
      return true;
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "The action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeState = async (row: PortalAccountRow, value: string) => {
    /* "" = back to Auto (the register match decides the badge again). */
    const state = value === "" ? null : value;
    await patchAccount(
      { id: row.id, action: "set-status", verificationState: state },
      state === ""
        ? `${row.fullName} set back to Auto — the register match decides the badge.`
        : `${row.fullName} classified as ${state}.`,
    );
  };

  const trashUser = async (row: PortalAccountRow) => {
    if (
      !window.confirm(
        `Move ${row.fullName}'s account to the trash? They will be signed out immediately.`,
      )
    ) {
      return;
    }
    const ok = await patchAccount(
      { id: row.id, action: "trash" },
      `${row.fullName} was moved to the trash — restore from the Trash tab if needed.`,
    );
    /* Keep the lazy trash count honest when trashing from the live view. */
    if (ok && viewTab === "live") setTrashCount((c) => (c ?? 0) + 1);
  };

  const restoreUser = async (row: PortalAccountRow) => {
    await patchAccount(
      { id: row.id, action: "restore" },
      `${row.fullName} was restored from the trash.`,
    );
  };

  const purgeUser = async (row: PortalAccountRow) => {
    if (
      !window.confirm(
        `Permanently delete ${row.fullName}'s account? This CANNOT be undone — the login, its sessions and its person links are removed for good.`,
      )
    ) {
      return;
    }
    await patchAccount(
      { id: row.id, action: "purge" },
      `${row.fullName}'s account was deleted permanently.`,
    );
  };

  const unlinkChild = async (row: PortalAccountRow, child: PortalChildRow) => {
    setBusy(true);
    try {
      const res = await fetch("/api/lms-admin/portal-users/children", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: row.id, studentId: child.studentId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Unable to unlink the child.");
      }
      flash("ok", `${child.fullName} was unlinked from ${row.fullName}.`);
      await load();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to unlink the child.");
    } finally {
      setBusy(false);
    }
  };

  const openEmail = (row: PortalAccountRow) => {
    setEmailDraft(row.email);
    setEmailTarget(row);
  };

  const saveEmail = async () => {
    if (!emailTarget) return;
    const email = emailDraft.trim().toLowerCase();
    if (!email) {
      flash("err", "Enter the new email address first.");
      return;
    }
    const name = emailTarget.fullName;
    const ok = await patchAccount(
      { id: emailTarget.id, action: "set-email", email },
      `${name}'s sign-in email is now ${email} — every live session was signed out.`,
    );
    if (ok) {
      setEmailTarget(null);
      setEmailDraft("");
    }
  };

  const openLink = (row: PortalAccountRow) => {
    setLinkAdmission("");
    setLinkSessionChildren([]);
    setLinkNote(null);
    setLinkTarget(row);
  };

  const saveLink = async () => {
    if (!linkTarget) return;
    const admissionNo = linkAdmission.trim();
    if (!admissionNo) {
      setLinkNote({ kind: "err", text: "Enter the child's admission number first." });
      return;
    }
    const parent = linkTarget;
    setBusy(true);
    try {
      const res = await fetch("/api/lms-admin/portal-users/children", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: parent.id, admissionNo }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; alreadyLinked?: boolean; error?: string; message?: string; child?: PortalChildRow }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message ?? data?.error ?? "Unable to link the child.");
      }
      const childName = data.child?.fullName ?? admissionNo;
      const child = data.child;
      if (child) {
        setLinkSessionChildren((list) =>
          list.some((c) => c.studentId === child.studentId) ? list : [...list, child],
        );
      }
      setLinkNote({
        kind: "ok",
        text: data.alreadyLinked
          ? `${childName} was already linked to ${parent.fullName}.`
          : `${childName} linked to ${parent.fullName} — add another child or press Done.`,
      });
      setLinkAdmission("");
      await load();
    } catch (err) {
      setLinkNote({
        kind: "err",
        text: err instanceof Error ? err.message : "Unable to link the child.",
      });
    } finally {
      setBusy(false);
    }
  };

  /* v2.9.15.2 — stage one child admission number in the create dialog
     (duplicates refused client-side; the server re-checks against the
     register at save time). */
  const stageChild = () => {
    const value = addAdmission.trim();
    if (!value) return;
    if (addChildren.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setAddNotice("That admission number is already in the list.");
      return;
    }
    setAddChildren((list) => [...list, value].slice(0, 20));
    setAddAdmission("");
    setAddNotice(null);
  };

  const unstageChild = (value: string) => {
    setAddChildren((list) => list.filter((c) => c !== value));
  };

  const openAddParent = () => {
    setAddName("");
    setAddEmail("");
    setAddPassword(generatePassword());
    setAddCopied(false);
    setAddChildren([]);
    setAddAdmission("");
    setAddNotice(null);
    setAddOpen(true);
  };

  const copyAddPassword = async () => {
    try {
      await navigator.clipboard.writeText(addPassword);
      setAddCopied(true);
      window.setTimeout(() => setAddCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const saveCreateParent = async () => {
    const name = addName.trim();
    const email = addEmail.trim().toLowerCase();
    if (!name) {
      setAddNotice("Enter the parent's full name first.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddNotice("Enter a valid email address — it becomes the parent's sign-in.");
      return;
    }
    if (addPassword.length < 8) {
      setAddNotice("Generate or type a password of at least 8 characters.");
      return;
    }
    /* v2.9.15.4 — a typed-but-unstaged admission number never disappears:
       going straight from the input to Create account stages it first
       (duplicates and past-the-cap numbers behave exactly like Add). */
    let admissionNos = addChildren;
    const pending = addAdmission.trim();
    if (pending) {
      const dupe = addChildren.some((c) => c.toLowerCase() === pending.toLowerCase());
      if (!dupe) admissionNos = [...addChildren, pending].slice(0, 20);
      setAddChildren(admissionNos);
      setAddAdmission("");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/lms-admin/portal-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name,
          email,
          password: addPassword,
          admissionNos,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            linked?: { admissionNo: string; fullName: string; alreadyLinked: boolean }[];
            failed?: { admissionNo: string; error: string }[];
          }
        | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Unable to create the account.");
      }
      const linked = data.linked ?? [];
      const failed = data.failed ?? [];
      const linkedText =
        linked.length > 0
          ? ` ${linked.length} child${linked.length === 1 ? "" : "ren"} linked (${linked
              .map(
                (c) =>
                  `${c.fullName} · ${c.admissionNo}${c.alreadyLinked ? " — already linked" : ""}`,
              )
              .join("; ")}).`
          : " No children were in the list — link them from the row any time.";
      const failedText =
        failed.length > 0
          ? ` NOT LINKED: ${failed
              .map(
                (f) =>
                  `${f.admissionNo} (${f.error === "admission_not_found" ? "not on the register" : "failed"})`,
              )
              .join(", ")} — check the number on the Registers page and link from the row.`
          : "";
      flash("ok", `Account created for ${name}.${linkedText}${failedText}`);
      setAddOpen(false);
      await load();
    } catch (err) {
      setAddNotice(err instanceof Error ? err.message : "Unable to create the account.");
    } finally {
      setBusy(false);
    }
  };

  /* v2.9.15.2 — the link dialog's chip list = the row's children plus
     anything linked during this dialog session (deduped by student id). */
  const modalChildren = useMemo(() => {
    if (!linkTarget) return [];
    const seen = new Set<number>();
    return [...(linkTarget.children ?? []), ...linkSessionChildren].filter((child) => {
      if (seen.has(child.studentId)) return false;
      seen.add(child.studentId);
      return true;
    });
  }, [linkTarget, linkSessionChildren]);

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

      {/* v2.9.15.0 — Active users / Trash tab pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setViewTab("live")}
          className={viewTab === "live" ? btnGold : btnGhost}
          aria-pressed={viewTab === "live"}
        >
          <UsersRound size={14} /> Active users
        </button>
        <button
          type="button"
          onClick={() => setViewTab("trash")}
          className={viewTab === "trash" ? btnGold : btnGhost}
          aria-pressed={viewTab === "trash"}
          title="Deleted accounts — restorable until deleted permanently"
        >
          <Trash2 size={14} /> Trash{trashCount !== null ? ` (${trashCount})` : ""}
        </button>
        {viewTab === "live" && (
          <button
            type="button"
            onClick={openAddParent}
            className={btnGold}
            disabled={busy}
            title="Create a parent account — link every child in the same form"
          >
            <UserPlus size={14} /> Add parent account
          </button>
        )}
        {viewTab === "trash" && (
          <span className="text-[11.5px] leading-relaxed text-[var(--la-muted)]">
            Trashed accounts are signed out and hidden everywhere until you restore them —
            deleting here is permanent.
          </span>
        )}
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
                  ? viewTab === "trash"
                    ? "The trash is empty."
                    : "No portal accounts yet."
                  : `No accounts match “${query.trim()}”.`}
              </p>
            )}

            {visible.map((row) => {
              const meta = ROLE_META[row.role] ?? ROLE_META.student;
              const RoleIcon = meta.icon;
              const status = statusPill(row);
              const inTrash = viewTab === "trash";
              const effective = row.effectiveVerification;
              const emailEditable = EMAIL_EDITABLE_ROLES.includes(row.role);
              const children = row.children ?? [];
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
                        {inTrash ? ` · Deleted ${fmtDate(row.deletedAt)}` : ""}
                      </p>

                      {/* v2.9.15.0 — parent children chips (live view only):
                          tap the × to unlink, "Link child" adds one. */}
                      {!inTrash && row.role === "parent" && children.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {children.map((child) => (
                            <span key={child.studentId} className={childChip}>
                              {child.fullName} · {child.admissionNo}
                              <button
                                type="button"
                                onClick={() => void unlinkChild(row, child)}
                                className={childUnlinkBtn}
                                disabled={busy}
                                title={`Unlink ${child.fullName}`}
                                aria-label={`Unlink ${child.fullName} from ${row.fullName}`}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* v2.9.15.2 — a parent with no children says so, so
                          the office knows the family links still need doing. */}
                      {!inTrash && row.role === "parent" && children.length === 0 && (
                        <div className="mt-1.5">
                          <span className={hintChip}>no children linked yet</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className={`${pill} ${meta.badge}`}>
                      <RoleIcon size={11} aria-hidden="true" /> {meta.label}
                    </span>
                    <span className={`${pill} ${status.badge}`}>{status.label}</span>

                    {inTrash ? (
                      /* Trash view — a plain Deleted marker instead of the
                         verification widgets. */
                      <span
                        title="Waiting in the trash — restore it, or delete it permanently"
                        className={`${pill} cursor-help bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]`}
                      >
                        Deleted
                      </span>
                    ) : row.role !== "lms_admin" ? (
                      <>
                        {/* Honest verification badge: the office's manual
                            classification wins, then the register match;
                            nothing else may read as Verified. */}
                        {effective === "verified" && (
                          <span
                            title="Register match on file — or the office classified it verified"
                            className={`${pill} cursor-help bg-[var(--la-good-bg)] text-[var(--la-good-text)]`}
                          >
                            <ShieldCheck size={11} aria-hidden="true" /> Verified
                          </span>
                        )}
                        {effective === "unverified" && (
                          <span
                            title="No register match on file — or the office classified it unverified"
                            className={`${pill} cursor-help bg-[var(--la-warn-bg)] text-[var(--la-warn-text)]`}
                          >
                            <ShieldAlert size={11} aria-hidden="true" /> Unverified
                          </span>
                        )}
                        {effective === "guest" && (
                          <span
                            title="The office classified this account as a guest"
                            className={`${pill} cursor-help bg-[var(--la-chip)] text-[var(--la-chip-text)]`}
                          >
                            Guest
                          </span>
                        )}
                        {effective === null && row.active && row.status === "active" && (
                          <span
                            title="No school-register match on file"
                            className={`${pill} cursor-help bg-[var(--la-chip)] text-[var(--la-chip-text)]`}
                          >
                            Self/team added
                          </span>
                        )}

                        {/* Manual classification — Auto lets the register
                            match decide. Classification only: sessions and
                            access are untouched. */}
                        <select
                          value={row.verificationState ?? ""}
                          onChange={(e) => void changeState(row, e.target.value)}
                          className={selectCls}
                          disabled={busy}
                          title="Office classification — Auto lets the register match decide"
                          aria-label={`Verification state for ${row.fullName}`}
                        >
                          <option value="">Auto</option>
                          <option value="verified">Verified</option>
                          <option value="unverified">Unverified</option>
                          <option value="guest">Guest</option>
                        </select>
                      </>
                    ) : null}

                    {inTrash ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void restoreUser(row)}
                          className={btnGhost}
                          disabled={busy}
                          title="Take this account out of the trash"
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => void purgeUser(row)}
                          className={btnDanger}
                          disabled={busy}
                          title="Delete permanently — cannot be undone"
                        >
                          <Trash2 size={14} /> Delete permanently
                        </button>
                      </>
                    ) : (
                      <>
                        {/* ONE original write action — teacher backup reset. */}
                        {row.role === "teacher" && (
                          <button
                            type="button"
                            onClick={() => openReset(row)}
                            className={btnGhost}
                            disabled={busy}
                            title="Issue a new password (backup reset)"
                          >
                            <KeyRound size={14} /> Reset password
                          </button>
                        )}

                        {/* v2.9.15.0 — email edit for staff/family roles;
                            students show the honest hint instead. */}
                        {emailEditable && (
                          <button
                            type="button"
                            onClick={() => openEmail(row)}
                            className={btnGhost}
                            disabled={busy}
                            title="Change the sign-in email (signs their devices out)"
                          >
                            <Mail size={14} /> Edit email
                          </button>
                        )}
                        {row.role === "student" && (
                          <span
                            className={hintChip}
                            title="Student logins use their admission number — the office edits the address on the registers page"
                          >
                            login email follows the admission no
                          </span>
                        )}

                        {/* v2.9.15.0 — parent children linking. */}
                        {row.role === "parent" && (
                          <button
                            type="button"
                            onClick={() => openLink(row)}
                            className={btnGhost}
                            disabled={busy}
                            title="Attach a child by admission number"
                          >
                            <UserPlus size={14} /> Link child
                          </button>
                        )}

                        {/* v2.9.15.0 — soft delete with sign-out. LMS admin
                            rows stay untouchable. */}
                        {row.role !== "lms_admin" && (
                          <button
                            type="button"
                            onClick={() => void trashUser(row)}
                            className={btnDanger}
                            disabled={busy}
                            title="Move to the trash — they will be signed out immediately"
                          >
                            <Trash2 size={14} /> Delete
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

      {/* Edit email dialog — teacher / parent / principal / lms_admin */}
      {emailTarget && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setEmailTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Edit sign-in email"
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Edit sign-in email
            </h3>
            <p className="mt-1 text-[12.5px] text-[var(--la-muted)]">
              {emailTarget.fullName} ·{" "}
              <span className="text-[var(--la-body)]">{emailTarget.email}</span>
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--la-body)]">
              They will sign in with this address from now on. Saving signs out every
              live session for the account.
            </p>

            <div className="mt-4">
              <input
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                className={input}
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="name@example.com"
                aria-label="New sign-in email"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmailTarget(null)}
                className={btnGhost}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEmail()}
                className={btnGold}
                disabled={busy || !emailDraft.trim()}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Save email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link child dialog — parents only. v2.9.15.2: shows the children
          already linked (with unlink ×), stays open so several children
          can be added in one sitting, and carries the how-to note. */}
      {linkTarget && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setLinkTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Link a child"
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Link a child
            </h3>
            <p className="mt-1 text-[12.5px] text-[var(--la-muted)]">
              {linkTarget.fullName}
            </p>

            <p className="mt-3 rounded-xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[var(--la-body)]">
              Type the child&apos;s admission number exactly as it appears on the school
              register — for example 1234. It must already be on the admission register
              (the Registers page is where it lives). The dialog stays open, so link as
              many children as you need, then press Done.
            </p>

            {modalChildren.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {modalChildren.map((child) => (
                  <span key={child.studentId} className={childChip}>
                    {child.fullName} · {child.admissionNo}
                    <button
                      type="button"
                      onClick={() => void unlinkChild(linkTarget, child)}
                      className={childUnlinkBtn}
                      disabled={busy}
                      title={`Unlink ${child.fullName}`}
                      aria-label={`Unlink ${child.fullName} from ${linkTarget.fullName}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <input
                value={linkAdmission}
                onChange={(e) => setLinkAdmission(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveLink();
                  }
                }}
                className={input}
                placeholder="Admission number"
                aria-label="Child's admission number"
                inputMode="numeric"
              />
              <button
                type="button"
                onClick={() => void saveLink()}
                className={btnGold}
                disabled={busy || !linkAdmission.trim()}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Link
              </button>
            </div>

            {linkNote && (
              <p
                className={`mt-3 rounded-xl border px-3.5 py-2.5 text-[12px] leading-relaxed ${
                  linkNote.kind === "ok"
                    ? "border-[var(--la-good-bg)] bg-[var(--la-good-bg)] text-[var(--la-good-text)]"
                    : "border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]"
                }`}
              >
                {linkNote.text}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLinkTarget(null)}
                className={btnGhost}
                disabled={busy}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* v2.9.15.2 — Add parent account: the sign-in and EVERY child in
          one dialog (owner: "parent kenek acc eka hadaddi ethanata
          dammoth hodai ne"). Children stage as admission-number chips;
          the helper text explains exactly what to type. */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setAddOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Add parent account"
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Add parent account
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--la-muted)]">
              Creates the parent&apos;s sign-in and links their children in one go — no
              need to open each child separately afterwards.
            </p>

            <p className="mt-3 rounded-xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[var(--la-body)]">
              <span className="font-semibold text-[var(--la-heading)]">
                How the children list works:{" "}
              </span>
              type each child&apos;s admission number exactly as it appears on the school
              register (for example 1234) and press Add. The number must already be on
              the admission register — the Registers page is where it lives. Add as many
              children as you need; they are all linked the moment you press Create
              account. A number still sitting in the input when you press Create account
              is added automatically.
            </p>

            <form
              className="mt-4 space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveCreateParent();
              }}
            >
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className={input}
                placeholder="Parent's full name"
                aria-label="Parent's full name"
                autoComplete="off"
              />
              <input
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className={input}
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="Sign-in email (name@example.com)"
                aria-label="Parent's sign-in email"
              />

              <div className="flex gap-2">
                <input
                  readOnly
                  value={addPassword}
                  className={`${input} font-mono`}
                  aria-label="Starting password"
                />
                <button
                  type="button"
                  onClick={() => setAddPassword(generatePassword())}
                  className={btnGhost}
                  title="Generate another strong password"
                >
                  <RefreshCcw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void copyAddPassword()}
                  className={btnGhost}
                  title="Copy password"
                >
                  {addCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-[11.5px] leading-relaxed text-[var(--la-faint)]">
                Share the password privately — the parent chooses their own at the first
                sign-in.
              </p>

              <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] p-3.5">
                <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--la-muted)]">
                  Children (optional)
                </p>
                <div className="mt-2.5 flex gap-2">
                  <input
                    value={addAdmission}
                    onChange={(e) => setAddAdmission(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        stageChild();
                      }
                    }}
                    className={input}
                    placeholder="Child's admission number"
                    aria-label="Child's admission number"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={stageChild}
                    className={btnGhost}
                    disabled={!addAdmission.trim()}
                  >
                    Add
                  </button>
                </div>
                {addChildren.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {addChildren.map((c) => (
                      <span key={c} className={childChip}>
                        {c}
                        <button
                          type="button"
                          onClick={() => unstageChild(c)}
                          className={childUnlinkBtn}
                          title={`Remove ${c} from the list`}
                          aria-label={`Remove admission number ${c}`}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {addNotice && (
                <p className="rounded-xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--la-danger-text)]">
                  {addNotice}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className={btnGhost}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={btnGold}
                  disabled={busy || !addName.trim() || !addEmail.trim()}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  Create account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
