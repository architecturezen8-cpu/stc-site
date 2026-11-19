import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { guardApi, createAdminUser } from "@/lib/admin-auth";
import { isAdminRole, validateFeatureGrant, type CustomPermissions } from "@/lib/admin-roles";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/** List every admin user (Role Management). v2.9.12.3 — view access can
 *  LOOK at the list; creating still demands edit. */
export async function GET() {
  const session = await guardApi("roles", "read");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const users = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      avatar: adminUsers.avatar,
      active: adminUsers.active,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
      authProvider: adminUsers.authProvider,
      permissions: adminUsers.permissions,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.id));

  return NextResponse.json({ users });
}

/**
 * Create an admin user. v2.9.10.0 — loginType "google" mints the account
 * from name + email + role ONLY (no password): the Google account holding
 * that email signs in with the Google button on the login page.
 */
export async function POST(request: Request) {
  const session = await guardApi("roles", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const actorIsSuper = session.role === "super_admin";
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        email?: string;
        role?: string;
        password?: string;
        loginType?: "password" | "google";
        /** v2.9.12.0 — per-account feature checklist (role becomes "custom"). */
        features?: Record<string, string>;
      }
    | null;

  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const loginType = body?.loginType === "google" ? "google" : "password";
  const password = body?.password ?? "";

  if (!name || name.length > 120) {
    return NextResponse.json({ error: "A name (max 120 chars) is required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  /* v2.9.12.0 — the feature checklist replaces the preset role dropdown.
     Validation enforces the owner's two rules: at least one feature ticked,
     and nobody can grant a level they do not hold themselves. */
  let features: CustomPermissions | undefined;
  if (body?.features !== undefined) {
    const grant = validateFeatureGrant(body.features, session);
    if (!grant.ok) return NextResponse.json({ error: grant.error }, { status: 400 });
    features = grant.perms;
  } else {
    const role = body?.role ?? "";
    if (!isAdminRole(role)) {
      return NextResponse.json({ error: "Tick the features this account may use." }, { status: 400 });
    }
    // Only a super_admin may mint another super_admin or an admin (user-manager).
    if ((role === "super_admin" || role === "admin") && !actorIsSuper) {
      return NextResponse.json(
        { error: "Only a Super Admin can create Super Admin or Admin accounts." },
        { status: 403 },
      );
    }
  }
  if (loginType === "password" && password.length < 10) {
    return NextResponse.json(
      { error: "Temporary password must contain at least 10 characters." },
      { status: 400 },
    );
  }

  const dup = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  if (dup.length > 0) {
    return NextResponse.json({ error: "That email already has an admin account." }, { status: 409 });
  }

  try {
    const user = await createAdminUser({
      name,
      email,
      password,
      role: "",
      actorId: session.id,
      loginType,
      features,
    });
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        permissions: user.permissions,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the user.";
    if (message.includes("duplicate key")) {
      return NextResponse.json({ error: "That email already has an admin account." }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
