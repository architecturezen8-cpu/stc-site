import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts, lmsPortalSessions } from "@/db/schema-lms";
import { guardApi } from "@/lib/admin-auth";
import { hashPortalPassword } from "@/lib/portal-auth";
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

/** Delete a portal account (and its sessions) permanently. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await guardApi("portal", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
  }

  const [target] = await db
    .select({ id: lmsPortalAccounts.id, email: lmsPortalAccounts.email, role: lmsPortalAccounts.role })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, id))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  await db.delete(lmsPortalSessions).where(eq(lmsPortalSessions.accountId, id));
  await db.delete(lmsPortalAccounts).where(eq(lmsPortalAccounts.id, id));

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "portal_user_deleted",
    entity: "lms_portal_account",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
