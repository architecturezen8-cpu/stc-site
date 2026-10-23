import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsPortalAccounts,
  lmsPortalSessions,
  type LmsPortalRole,
} from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

const scrypt = promisify(scryptCb);

/* ── Cookies ─────────────────────────────────────────────────────────────
   v2.8.37.1 — EVERY portal owns its own session cookie, so signing out of
   one portal can never touch another (owner bug report: logging out of
   lms-admin killed the student/teacher/parent sessions too, because all
   four doors shared the one `stc_portal_session` cookie).

     student  → stc_student_session
     teacher  → stc_teacher_session
     parent   → stc_parent_session
     lmsadmin → stc_lmsadmin_session (see lms-admin-auth.ts)

   The old shared cookie (`stc_portal_session`) is kept as a READ-ONLY
   fallback so accounts signed in before this change stay signed in — the
   role must match, and logout clears it for the matching role only. */
export const LEGACY_PORTAL_COOKIE = "stc_portal_session";
const PORTAL_ROLE_COOKIES: Record<LmsPortalRole, string> = {
  student: "stc_student_session",
  teacher: "stc_teacher_session",
  parent: "stc_parent_session",
};

export function portalCookieName(role: LmsPortalRole): string {
  return PORTAL_ROLE_COOKIES[role];
}

export const OAUTH_VERIFIER_COOKIE = "stc_portal_pkce";
export const OAUTH_ROLE_COOKIE = "stc_portal_role";
export const OAUTH_CHOICE_COOKIE = "stc_portal_oauth_choice";
const SESSION_DAYS = 7;

const PORTAL_ROLES = ["student", "teacher", "parent"] as const;

export function isPortalRole(value: string | null | undefined): value is LmsPortalRole {
  return !!value && (PORTAL_ROLES as readonly string[]).includes(value);
}

export const PORTAL_HOME: Record<LmsPortalRole, string> = {
  student: "/student",
  teacher: "/teacher",
  parent: "/parent",
};

