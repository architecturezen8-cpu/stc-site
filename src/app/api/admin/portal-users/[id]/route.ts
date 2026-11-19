import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts, lmsPortalSessions } from "@/db/schema-lms";
import { guardApi } from "@/lib/admin-auth";
import { hashPortalPassword } from "@/lib/portal-auth";
import {
  findPurgeCandidate,
  purgePortalAccountCompletely,
} from "@/lib/portal-account-purge";
import { ensureSchemaExtras } from "@/lib/schema-extras";

type Ctx = { params: Promise<{ id: string }> };

/** Update a portal account: pause/resume, rename or reset the password. */
export async function PATCH(request: Request, ctx: Ctx) {
  const session = await guardApi("portal", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
  }

  const [target] = await db
    .select()
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, id))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { active?: boolean; fullName?: string; password?: string }
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: Partial<typeof lmsPortalAccounts.$inferInsert> = {};

  if (body.active !== undefined) {
    patch.active = Boolean(body.active);
  }
  if (body.fullName !== undefined) {
    const name = body.fullName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) {
      return NextResponse.json({ error: "A name (2-120 chars) is required." }, { status: 400 });
    }
    patch.fullName = name;
  }
  if (body.password !== undefined) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must contain at least 8 characters." },
        { status: 400 },
      );
    }
    patch.passwordHash = await hashPortalPassword(body.password);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const [updated] = await db
    .update(lmsPortalAccounts)
    .set(patch)
    .where(eq(lmsPortalAccounts.id, id))
    .returning();

  // Pausing or resetting a password must end live sessions immediately.
  if (patch.active === false || patch.passwordHash) {
    await db
      .delete(lmsPortalSessions)
      .where(eq(lmsPortalSessions.accountId, id));
  }

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action:
      patch.active === false
        ? "portal_user_disabled"
        : patch.active === true
          ? "portal_user_enabled"
          : patch.passwordHash
            ? "portal_user_password_reset"
            : "portal_user_updated",
    entity: "lms_portal_account",
    entityId: String(id),
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      fullName: updated.fullName,
      active: updated.active,
    },
  });
}

/** Delete a portal account — the FULL purge (v2.9.15.10). The old version
 *  removed only the account row + sessions, leaving person rows pointing
 *  at a ghost id (the identity bridge then spawned duplicates — the
 *  "account corruption" the owner saw), parents as ghosts with orphaned
 *  child links, and the avatar blob sitting in the bucket forever. The
 *  shared purge engine releases person rows, drops parent ghosts + child
 *  links, deletes the avatar blob and marks the ledger, then removes the
 *  account row. lms_admin/principal accounts are refused — protected. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await guardApi("portal", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
  }

  const target = await findPurgeCandidate(id);
  if (!target) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const purged = await purgePortalAccountCompletely(target);
  if (!purged.ok) {
    return NextResponse.json({ error: purged.error }, { status: 403 });
  }

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "portal_user_deleted",
    entity: "lms_portal_account",
    entityId: String(id),
    details: {
      role: target.role,
      email: target.email,
      freedBlobs: purged.freedBlobs,
      purge: "full",
    },
  });

  return NextResponse.json({ ok: true, freedBlobs: purged.freedBlobs });
}
