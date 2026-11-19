import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import { deleteLmsAdminAvatarBlob, storeLmsAdminAvatar } from "@/lib/lms-admin-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    { error: "Sign in to the LMS Admin Studio first." },
    { status: 401 },
  );
}

/**
 * v2.9.15.0 — PRIVATE LMS-admin profile photo upload (mirrors the Admin
 * Studio's /api/admin/profile/photo v2.8.87.0 flow; LMS-admin sessions do
 * NOT pass requireAdminApi, so the guard here is getLmsAdminSession()).
 *
 * POST /api/lms-admin/profile/photo — multipart/form-data, field `file`
 *   (JPG/PNG/WebP, 3 MB max). The bytes go to the storage layer under
 *   lms-admin-avatars/ (never the public Media Library); the
 *   lms_portal_accounts row keeps the storage key (avatar_key) + a
 *   session-gated display URL. Replaces (and deletes) any previous
 *   private upload; a Google account picture stays untouched until the
 *   admin uploads over it.
 */
export async function POST(req: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();
  await ensureSchemaExtras();

  try {
    const form = await req.formData().catch(() => null);
    const fileEntry = form?.get("file");
    if (!form || !fileEntry || typeof fileEntry === "string") {
      return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
    }

    const [current] = await db
      .select({ avatarKey: lmsPortalAccounts.avatarKey })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, session.accountId))
      .limit(1);

    const stored = await storeLmsAdminAvatar(session.accountId, fileEntry as File);
    if ("error" in stored) {
      return NextResponse.json({ error: stored.error }, { status: 400 });
    }

    await db
      .update(lmsPortalAccounts)
      .set({
        avatarKey: stored.key,
        avatarUrl: stored.displayUrl,
      })
      .where(eq(lmsPortalAccounts.id, session.accountId));

    await deleteLmsAdminAvatarBlob(current?.avatarKey ?? null);

    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: "lms_admin_avatar_updated",
      entity: "lms_portal_account",
      entityId: String(session.accountId),
      details: { private: true },
    });

    return NextResponse.json({ ok: true, avatarUrl: stored.displayUrl }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not upload the photo. Try again." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/lms-admin/profile/photo — removes the private upload:
 * avatar_key back to null and avatar_url cleared too (the next Google
 * sign-in re-populates it through the clobber guard when the account
 * uses Google). The old blob is deleted best-effort; idempotent when no
 * custom photo exists.
 */
export async function DELETE() {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();
  await ensureSchemaExtras();

  try {
    const [current] = await db
      .select({ avatarKey: lmsPortalAccounts.avatarKey })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, session.accountId))
      .limit(1);
    if (!current?.avatarKey) {
      return NextResponse.json({ ok: true });
    }

    await db
      .update(lmsPortalAccounts)
      .set({ avatarKey: null, avatarUrl: null })
      .where(eq(lmsPortalAccounts.id, session.accountId));

    await deleteLmsAdminAvatarBlob(current.avatarKey);

    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: "lms_admin_avatar_removed",
      entity: "lms_portal_account",
      entityId: String(session.accountId),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not remove the photo. Try again." },
      { status: 500 },
    );
  }
}
