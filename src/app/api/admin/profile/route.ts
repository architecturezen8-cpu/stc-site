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

/** Update the signed-in admin's name and/or avatar.
 *
 *  v2.8.87.0 — clearing the avatar ("Remove photo") also drops the PRIVATE
 *  upload's storage key and deletes its blob; setting a URL leaves the key
 *  untouched (only /api/admin/profile/photo manages private uploads). */
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

    let clearedKey: string | null = null;
    if (avatar === "") {
      const [current] = await db
        .select({ avatarKey: adminUsers.avatarKey })
        .from(adminUsers)
        .where(eq(adminUsers.id, admin.id))
        .limit(1);
      clearedKey = current?.avatarKey ?? null;
    }

    const [user] = await db
      .update(adminUsers)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(avatar !== undefined ? { avatar: avatar || null } : {}),
        ...(avatar === "" ? { avatarKey: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, admin.id))
      .returning({ id: adminUsers.id, name: adminUsers.name, avatar: adminUsers.avatar });

    if (clearedKey) {
      const { deleteAvatarBlob } = await import("@/lib/admin-avatar");
      await deleteAvatarBlob(clearedKey);
    }

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

/** Change the signed-in admin's password.
 *
 * v2.8.76.0 (owner ask: "google login wela gitiyoth mokada karanne") — the
 * dump-download gate demands the account's LOCAL password, and a Google
 * sign-in admin may not remember (or may never have used) it. A session
 * that was authenticated by Google is already proof of identity, so for
 * accounts whose LAST sign-in was Google the current-password check is
 * waived — they may SET the local password directly. Password-provider
 * accounts still must verify the current password. Both paths audited. */
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
      .select({ passwordHash: adminUsers.passwordHash, authProvider: adminUsers.authProvider })
      .from(adminUsers)
      .where(eq(adminUsers.id, admin.id))
      .limit(1);
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const googleSignedIn = user.authProvider === "google";
    if (!googleSignedIn) {
      if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
      }
    }

    await db
      .update(adminUsers)
      .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: googleSignedIn && !currentPassword ? "set_password_google" : "change_password",
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
