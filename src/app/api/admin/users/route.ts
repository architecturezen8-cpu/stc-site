import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { guardApi, createAdminUser } from "@/lib/admin-auth";
import { isAdminRole } from "@/lib/admin-roles";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/** List every admin user (Role Management — super_admin/admin only). */
export async function GET() {
  const session = await guardApi("roles", "edit");
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
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.id));

  return NextResponse.json({ users });
}

/** Create an admin user with a temporary password. */
export async function POST(request: Request) {
  const session = await guardApi("roles", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const actorIsSuper = session.role === "super_admin";
  const body = (await request.json().catch(() => null)) as
    | { name?: string; email?: string; role?: string; password?: string }
    | null;

  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const role = body?.role ?? "";
  const password = body?.password ?? "";

  if (!name || name.length > 120) {
    return NextResponse.json({ error: "A name (max 120 chars) is required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!isAdminRole(role)) {
    return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  }
  // Only a super_admin may mint another super_admin or an admin (user-manager).
  if ((role === "super_admin" || role === "admin") && !actorIsSuper) {
    return NextResponse.json(
      { error: "Only a Super Admin can create Super Admin or Admin accounts." },
      { status: 403 },
    );
  }
  if (password.length < 10) {
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
    const user = await createAdminUser({ name, email, password, role, actorId: session.id });
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the user.";
    if (message.includes("duplicate key")) {
      return NextResponse.json({ error: "That email already has an admin account." }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
