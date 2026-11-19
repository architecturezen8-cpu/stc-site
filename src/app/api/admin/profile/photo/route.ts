import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { requireAdminApi } from "@/lib/admin-auth";
import { deleteAvatarBlob, storeAdminAvatar } from "@/lib/admin-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.87.0 — PRIVATE admin profile photo upload (the owner: the media
 * picker made every uploaded admin photo publicly reachable — "hamotama
 * balanna puluwan, eke kisima privacy ekak na").
 *
 * POST /api/admin/profile/photo — multipart/form-data, field `file`
 *   (JPG/PNG/WebP, 3 MB max). The bytes go to the storage layer under
 *   admin-avatars/ (never the public Media Library); the row keeps the
 *   storage key + a session-gated display URL. Replaces (and deletes) any
 *   previous private upload; a Google account picture stays untouched until
 *   the admin uploads over it.
 */
export async function POST(req: Request) {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureSchemaExtras();

  try {
    const form = await req.formData().catch(() => null);
    const fileEntry = form?.get("file");
    if (!form || !fileEntry || typeof fileEntry === "string") {
      return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
    }

    const [current] = await db
      .select({ avatarKey: adminUsers.avatarKey })
      .from(adminUsers)
      .where(eq(adminUsers.id, admin.id))
      .limit(1);

    const stored = await storeAdminAvatar(admin.id, fileEntry as File);
    if ("error" in stored) {
      return NextResponse.json({ error: stored.error }, { status: 400 });
    }

    await db
      .update(adminUsers)
      .set({
        avatarKey: stored.key,
        avatar: stored.displayUrl,
        updatedAt: new Date(),
      })
      .where(eq(adminUsers.id, admin.id));

    await deleteAvatarBlob(current?.avatarKey ?? null);

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_profile_photo",
      entity: "admin_user",
      entityId: String(admin.id),
      details: { private: true },
    });

    return NextResponse.json({ ok: true, avatar: stored.displayUrl }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not upload the photo. Try again." },
      { status: 500 },
    );
  }
}

/**
 * v2.9.15.6 — REMOVE the signed-in admin's private photo (the Photo
 * Studio's delete): the row's avatar + avatar_key clear and the blob is
 * really deleted (best-effort) + the storage ledger marked — the bytes
 * actually leave the bucket, nothing lingers as an orphan.
 */
export async function DELETE() {
  const admin = await requireAdminApi();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureSchemaExtras();

  try {
    const [current] = await db
      .select({ avatarKey: adminUsers.avatarKey })
      .from(adminUsers)
      .where(eq(adminUsers.id, admin.id))
      .limit(1);

    await db
      .update(adminUsers)
      .set({ avatarKey: null, avatar: null, updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    await deleteAvatarBlob(current?.avatarKey ?? null);

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "remove_profile_photo",
      entity: "admin_user",
      entityId: String(admin.id),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not remove the photo. Try again." },
      { status: 500 },
    );
  }
}
