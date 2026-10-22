import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts, lmsPortalSessions } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  LEGACY_PORTAL_COOKIE,
  createPortalSessionRow,
  hashPortalPassword,
  portalSessionCookieOptions,
  verifyPortalPassword,
} from "@/lib/portal-auth";
import { guardApi } from "@/lib/admin-auth";

/**
 * LMS ADMIN STUDIO (v2.8.35.0) — the back office for the school's LMS team,
 * deliberately SEPARATE from the website Admin Studio.
 *
 * Module isolation rule (owner decision): /admin manages the WEBSITE only.
 * LMS operations — registration approvals, verification registers, class /
 * subject / teaching / enrollment setup — belong to a dedicated team that
 * signs in at /lms-admin with its own accounts.
 *
 * Identity model: lms_portal_accounts rows with role = "lms_admin". The
 * composite (email, role) unique index lets one Google identity be a
 * student/teacher/parent AND an LMS admin at once; sessions reuse the
 * portal session table + stc_portal_session cookie (one active portal at a
 * time, same as student ↔ teacher switching today). The student/teacher/
 * parent portal guards ignore lms_admin rows, and this guard ignores
 * student/teacher/parent rows — the two worlds cannot see each other.
 */

const LMS_ADMIN_ROLE = "lms_admin";
const SESSION_DAYS = 7;

/* v2.8.37.1 — the LMS Admin Studio owns its OWN session cookie, separate
   from the student/teacher/parent portal cookies. Signing out of the
   studio can no longer end a portal session (and vice versa). The old
   shared cookie still opens the studio when it happens to hold an
   lms_admin session — pre-existing logins survive the switch. */
export const LMS_ADMIN_SESSION_COOKIE = "stc_lmsadmin_session";
export const LMS_ADMIN_LEGACY_COOKIE = LEGACY_PORTAL_COOKIE;
export const LMS_ADMIN_VERIFIER_COOKIE = "stc_lmsadmin_pkce";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type LmsAdminSession = {
  accountId: number;
  email: string;
  fullName: string;
  avatarUrl: string | null;
};

export async function getLmsAdminSession(): Promise<LmsAdminSession | null> {
  const cookieStore = await cookies();
  await ensureSchemaExtras();

  const [row] = await db
    .select({
      accountId: lmsPortalAccounts.id,
      email: lmsPortalAccounts.email,
      fullName: lmsPortalAccounts.fullName,
      avatarUrl: lmsPortalAccounts.avatarUrl,
      status: lmsPortalAccounts.status,
    })
    .from(lmsPortalSessions)
    .innerJoin(lmsPortalAccounts, eq(lmsPortalSessions.accountId, lmsPortalAccounts.id))
    .where(
      and(
        eq(
          lmsPortalSessions.tokenHash,
          tokenHash(
            cookieStore.get(LMS_ADMIN_SESSION_COOKIE)?.value ??
              cookieStore.get(LMS_ADMIN_LEGACY_COOKIE)?.value ??
              "",
          ),
        ),
        gt(lmsPortalSessions.expiresAt, new Date()),
        eq(lmsPortalAccounts.active, true),
        eq(lmsPortalAccounts.role, LMS_ADMIN_ROLE),
      ),
    )
    .limit(1);

  if (!row || row.status !== "active") return null;
  return {
    accountId: row.accountId,
    email: row.email,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
  };
}

/** Page guard — unauthenticated or non-LMS-admin sessions go to the login. */
export async function requireLmsAdmin() {
  const session = await getLmsAdminSession();
  if (!session) redirect("/lms-admin/login");
  return session;
}

/**
 * Shared-API dual guard used by the LMS back-office endpoints. Allows
 * EITHER a website admin with the "portal" module permission (legacy path,
 * kept for the owner's super_admin convenience) OR an LMS admin session.
 *
 * Returns a NORMALIZED authority so every call site keeps working unchanged
 * (`session.id` feeds admin_audit_logs.user_id for both worlds — that
 * column has no FK, and the action name tells the two actors apart):
 *   via "site_admin" → id = admin_users.id
 *   via "lms_admin"  → id = lms_portal_accounts.id
 */
export type PortalAuthority = {
  id: number;
  name: string;
  email: string;
  via: "site_admin" | "lms_admin";
};