export const PORTAL_LABEL: Record<LmsPortalRole, string> = {
  student: "Student",
  teacher: "Teacher",
  parent: "Parent",
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/* ── Account lookup ─────────────────────────────────────────────────── */

/**
 * Every ACTIVE portal row for one email identity, ordered for a stable
 * chooser. Invite-only model: rows are created by the school office, never
 * auto-provisioned on a Google sign-in.
 */
export async function findPortalAccountsByEmail(email: string) {
  await ensureSchemaExtras();
  const rows = await db
    .select()
    .from(lmsPortalAccounts)
    .where(
      and(
        eq(lmsPortalAccounts.email, email.trim().toLowerCase()),
        eq(lmsPortalAccounts.active, true),
      ),
    )
    .orderBy(asc(lmsPortalAccounts.id));
  return rows.filter((row) => isPortalRole(row.role));
}

/* ── Password hashing ────────────────────────────────────────────────────
   Portal rows store `scrypt$salt$key` (dollar-separated). The colon variant
   is accepted for compatibility with admin-style hashes. NULL hash means
   the account is Google-only. */

export async function hashPortalPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password.normalize("NFKC"), salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPortalPassword(password: string, stored: string) {
  const separator = stored.includes("$") ? "$" : ":";
  const [algorithm, salt, digest] = stored.split(separator);
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const derived = (await scrypt(password.normalize("NFKC"), salt, 64)) as Buffer;
  const expected = Buffer.from(digest, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/* ── Sessions ──────────────────────────────────────────────────────────── */

/**
 * Creates a portal session row and RETURNS the raw token — the caller is
 * responsible for setting the cookie on its own response object (attaching
 * cookies directly to the outgoing response is what makes OAuth redirects
 * keep their session across the 303 hop).
 */
export async function createPortalSessionRow(accountId: number) {
  await ensureSchemaExtras();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const headerStore = await headers();
  await db.insert(lmsPortalSessions).values({
    accountId,
    tokenHash: tokenHash(token),
    expiresAt,
    userAgent: headerStore.get("user-agent"),
  });
  return { token, expiresAt };
}

export const portalSessionCookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires: expiresAt,
});

export async function getPortalSession(role?: LmsPortalRole) {
  const cookieStore = await cookies();
  return resolvePortalSession(cookieStore, role);
}

/**
 * v2.8.52.0 — REQUEST-scoped session resolution with an explicit role hint.
 *
 * WHY: one browser may legitimately hold TWO live portal cookies at once
 * (per-role cookies since v2.8.37.1 — the owner tests student + teacher
 * side by side). The role-agnostic read resolves STUDENT-first, so a
 * teacher island's fetch silently landed as the student: the teacher's
 * reply was SAVED AS THE STUDENT'S MESSAGE ("teacher message ekak snd
 * karath studentge name ekane watenne") and read receipts never fired.
 *
 * The client islands now send `x-portal-role: student|teacher` with every
 * fetch; this helper resolves ONLY that role's cookie. The hint cannot
 * escalate anything — it just picks which cookie to read, and every
 * authorization check still runs against the resolved account.
 */
export async function getPortalSessionForRequest(
  req: Request,
  allowed?: readonly LmsPortalRole[],
): Promise<Awaited<ReturnType<typeof getPortalSession>>> {
  const hint = req.headers.get("x-portal-role");
  if (
    (hint === "student" || hint === "teacher" || hint === "parent") &&
    (!allowed || allowed.includes(hint))
  ) {
    return getPortalSession(hint);
  }
  return getPortalSession();
}

type SessionRow = {
  accountId: number;
  email: string;
  role: string;
  fullName: string;
  avatarUrl: string | null;
  status: string | null;
};

/** Token → live session row (role-agnostic; expires/active checks inside). */
async function resolveSessionByToken(token: string | undefined | null): Promise<SessionRow | null> {
  if (!token) return null;
  const [row] = await db
    .select({
      accountId: lmsPortalAccounts.id,
      email: lmsPortalAccounts.email,
      role: lmsPortalAccounts.role,
      fullName: lmsPortalAccounts.fullName,
      avatarUrl: lmsPortalAccounts.avatarUrl,
      status: lmsPortalAccounts.status,
    })
    .from(lmsPortalSessions)
    .innerJoin(lmsPortalAccounts, eq(lmsPortalSessions.accountId, lmsPortalAccounts.id))
    .where(
      and(
        eq(lmsPortalSessions.tokenHash, tokenHash(token)),
        gt(lmsPortalSessions.expiresAt, new Date()),
        eq(lmsPortalAccounts.active, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

function shapeSession(row: SessionRow) {
  if (!isPortalRole(row.role) || row.status === "pending") return null;
  return { ...row, role: row.role as LmsPortalRole };
}

/**
 * The shared session resolver behind getPortalSession (RSC + route
 * handlers). Role-scoped when a role is given — ONLY that role's cookie
 * (plus the legacy shared cookie when it carries the same role);
 * otherwise the first live student/teacher/parent cookie wins, with
 * lms_admin rows never counting as a portal session.
 */
async function resolvePortalSession(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  role?: LmsPortalRole,
) {
  await ensureSchemaExtras();

  if (role) {
    const own = await resolveSessionByToken(cookieStore.get(portalCookieName(role))?.value);
    if (own && own.role === role) return shapeSession(own);
    const legacy = await resolveSessionByToken(cookieStore.get(LEGACY_PORTAL_COOKIE)?.value);
    if (legacy && legacy.role === role) return shapeSession(legacy);
    return null;
  }

  for (const r of PORTAL_ROLES) {
    const session = await resolveSessionByToken(cookieStore.get(PORTAL_ROLE_COOKIES[r])?.value);
    if (session && session.role === r) return shapeSession(session);
  }
  const legacy = await resolveSessionByToken(cookieStore.get(LEGACY_PORTAL_COOKIE)?.value);
  if (legacy && isPortalRole(legacy.role)) return shapeSession(legacy);
  return null;
}

export async function requirePortal(role: LmsPortalRole) {
  const session = await getPortalSession(role);
  if (!session) redirect("/login");
  if (session.role !== role) redirect(PORTAL_HOME[session.role]);
  return session;
}

/** Deletes the session row for the presented token (if any). */
export async function destroyPortalSessionByToken(token: string | undefined | null) {
  if (!token) return;
  await ensureSchemaExtras();
  await db
    .delete(lmsPortalSessions)
    .where(eq(lmsPortalSessions.tokenHash, tokenHash(token)));
}

/**
 * Logout for ONE portal: destroys that role's session row, plus any legacy
 * shared-cookie session ONLY when it belongs to the same role (so an old
 * login can't resurrect after sign-out). Returns the cookie names to clear.
 */
export async function destroyPortalSessionForRole(
  role: LmsPortalRole,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): Promise<string[]> {
  const cleared: string[] = [];
  const ownToken = cookieStore.get(portalCookieName(role))?.value;
  if (ownToken) {
    await destroyPortalSessionByToken(ownToken);
    cleared.push(portalCookieName(role));
  }

  const legacyToken = cookieStore.get(LEGACY_PORTAL_COOKIE)?.value;
  if (legacyToken) {
    const legacy = await resolveSessionByToken(legacyToken);
    if (!legacy || legacy.role === role) {
      await destroyPortalSessionByToken(legacyToken);
      cleared.push(LEGACY_PORTAL_COOKIE);
    }
  }
  return cleared;
}

/* ── Identity provisioning on Google sign-in ───────────────────────────── */

/**
 * Refreshes the Supabase identity (id / name / avatar) on every matching
 * active row and returns them sorted by role for stable chooser order.
 * Invite-only: an email with zero rows is NOT auto-provisioned.
 */
export async function loginPortalViaSupabase(identity: {
  email: string;
  supabaseUserId: string;
  fullName: string;
  avatarUrl: string | null;
}) {
  const accounts = await findPortalAccountsByEmail(identity.email);
  if (accounts.length === 0) return [];

  await Promise.all(
    accounts.map((account) =>
      db
        .update(lmsPortalAccounts)
        .set({
          supabaseUserId: identity.supabaseUserId,
          fullName: identity.fullName || account.fullName,
          avatarUrl: identity.avatarUrl ?? account.avatarUrl,
          lastLoginAt: new Date(),
        })
        .where(eq(lmsPortalAccounts.id, account.id)),
    ),
  );

  const roleOrder: LmsPortalRole[] = ["student", "teacher", "parent"];
  return [...accounts].sort(
    (a, b) =>
      roleOrder.indexOf(a.role as LmsPortalRole) -
      roleOrder.indexOf(b.role as LmsPortalRole),
  );
}

/* ── Self-registration ─────────────────────────────────────────────────── */

export type RegisterResult =
  | { status: "ok"; accountId: number }
  | { status: "pending"; accountId: number }
  | { status: "exists" }
  | { status: "invalid" };

/**
 * Creates a portal account from the public register form.
 *
 * v2.8.33.0 — verification-aware: the caller matches the submitted details
 * against the office registers first and passes the outcome in. Fully
 * verified registrations are ACTIVE immediately; anything else is stored as
 * PENDING (the office approves or rejects it in Admin → Registration
 * Approvals) and no session is issued for it. One email may register once
 * per role — the (email, role) unique index enforces the same rule.
 */
export async function registerPortalAccount({
  role,
  email,
  password,
  fullName,
  status = "active",
  verification = null,
}: {
  role: LmsPortalRole;
  email: string;
  password: string;
  fullName: string;
  status?: "active" | "pending";
  verification?: string | null;
}): Promise<RegisterResult> {
  await ensureSchemaExtras();
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim().replace(/\s+/g, " ").slice(0, 120);
  if (
    !isPortalRole(role) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
    cleanEmail.length > 180 ||
    password.length < 8 ||
    password.length > 128 ||
    cleanName.length < 2
  ) {
    return { status: "invalid" };
  }

  const existing = await findPortalAccountsByEmail(cleanEmail);
  if (existing.some((row) => row.role === role)) {
    return { status: "exists" };
  }

  const [created] = await db
    .insert(lmsPortalAccounts)
    .values({
      role,
      email: cleanEmail,
      fullName: cleanName,
      passwordHash: await hashPortalPassword(password),
      active: true,
      status,
      verification,
    })
    .returning({ id: lmsPortalAccounts.id });

  return { status: status === "pending" ? "pending" : "ok", accountId: created.id };
}

/* ── Email + password sign-in ──────────────────────────────────────────── */

export type PasswordLoginResult =
  | { status: "ok"; redirect: string; accountId: number }
  | { status: "wrong_role"; otherRole: LmsPortalRole }
  | {
      status:
        | "no_account"
        | "no_password"
        | "bad_password"
        | "inactive"
        | "pending";
    };

export async function loginPortalWithPassword(
  role: LmsPortalRole,
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  const accounts = await findPortalAccountsByEmail(email.trim().toLowerCase());
  const account = accounts.find((row) => row.role === role);

  // Constant-ish delay to blunt timing probes on unknown accounts.
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (!account) {
    /* The email may belong to a DIFFERENT portal. Verify the password
       against those rows before revealing anything — only a correct
       password earns the "wrong portal" hint plus the one-tap switch. */
    for (const row of accounts) {
      if (!row.active || !row.passwordHash || row.role === role) continue;
      if (await verifyPortalPassword(password, row.passwordHash)) {
        return { status: "wrong_role", otherRole: row.role as LmsPortalRole };
      }
    }
    return { status: "no_account" };
  }
  if (!account.active) return { status: "inactive" };
  if (account.status === "pending") return { status: "pending" };
  if (!account.passwordHash) return { status: "no_password" };
  if (!(await verifyPortalPassword(password, account.passwordHash))) {
    return { status: "bad_password" };
  }

  await db
    .update(lmsPortalAccounts)
    .set({ lastLoginAt: new Date() })
    .where(eq(lmsPortalAccounts.id, account.id));

  return { status: "ok", redirect: PORTAL_HOME[role], accountId: account.id };
}
