import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminSessions, adminUsers } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { can, type AdminModule } from "@/lib/admin-roles";

const scrypt = promisify(scryptCb);
export const ADMIN_COOKIE = "stc_admin_session";
const COOKIE = ADMIN_COOKIE;
const SESSION_DAYS = 14;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, digest] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function adminSetupAvailable() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminUsers);
  return count === 0;
}

export async function createFirstAdmin({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}) {
  if (!(await adminSetupAvailable())) throw new Error("Admin setup is already complete.");
  if (password.length < 10) throw new Error("Password must contain at least 10 characters.");
  const [user] = await db
    .insert(adminUsers)
    .values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role: "super_admin",
    })
    .returning();
  await db.insert(adminAuditLogs).values({
    userId: user.id,
    action: "first_admin_created",
    entity: "admin_user",
    entityId: String(user.id),
  });
  return user;
}

export async function createAdminSession(userId: number) {
  const { token, expiresAt } = await createAdminSessionRow(userId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Creates an admin session row and RETURNS the raw token so route handlers
 * can attach the cookie to their own redirect response (required for the
 * Google OAuth 303 hop, same pattern as the portal flow).
 */
export async function createAdminSessionRow(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const headerStore = await headers();
  await db.insert(adminSessions).values({
    userId,
    tokenHash: tokenHash(token),
    expiresAt,
    userAgent: headerStore.get("user-agent"),
  });
  return { token, expiresAt };
}

export const adminSessionCookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  expires: expiresAt,
});

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  // Guarantees late-added columns (e.g. admin_users.avatar) exist before the
  // session query runs — memoised, so it is a no-op after the first call.
  await ensureSchemaExtras();

  const [result] = await db
    .select({
      sessionId: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      avatar: adminUsers.avatar,
      active: adminUsers.active,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash(token)),
        gt(adminSessions.expiresAt, new Date()),
        eq(adminUsers.active, true),
      ),
    )
    .limit(1);

  if (!result) return null;
  return result;
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function requireAdminApi() {
  const session = await getAdminSession();
  if (!session) return null;
  return session;
}

/**
 * Page guard with role enforcement (Phase 2.3). Unauthenticated → login;
 * authenticated without the required level → dashboard with a denial note.
 */
export async function requirePermission(module: AdminModule, level: "read" | "edit") {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!can(session.role, module, level)) redirect(`/admin?denied=${module}`);
  return session;
}

/**
 * API guard with role enforcement. Returns the session when allowed, or a
 * ready-to-return 401/403 JSON response:
 *   const denied = await guardApi("news", "edit"); if (denied) return denied;
 */
export async function guardApi(module: AdminModule, level: "read" | "edit") {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(session.role, module, level)) {
    return NextResponse.json(
      { error: "You do not have permission to perform this action." },
      { status: 403 },
    );
  }
  return session;
}

export async function loginAdmin(email: string, password: string) {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }
  await db
    .update(adminUsers)
    .set({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
      // Reflect how this account LAST signed in (profile page shows it).
      authProvider: "password",
    })
    .where(eq(adminUsers.id, user.id));
  await createAdminSession(user.id);
  await db.insert(adminAuditLogs).values({
    userId: user.id,
    action: "login",
    entity: "admin_session",
  });
  return user;
}

/** Result shapes for the Google admin sign-in callback. */
export type AdminGoogleLoginResult =
  | { status: "ok"; user: typeof adminUsers.$inferSelect }
  | { status: "not_admin" }
  | { status: "inactive" };

/**
 * Signs an admin in through their verified Google identity. The email MUST
 * already exist in admin_users — Google never mints admin accounts; it only
 * authenticates existing ones. The account's auth_provider + avatar are
 * refreshed so the profile page reflects "Signed in with Google".
 */
export async function loginAdminViaGoogle(identity: {
  email: string;
  fullName: string;
  avatarUrl: string | null;
}): Promise<AdminGoogleLoginResult> {
  const [user] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, identity.email.trim().toLowerCase()))
    .limit(1);

  // Constant-ish delay to blunt timing probes on unknown emails.
  await new Promise((resolve) => setTimeout(resolve, 120));

  if (!user) return { status: "not_admin" };
  if (!user.active) return { status: "inactive" };

  const [updated] = await db
    .update(adminUsers)
    .set({
      authProvider: "google",
      avatar: identity.avatarUrl ?? user.avatar,
      name: user.name || identity.fullName,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(adminUsers.id, user.id))
    .returning();

  await db.insert(adminAuditLogs).values({
    userId: user.id,
    action: "login_google",
    entity: "admin_session",
  });
  return { status: "ok", user: updated ?? user };
}

export async function createAdminUser({
  name,
  email,
  password,
  role,
  actorId,
}: {
  name: string;
  email: string;
  password: string;
  role: string;
  actorId: number;
}) {
  if (password.length < 10) throw new Error("Password must contain at least 10 characters.");
  const [user] = await db
    .insert(adminUsers)
    .values({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role,
    })
    .returning();
  await db.insert(adminAuditLogs).values({
    userId: actorId,
    action: "admin_user_created",
    entity: "admin_user",
    entityId: String(user.id),
  });
  return user;
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (token) {
    await db
      .delete(adminSessions)
      .where(eq(adminSessions.tokenHash, tokenHash(token)));
  }
  cookieStore.delete(COOKIE);
}