export async function guardPortalOrLmsAdmin(
  level: "read" | "edit" = "read",
): Promise<PortalAuthority | NextResponse> {
  const adminResult = await guardApi("portal", level);
  if (!(adminResult instanceof NextResponse)) {
    return {
      id: adminResult.id,
      name: adminResult.name,
      email: adminResult.email,
      via: "site_admin",
    };
  }

  const lmsAdmin = await getLmsAdminSession();
  if (lmsAdmin) {
    return {
      id: lmsAdmin.accountId,
      name: lmsAdmin.fullName,
      email: lmsAdmin.email,
      via: "lms_admin",
    };
  }

  return adminResult;
}

/* ── One-time bootstrap ────────────────────────────────────────────────── */

/**
 * TRUE only while ZERO lms_admin accounts exist. The /lms-admin/setup
 * screen closes permanently after the first account is created — after
 * that, new LMS admins come from Admin → Portal Users (site owner) or by
 * adding rows to lms_portal_accounts directly.
 */
export async function lmsAdminSetupAvailable(): Promise<boolean> {
  await ensureSchemaExtras();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.role, LMS_ADMIN_ROLE));
  return count === 0;
}

export async function createFirstLmsAdmin({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}) {
  if (!(await lmsAdminSetupAvailable())) {
    throw new Error("LMS admin setup is already complete.");
  }
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
    cleanEmail.length > 180 ||
    password.length < 10 ||
    password.length > 128 ||
    cleanName.length < 2
  ) {
    throw new Error("Please check the name, email and password (min 10 characters).");
  }

  const [account] = await db
    .insert(lmsPortalAccounts)
    .values({
      role: LMS_ADMIN_ROLE,
      email: cleanEmail,
      fullName: cleanName,
      passwordHash: await hashPortalPassword(password),
      active: true,
      status: "active",
    })
    .returning({ id: lmsPortalAccounts.id });
  return account;
}

/* ── Password sign-in ──────────────────────────────────────────────────── */

export type LmsAdminLoginResult =
  | { status: "ok"; accountId: number }
  | { status: "no_account" | "no_password" | "bad_password" | "inactive" | "pending" };

export async function loginLmsAdminWithPassword(
  email: string,
  password: string,
): Promise<LmsAdminLoginResult> {
  await ensureSchemaExtras();
  const [account] = await db
    .select()
    .from(lmsPortalAccounts)
    .where(
      and(
        eq(lmsPortalAccounts.email, email.trim().toLowerCase()),
        eq(lmsPortalAccounts.role, LMS_ADMIN_ROLE),
      ),
    )
    .limit(1);

  // Constant-ish delay to blunt timing probes on unknown accounts.
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (!account) return { status: "no_account" };
  if (!account.active) return { status: "inactive" };
  if (account.status !== "active") return { status: "pending" };
  if (!account.passwordHash) return { status: "no_password" };
  if (!(await verifyPortalPassword(password, account.passwordHash))) {
    return { status: "bad_password" };
  }

  await db
    .update(lmsPortalAccounts)
    .set({ lastLoginAt: new Date() })
    .where(eq(lmsPortalAccounts.id, account.id));

  return { status: "ok", accountId: account.id };
}

/* ── Google sign-in ────────────────────────────────────────────────────── */

/**
 * Google NEVER mints LMS admin accounts — it only authenticates an
 * existing active lms_admin row. Returns null when the email holds no
 * usable LMS admin account.
 */
export async function loginLmsAdminViaSupabase(identity: {
  email: string;
  supabaseUserId: string;
  fullName: string;
  avatarUrl: string | null;
}): Promise<{ accountId: number } | null> {
  await ensureSchemaExtras();
  const [account] = await db
    .select()
    .from(lmsPortalAccounts)
    .where(
      and(
        eq(lmsPortalAccounts.email, identity.email.trim().toLowerCase()),
        eq(lmsPortalAccounts.role, LMS_ADMIN_ROLE),
      ),
    )
    .limit(1);

  await new Promise((resolve) => setTimeout(resolve, 120));

  if (!account || !account.active || account.status !== "active") return null;

  await db
    .update(lmsPortalAccounts)
    .set({
      supabaseUserId: identity.supabaseUserId,
      fullName: identity.fullName || account.fullName,
      avatarUrl: identity.avatarUrl ?? account.avatarUrl,
      lastLoginAt: new Date(),
    })
    .where(eq(lmsPortalAccounts.id, account.id));

  return { accountId: account.id };
}

