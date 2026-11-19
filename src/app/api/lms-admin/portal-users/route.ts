import { NextResponse } from "next/server";
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsParentChildren,
  lmsParents,
  lmsPasswordResets,
  lmsPortalAccounts,
  lmsPortalSessions,
  lmsStudents,
  lmsTeachers,
} from "@/db/schema-lms";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import { hashPortalPassword } from "@/lib/portal-auth";
import {
  ensureParentPerson,
  ensureStudentPersonByAdmissionNo,
} from "@/lib/lms-identity";
import {
  findPurgeCandidate,
  purgePortalAccountCompletely,
} from "@/lib/portal-account-purge";

export const dynamic = "force-dynamic";

/**
 * LMS ADMIN STUDIO → Portal users (v2.8.67.2, owner request).
 *
 * The owner asked for a section that shows EVERY account using the portal —
 * students, teachers, parents — WITHOUT passwords (emails are fine to show),
 * with a role filter, and a backup password-reset for TEACHERS only.
 * The website Admin Studio keeps its full account management; this endpoint
 * is the LMS team's read-mostly window plus that one emergency action.
 *
 * Privacy rules enforced here:
 *  · passwordHash is NEVER selected — only a hasPassword boolean.
 *  · v2.8.71.0 (owner item 3: "eke principal acc ekatai lms-admin ekaith
 *    enna one") — principal and lms_admin rows JOIN the roster so the
 *    studio sees the whole staff too; they stay read-only (the teacher
 *    backup reset remains the ONE write action).
 *  · v2.9.15.0 — "verified" is now HONEST: the manual verificationState
 *    column wins when the office set one ('verified' | 'unverified' |
 *    'guest'); otherwise it derives from the register snapshot's outcome
 *    (outcome === 'approved'). An account approved WITHOUT a register
 *    match carries verificationState='unverified' (see the approvals
 *    route) and shows UNVERIFIED — never a green shield.
 *  · v2.9.15.0 — soft delete: view=live (default) hides trashed rows,
 *    view=trash shows them; restore/purge travel the PATCH action lane.
 *    Trash/purge also sign every device out by clearing the sessions.
 *  · Parent rows carry their linked children (one join query for the
 *    whole page), so the studio can link/unlink without leaving.
 *  · A reset sets must_change_password so the teacher's very next sign-in
 *    bounces to /account/secure to choose a private password (same D.1
 *    behaviour as a teacher-issued student temp password).
 */

/* v2.8.71.0 — principal + lms_admin joined the roster (read-only). */
const PORTAL_ROLES = ["student", "teacher", "parent", "principal", "lms_admin"] as const;
const ROLE_FILTERS = ["all", ...PORTAL_ROLES] as const;

/* v2.9.15.0 — the office's manual classification vocabulary. */
const VERIFICATION_STATES = ["verified", "unverified", "guest"] as const;
type VerificationState = (typeof VERIFICATION_STATES)[number];

type EffectiveVerification = VerificationState | null;

function effectiveVerificationOf(
  state: string | null,
  registerMatched: boolean,
): EffectiveVerification {
  if (state === "verified" || state === "unverified" || state === "guest") return state;
  return registerMatched ? "verified" : null;
}

/** Parse the JSON verification snapshot; extract its registration outcome. */
function snapshotOutcome(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { outcome?: unknown };
    return typeof parsed.outcome === "string" ? parsed.outcome : null;
  } catch {
    return null;
  }
}

function unauthorized() {
  return NextResponse.json(
    { error: "Sign in to the LMS Admin Studio first." },
    { status: 401 },
  );
}

/**
 * List portal accounts (students / teachers / parents / principal / LMS admins) — safe columns.
 * view=live (default) → accounts not in the trash; view=trash → only trashed ones.
 */
