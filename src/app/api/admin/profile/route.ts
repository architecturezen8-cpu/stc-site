import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { hashPassword, requireAdminApi, verifyPassword } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Current admin profile — email, role, avatar, timestamps. */
export async function GET() {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureSchemaExtras();
  const [user] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      avatar: adminUsers.avatar,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.id))
    .limit(1);
  return NextResponse.json({ profile: user });
}

/** Update the signed-in admin's name and/or avatar. */
export async function PATCH(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    const avatar = typeof body.avatar === "string" ? body.avatar.trim() : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    }

    const [user] = await db
      .update(adminUsers)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(avatar !== undefined ? { avatar: avatar || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, admin.id))
      .returning({ id: adminUsers.id, name: adminUsers.name, avatar: adminUsers.avatar });

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_profile",
      entity: "admin_user",
      entityId: String(admin.id),
      details: { name: user.name, avatar: user.avatar },
    });

    return NextResponse.json({ profile: user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the profile." },
      { status: 400 },
    );
  }
}

/** Change the signed-in admin's password (current password required). */
export async function PUT(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (newPassword.length < 10) {
      return NextResponse.json(
        { error: "New password must contain at least 10 characters." },
        { status: 400 },
      );
    }

    const [user] = await db
      .select({ passwordHash: adminUsers.passwordHash })
      .from(adminUsers)
      .where(eq(adminUsers.id, admin.id))
      .limit(1);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    await db
      .update(adminUsers)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "change_password",
      entity: "admin_user",
      entityId: String(admin.id),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to change the password." },
      { status: 400 },
    );
  }
}