/* ── Profile (v2.8.40.0) ────────────────────────────────────────────────── */

export type LmsAdminProfileSession = {
  id: number;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  current: boolean;
};

export type LmsAdminProfile = {
  accountId: number;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  /** "google" = the account has NO password (Google-only sign-in). */
  loginMethod: "google" | "password";
  googleConnected: boolean;
  sessions: LmsAdminProfileSession[];
};

/** Hash of the studio session cookie presented with the CURRENT request. */
export async function currentLmsAdminTokenHash(): Promise<string> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(LMS_ADMIN_SESSION_COOKIE)?.value ??
    cookieStore.get(LMS_ADMIN_LEGACY_COOKIE)?.value ??
    "";
  return tokenHash(token);
}

/**
 * Full profile for the Profile page: identity, how the admin signs in
 * (Google vs email + password), the last login time, and every live
 * session (device) still signed in — the current one flagged.
 */
export async function getLmsAdminProfile(
  accountId: number,
  currentTokenHash: string,
): Promise<LmsAdminProfile | null> {
  await ensureSchemaExtras();
  const [account] = await db
    .select({
      id: lmsPortalAccounts.id,
      email: lmsPortalAccounts.email,
      fullName: lmsPortalAccounts.fullName,
      avatarUrl: lmsPortalAccounts.avatarUrl,
      lastLoginAt: lmsPortalAccounts.lastLoginAt,
      passwordHash: lmsPortalAccounts.passwordHash,
      supabaseUserId: lmsPortalAccounts.supabaseUserId,
    })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, accountId))
    .limit(1);
  if (!account) return null;

  const rows = await db
    .select({
      id: lmsPortalSessions.id,
      tokenHash: lmsPortalSessions.tokenHash,
      userAgent: lmsPortalSessions.userAgent,
      createdAt: lmsPortalSessions.createdAt,
      expiresAt: lmsPortalSessions.expiresAt,
    })
    .from(lmsPortalSessions)
    .where(
      and(
        eq(lmsPortalSessions.accountId, accountId),
        gt(lmsPortalSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(lmsPortalSessions.createdAt));

  return {
    accountId: account.id,
    email: account.email,
    fullName: account.fullName,
    avatarUrl: account.avatarUrl,
    lastLoginAt: account.lastLoginAt,
    loginMethod: account.passwordHash ? "password" : "google",
    googleConnected: !!account.supabaseUserId,
    sessions: rows.map((row) => ({
      id: row.id,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      current: row.tokenHash === currentTokenHash,
    })),
  };
}

/** Signs every OTHER device out of the studio; the current session stays. */
export async function revokeOtherLmsAdminSessions(
  accountId: number,
  currentTokenHash: string,
): Promise<number> {
  await ensureSchemaExtras();
  const removed = await db
    .delete(lmsPortalSessions)
    .where(
      and(
        eq(lmsPortalSessions.accountId, accountId),
        ne(lmsPortalSessions.tokenHash, currentTokenHash),
      ),
    )
    .returning({ id: lmsPortalSessions.id });
  return removed.length;
}

/* ── Session helpers (re-exported for the route handlers) ──────────────── */

export {
  createPortalSessionRow as createLmsAdminSessionRow,
  portalSessionCookieOptions as lmsAdminSessionCookieOptions,
};

/** Deletes the session row backing the presented studio cookie (if any). */
export async function destroyLmsAdminSessionByToken(token: string | undefined | null) {
  if (!token) return;
  await ensureSchemaExtras();
  await db
    .delete(lmsPortalSessions)
    .where(eq(lmsPortalSessions.tokenHash, tokenHash(token)));
}

/** TRUE when the presented legacy token opens an ACTIVE lms_admin session. */
export async function legacyTokenHoldsLmsAdmin(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  await ensureSchemaExtras();
  const [row] = await db
    .select({ id: lmsPortalSessions.id })
    .from(lmsPortalSessions)
    .innerJoin(lmsPortalAccounts, eq(lmsPortalSessions.accountId, lmsPortalAccounts.id))
    .where(
      and(
        eq(lmsPortalSessions.tokenHash, tokenHash(token)),
        gt(lmsPortalSessions.expiresAt, new Date()),
        eq(lmsPortalAccounts.active, true),
        eq(lmsPortalAccounts.role, LMS_ADMIN_ROLE),
      ),
    )
    .limit(1);
  return !!row;
}