export async function GET(request: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const role = url.searchParams.get("role") ?? "all";
    const view = url.searchParams.get("view") === "trash" ? "trash" : "live";
    if (!(ROLE_FILTERS as readonly string[]).includes(role)) {
      return NextResponse.json({ error: "Unknown role filter." }, { status: 400 });
    }

    const searchCondition = q
      ? or(
          ilike(lmsPortalAccounts.fullName, `%${q}%`),
          ilike(lmsPortalAccounts.email, `%${q}%`),
        )
      : undefined;

    const rows = await db
      .select({
        id: lmsPortalAccounts.id,
        email: lmsPortalAccounts.email,
        role: lmsPortalAccounts.role,
        fullName: lmsPortalAccounts.fullName,
        avatarUrl: lmsPortalAccounts.avatarUrl,
        active: lmsPortalAccounts.active,
        status: lmsPortalAccounts.status,
        hasPassword: sql<boolean>`(${lmsPortalAccounts.passwordHash} is not null)`,
        lastLoginAt: lmsPortalAccounts.lastLoginAt,
        createdAt: lmsPortalAccounts.createdAt,
        invitedBy: lmsPortalAccounts.invitedBy,
        /* v2.9.15.0 — raw verification materials; the honest derived flags
           are computed per row below. The snapshot itself never leaves the
           server (it holds phone numbers and parent names). */
        verification: lmsPortalAccounts.verification,
        verificationState: lmsPortalAccounts.verificationState,
        deletedAt: lmsPortalAccounts.deletedAt,
      })
      .from(lmsPortalAccounts)
      .where(
        and(
          inArray(lmsPortalAccounts.role, [...PORTAL_ROLES]),
          role === "all" ? undefined : eq(lmsPortalAccounts.role, role),
          view === "trash"
            ? isNotNull(lmsPortalAccounts.deletedAt)
            : isNull(lmsPortalAccounts.deletedAt),
          searchCondition,
        ),
      )
      .orderBy(desc(lmsPortalAccounts.id))
      .limit(500);

    /* v2.9.15.0 — children for parent accounts: ONE join query for the
       whole page (lms_parents.account_id → lms_parent_children → lms_students). */
    const parentAccountIds = rows
      .filter((row) => row.role === "parent")
      .map((row) => row.id);
    const childrenByAccount = new Map<
      number,
      { studentId: number; fullName: string; admissionNo: string }[]
    >();
    if (parentAccountIds.length > 0) {
      const links = await db
        .select({
          accountId: lmsParents.accountId,
          studentId: lmsStudents.id,
          fullName: lmsStudents.fullName,
          admissionNo: lmsStudents.admissionNo,
        })
        .from(lmsParentChildren)
        .innerJoin(lmsParents, eq(lmsParentChildren.parentId, lmsParents.id))
        .innerJoin(lmsStudents, eq(lmsParentChildren.studentId, lmsStudents.id))
        .where(inArray(lmsParents.accountId, parentAccountIds));
      for (const link of links) {
        const list = childrenByAccount.get(link.accountId) ?? [];
        list.push({
          studentId: link.studentId,
          fullName: link.fullName,
          admissionNo: link.admissionNo,
        });
        childrenByAccount.set(link.accountId, list);
      }
    }

    const users = rows.map((row) => {
      const registerMatched = snapshotOutcome(row.verification) === "approved";
      const effectiveVerification = effectiveVerificationOf(
        row.verificationState,
        registerMatched,
      );
      return {
        id: row.id,
        email: row.email,
        role: row.role,
        fullName: row.fullName,
        avatarUrl: row.avatarUrl,
        active: row.active,
        status: row.status,
        hasPassword: row.hasPassword,
        lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        invitedBy: row.invitedBy,
        verificationState: row.verificationState,
        registerMatched,
        effectiveVerification,
        /* Honest convenience flag: only a manual 'verified' or a register
           match counts as verified. */
        verified: effectiveVerification === "verified",
        deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        children: row.role === "parent" ? (childrenByAccount.get(row.id) ?? []) : undefined,
      };
    });

    return NextResponse.json({ view, users });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load portal accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * v2.9.15.2 — create a parent portal account (owner: "ethanath e option eeka
 * thiyala parent kenek acc eka hadaddi ethanata dammoth hodai ne" — the
 * children link belongs on the account-creation form itself, not only on
 * the row afterwards).
 *
 * POST { fullName, email, password, admissionNos?: string[] }
 *
 *  · role is always "parent" — teachers/students self-register from the
 *    registers, and staff accounts stay with the website Admin Studio.
 *  · password required: the office generates it, shares it privately, and
 *    must_change_password bounces the parent to /account/secure on their
 *    first sign-in so the shared password never becomes the permanent one.
 *  · admissionNos (optional, ≤20): EVERY child is linked in the SAME
 *    request through the same register bridge the children route uses
 *    (ensureStudentPersonByAdmissionNo + ensureParentPerson) — no more
 *    one-child-per-modal rounds. Per-child results come back so a rejected
 *    number can be fixed without losing the rest.
 *  · Audited: portal_user_created + one portal_child_linked per link.
 */
export async function POST(request: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          fullName?: unknown;
          email?: unknown;
          password?: unknown;
          admissionNos?: unknown;
        }
      | null;

    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const admissionNos = Array.isArray(body?.admissionNos)
      ? (body.admissionNos as unknown[])
          .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
          .map((a) => a.trim())
          .slice(0, 20)
      : [];

    if (!fullName || fullName.length > 120) {
      return NextResponse.json(
        { error: "A full name (max 120 characters) is required." },
        { status: 400 },
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters — share it privately." },
        { status: 400 },
      );
    }

    const [dup] = await db
      .select({ id: lmsPortalAccounts.id })
      .from(lmsPortalAccounts)
      .where(and(eq(lmsPortalAccounts.email, email), eq(lmsPortalAccounts.role, "parent")))
      .limit(1);
    if (dup) {
      return NextResponse.json(
        { error: "That email already has a parent account." },
        { status: 409 },
      );
    }

    const [created] = await db
      .insert(lmsPortalAccounts)
      .values({
        email,
        role: "parent",
        fullName,
        passwordHash: await hashPortalPassword(password),
        active: true,
        status: "active",
        invitedBy: session.accountId,
        mustChangePassword: true,
      })
      .returning({ id: lmsPortalAccounts.id, fullName: lmsPortalAccounts.fullName });

    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: "portal_user_created",
      entity: "lms_portal_account",
      entityId: String(created.id),
      details: { email, role: "parent", by: "lms-admin-studio" },
    });

    /* Link every staged child in the same request. One bad admission
       number never sinks the account or the other children. */
    const linked: { admissionNo: string; fullName: string; alreadyLinked: boolean }[] = [];
    const failed: { admissionNo: string; error: string }[] = [];
    if (admissionNos.length > 0) {
      const parent = await ensureParentPerson(created.id);
      if (!parent) {
        /* Account exists; only the links failed — the office can still
           link them from the row afterwards, so report honestly. */
        for (const admissionNo of admissionNos) {
          failed.push({ admissionNo, error: "parent_record_failed" });
        }
      } else {
        for (const admissionNo of admissionNos) {
          const child = await ensureStudentPersonByAdmissionNo(admissionNo, null);
          if (!child) {
            failed.push({ admissionNo, error: "admission_not_found" });
            continue;
          }
          const [existing] = await db
            .select({ id: lmsParentChildren.id })
            .from(lmsParentChildren)
            .where(
              and(
                eq(lmsParentChildren.parentId, parent.id),
                eq(lmsParentChildren.studentId, child.id),
              ),
            )
            .limit(1);
          if (!existing) {
            await db
              .insert(lmsParentChildren)
              .values({ parentId: parent.id, studentId: child.id })
              .onConflictDoNothing();
            await db.insert(adminAuditLogs).values({
              userId: session.accountId,
              action: "portal_child_linked",
              entity: "lms_portal_account",
              entityId: String(created.id),
              details: { accountId: created.id, studentId: child.id, admissionNo: child.admissionNo },
            });
          }
          linked.push({
            admissionNo: child.admissionNo,
            fullName: child.fullName,
            alreadyLinked: Boolean(existing),
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      fullName: created.fullName,
      linked,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the account.";
    if (message.includes("duplicate key")) {
      return NextResponse.json(
        { error: "That email already has a parent account." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Account writes (v2.9.15.0) — one route, action-keyed:
 *
 *  · { id, password }                                   → teacher backup reset (legacy path, unchanged).
 *  · { id, action: "set-status", verificationState }    → manual classification: 'verified' | 'unverified' | 'guest' | null (auto). Classification only — sessions stay.
 *  · { id, action: "set-email", email }                 → change the login email (teacher/parent/principal/lms_admin only; students follow the admission no). Signs out every device.
 *  · { id, action: "trash" }                            → soft delete: deleted_at=now + every device signed out. LMS admins and the caller's own account are refused.
 *  · { id, action: "restore" }                          → back out of the trash.
 *  · { id, action: "purge" }                            → permanent delete (trash only): sessions, reset codes and the account row go; the person rows survive with account_id cleared for re-linking.
 */
export async function PATCH(request: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          id?: unknown;
          password?: unknown;
          action?: unknown;
          verificationState?: unknown;
          email?: unknown;
        }
      | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
    }

    const action = typeof body.action === "string" ? body.action : "";

    /* ── Legacy + primary path: the teacher backup password reset ─────────
       Keyed on { id, password } exactly as before (no action field), so the
       studio's reset modal keeps working untouched. */
    if (!action) {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 8 || password.length > 128) {
        return NextResponse.json(
          { error: "Password must be 8-128 characters." },
          { status: 400 },
        );
      }

      const [target] = await db
        .select({ id: lmsPortalAccounts.id, role: lmsPortalAccounts.role })
        .from(lmsPortalAccounts)
        .where(eq(lmsPortalAccounts.id, id))
        .limit(1);
      if (!target || target.role !== "teacher") {
        return NextResponse.json(
          { error: "Only teacher passwords can be reset from the LMS Admin Studio." },
          { status: 403 },
        );
      }

      await db
        .update(lmsPortalAccounts)
        .set({
          passwordHash: await hashPortalPassword(password),
          mustChangePassword: true,
          /* lastLoginAt deliberately untouched — a reset is not a sign-in. */
        })
        .where(eq(lmsPortalAccounts.id, id));

      /* Sign out EVERY device — a reset with a live session would be pointless. */
      await db.delete(lmsPortalSessions).where(eq(lmsPortalSessions.accountId, id));

      await db.insert(adminAuditLogs).values({
        userId: session.accountId,
        action: "portal_teacher_password_reset",
        entity: "lms_portal_account",
        entityId: String(id),
      });

      return NextResponse.json({ ok: true });
    }

    /* ── Action-based writes — load the target once ─────────────────────── */
    const [target] = await db
      .select({
        id: lmsPortalAccounts.id,
        email: lmsPortalAccounts.email,
        role: lmsPortalAccounts.role,
        fullName: lmsPortalAccounts.fullName,
        deletedAt: lmsPortalAccounts.deletedAt,
      })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, id))
      .limit(1);
    if (!target) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const audit = (name: string, details?: Record<string, unknown>) =>
      db.insert(adminAuditLogs).values({
        userId: session.accountId,
        action: name,
        entity: "lms_portal_account",
        entityId: String(id),
        ...(details ? { details } : {}),
      });

    if (action === "set-status") {
      /* Classification only — sessions are NOT killed; the account keeps
         working exactly as before, only the badge changes. */
      if (target.deletedAt) {
        return NextResponse.json(
          { error: "That account is in the trash — restore it first." },
          { status: 400 },
        );
      }
      const raw = body.verificationState;
      const state =
        raw === null || raw === undefined || raw === ""
          ? null
          : typeof raw === "string" && (VERIFICATION_STATES as readonly string[]).includes(raw)
            ? (raw as VerificationState)
            : null;
      if (raw !== null && raw !== undefined && raw !== "" && state === null) {
        return NextResponse.json(
          { error: "verificationState must be 'verified', 'unverified', 'guest' or null." },
          { status: 400 },
        );
      }
      await db
        .update(lmsPortalAccounts)
        .set({ verificationState: state })
        .where(eq(lmsPortalAccounts.id, id));
      await audit("portal_verification_state", { id, state });
      return NextResponse.json({ ok: true });
    }

    if (action === "set-email") {
      /* Students sign in with adm-…@portal.stcmatale.lk built from their
         admission number — the office edits that on the registers page,
         not here. */
      if (!(["teacher", "parent", "principal", "lms_admin"] as readonly string[]).includes(target.role)) {
        return NextResponse.json(
          {
            error: "student_email_follows_admission",
            message:
              "A student's login email follows the admission number — the office edits it on the registers page.",
          },
          { status: 400 },
        );
      }
      if (target.deletedAt) {
        return NextResponse.json(
          { error: "That account is in the trash — restore it first." },
          { status: 400 },
        );
      }
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email || email.length > 180 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
        return NextResponse.json(
          { error: "Enter a valid email address (up to 180 characters)." },
          { status: 400 },
        );
      }
      /* (email, role) is the composite unique — one holder per role. */
      const [dupe] = await db
        .select({ id: lmsPortalAccounts.id })
        .from(lmsPortalAccounts)
        .where(
          and(
            eq(lmsPortalAccounts.email, email),
            eq(lmsPortalAccounts.role, target.role),
            ne(lmsPortalAccounts.id, id),
          ),
        )
        .limit(1);
      if (dupe) {
        return NextResponse.json(
          { error: "Another account with this role already uses that email." },
          { status: 409 },
        );
      }
      await db.update(lmsPortalAccounts).set({ email }).where(eq(lmsPortalAccounts.id, id));
      /* The old email may be signed in somewhere — sign every device out. */
      await db.delete(lmsPortalSessions).where(eq(lmsPortalSessions.accountId, id));
      await audit("portal_user_email_changed", { id, from: target.email, to: email });
      return NextResponse.json({ ok: true });
    }

    if (action === "trash") {
      if (target.role === "lms_admin" || target.role === "principal") {
        return NextResponse.json(
          { error: "LMS admin and principal accounts are protected — they cannot be moved to the trash." },
          { status: 403 },
        );
      }
      if (target.id === session.accountId) {
        return NextResponse.json(
          { error: "You cannot move your own account to the trash." },
          { status: 403 },
        );
      }
      if (target.deletedAt) {
        return NextResponse.json(
          { error: "That account is already in the trash." },
          { status: 400 },
        );
      }
      await db
        .update(lmsPortalAccounts)
        .set({ deletedAt: new Date() })
        .where(eq(lmsPortalAccounts.id, id));
      /* They will be signed out immediately — a trashed account must not
         keep live sessions. */
      await db.delete(lmsPortalSessions).where(eq(lmsPortalSessions.accountId, id));
      await audit("portal_user_trashed", { id, role: target.role, email: target.email });
      return NextResponse.json({ ok: true });
    }

    if (action === "restore") {
      if (!target.deletedAt) {
        return NextResponse.json(
          { error: "That account is not in the trash." },
          { status: 400 },
        );
      }
      await db
        .update(lmsPortalAccounts)
        .set({ deletedAt: null })
        .where(eq(lmsPortalAccounts.id, id));
      await audit("portal_user_restored", { id, role: target.role });
      return NextResponse.json({ ok: true });
    }

    if (action === "purge") {
      if (target.role === "lms_admin" || target.role === "principal") {
        return NextResponse.json(
          { error: "LMS admin and principal accounts are protected — they can never be deleted." },
          { status: 403 },
        );
      }
      if (!target.deletedAt) {
        return NextResponse.json(
          { error: "Only accounts already in the trash can be deleted permanently." },
          { status: 400 },
        );
      }
      /* v2.9.15.10 — the shared FULL purge engine: sessions + reset tokens,
         person rows released (register data survives), parent ghosts +
         child links dropped, the avatar blob really deleted + ledger rows
         marked, then the account row. Nothing is left to corrupt the
         identity bridge or the storage numbers (owner: "storage ekenuth
         ain karanna storage use karala thiyanawa ewath"). */
      const candidate = await findPurgeCandidate(id);
      const purged = candidate ? await purgePortalAccountCompletely(candidate) : { ok: false as const, error: "Account not found." };
      if (!purged.ok) {
        return NextResponse.json({ error: purged.error }, { status: 403 });
      }
      await audit("portal_user_purged", {
        id,
        role: target.role,
        email: target.email,
        fullName: target.fullName,
        freedBlobs: purged.freedBlobs,
        purge: "full",
      });
      return NextResponse.json({ ok: true, freedBlobs: purged.freedBlobs });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update the account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
