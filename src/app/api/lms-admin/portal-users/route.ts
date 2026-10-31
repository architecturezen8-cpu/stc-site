import { NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts, lmsPortalSessions } from "@/db/schema-lms";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import { hashPortalPassword } from "@/lib/portal-auth";

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
 *  · "verified" = the sign-up details matched the school register
 *    (lms_portal_accounts.verification snapshot exists).
 *  · A reset sets must_change_password so the teacher's very next sign-in
 *    bounces to /account/secure to choose a private password (same D.1
 *    behaviour as a teacher-issued student temp password), and EVERY live
 *    session row is deleted so all devices are signed out.
 */

/* v2.8.71.0 — principal + lms_admin joined the roster (read-only). */
const PORTAL_ROLES = ["student", "teacher", "parent", "principal", "lms_admin"] as const;
const ROLE_FILTERS = ["all", ...PORTAL_ROLES] as const;

function unauthorized() {
  return NextResponse.json(
    { error: "Sign in to the LMS Admin Studio first." },
    { status: 401 },
  );
}

/** List portal accounts (students / teachers / parents / principal / LMS admins) — safe columns. */
export async function GET(request: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();

  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const role = url.searchParams.get("role") ?? "all";
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
        verified: sql<boolean>`(${lmsPortalAccounts.verification} is not null)`,
      })
      .from(lmsPortalAccounts)
      .where(
        and(
          inArray(lmsPortalAccounts.role, [...PORTAL_ROLES]),
          role === "all" ? undefined : eq(lmsPortalAccounts.role, role),
          searchCondition,
        ),
      )
      .orderBy(desc(lmsPortalAccounts.id))
      .limit(500);

    return NextResponse.json({ users: rows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load portal accounts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * BACKUP password reset — TEACHERS only. The LMS team can issue a new
 * password when a teacher is locked out; the teacher then chooses their own
 * at the next sign-in (must_change_password → /account/secure, D.1 flow).
 */
export async function PATCH(request: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; password?: unknown }
      | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
    }

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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to reset the password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
