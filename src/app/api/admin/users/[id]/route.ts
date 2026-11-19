import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminSessions, adminUsers } from "@/db/schema";
import { guardApi, hashPassword } from "@/lib/admin-auth";
import {
  accessMapFor,
  isAdminRole,
  newlyGrantedModules,
  stringifyCustomPermissions,
  validateFeatureGrant,
  type CustomPermissions,
} from "@/lib/admin-roles";
import { ensureSchemaExtras } from "@/lib/schema-extras";

type Ctx = { params: Promise<{ id: string }> };

async function loadTarget(id: number) {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id)).limit(1);
  return user ?? null;
}

async function activeSuperCount(excludeId?: number) {
  const rows = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(
      excludeId
        ? and(eq(adminUsers.role, "super_admin"), eq(adminUsers.active, true), ne(adminUsers.id, excludeId))
        : and(eq(adminUsers.role, "super_admin"), eq(adminUsers.active, true)),
    );
  return rows.length;
}

/** Update an admin user: role, active flag, name or password. */
export async function PATCH(request: Request, ctx: Ctx) {
  const session = await guardApi("roles", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const actorIsSuper = session.role === "super_admin";
  const body = (await request.json().catch(() => null)) as
    | {
        role?: string;
        active?: boolean;
        name?: string;
        password?: string;
        /** v2.9.12.0 — per-account feature checklist (role becomes "custom"). */
        features?: Record<string, string>;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const patch: Partial<typeof adminUsers.$inferInsert> = { updatedAt: new Date() };

  /* v2.9.12.0 — per-account access editor. Saving a checklist converts the
     account to "custom" with exactly the ticked features (preset roles stay
     untouched when no checklist is sent). The main Super Admin's access is
     untouchable, and nobody can grant beyond their own level. */
  let grantedFeatures: CustomPermissions | undefined;
  if (body.features !== undefined) {
    if (id === session.id) {
      return NextResponse.json({ error: "You cannot change your own access." }, { status: 400 });
    }
    if (target.role === "super_admin") {
      return NextResponse.json(
        { error: "The main Super Admin's access is protected." },
        { status: 403 },
      );
    }
    const grant = validateFeatureGrant(body.features, session);
    if (!grant.ok) return NextResponse.json({ error: grant.error }, { status: 400 });
    grantedFeatures = grant.perms;
    patch.role = "custom";
    patch.permissions = stringifyCustomPermissions(grant.perms);
    /* v2.9.12.1 — NEW-ACCESS TOUR: diff what the account HELD (its own map
       for custom accounts, the preset matrix otherwise) against what it now
       holds; freshly granted/upgraded features queue a spotlight tour for
       the account's next visit (owner: "aluthin add karapu feature eka
       locate wela tour eke yanawa"). Overwrites any older pending tour. */
    const previous = accessMapFor(target.role, target.permissions);
    const fresh = newlyGrantedModules(previous, grant.perms);
    patch.pendingTour = fresh.length > 0 ? JSON.stringify(fresh.map((f) => ({ m: f.module, l: f.level }))) : null;
  }

  if (body.role !== undefined) {
    if (!isAdminRole(body.role)) {
      return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
    }
    if (id === session.id) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }
    // Only a super_admin may touch super_admin accounts or hand out super_admin.
    if (!actorIsSuper && (target.role === "super_admin" || body.role === "super_admin")) {
      return NextResponse.json(
        { error: "Only a Super Admin can manage Super Admin accounts." },
        { status: 403 },
      );
    }
    if (target.role === "super_admin" && body.role !== "super_admin" && target.active) {
      if ((await activeSuperCount(id)) === 0) {
        return NextResponse.json(
          { error: "At least one active Super Admin must remain." },
          { status: 400 },
        );
      }
    }
    patch.role = body.role;
  }

  if (body.active !== undefined) {
    if (id === session.id) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
    if (!actorIsSuper && target.role === "super_admin") {
      return NextResponse.json(
        { error: "Only a Super Admin can manage Super Admin accounts." },
        { status: 403 },
      );
    }
    if (!body.active && target.role === "super_admin" && target.active) {
      if ((await activeSuperCount(id)) === 0) {
        return NextResponse.json(
          { error: "At least one active Super Admin must remain." },
          { status: 400 },
        );
      }
    }
    patch.active = body.active;
    // Deactivation must kill live sessions immediately.
    if (body.active === false) {
      await db.delete(adminSessions).where(eq(adminSessions.userId, id));
    }
  }

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > 120) {
      return NextResponse.json({ error: "A name (max 120 chars) is required." }, { status: 400 });
    }
    patch.name = name;
  }

  if (body.password !== undefined) {
    if (body.password.length < 10) {
      return NextResponse.json(
        { error: "New password must contain at least 10 characters." },
        { status: 400 },
      );
    }
    if (!actorIsSuper && target.role === "super_admin") {
      return NextResponse.json(
        { error: "Only a Super Admin can reset a Super Admin password." },
        { status: 403 },
      );
    }
    patch.passwordHash = await hashPassword(body.password);
    // A password reset invalidates existing sessions too.
    await db.delete(adminSessions).where(eq(adminSessions.userId, id));
  }

  const [updated] = await db
    .update(adminUsers)
    .set(patch)
    .where(eq(adminUsers.id, id))
    .returning({
      id: adminUsers.id,
      role: adminUsers.role,
      active: adminUsers.active,
      name: adminUsers.name,
      permissions: adminUsers.permissions,
    });

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action:
      body.password !== undefined
        ? "admin_user_password_reset"
        : body.active !== undefined
          ? body.active
            ? "admin_user_enabled"
            : "admin_user_disabled"
          : grantedFeatures !== undefined
            ? "admin_user_access_changed"
            : "admin_user_role_changed",
    entity: "admin_user",
    entityId: String(id),
  });

  return NextResponse.json({ user: updated });
}

/** Delete an admin user (super_admin only). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const session = await guardApi("roles", "edit");
  if (session instanceof NextResponse) return session;
  if (session.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only a Super Admin can delete admin accounts." },
      { status: 403 },
    );
  }
  await ensureSchemaExtras();

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }
  if (id === session.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const target = await loadTarget(id);
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (target.role === "super_admin" && target.active && (await activeSuperCount(id)) === 0) {
    return NextResponse.json(
      { error: "At least one active Super Admin must remain." },
      { status: 400 },
    );
  }

  await db.delete(adminSessions).where(eq(adminSessions.userId, id));
  await db.delete(adminUsers).where(eq(adminUsers.id, id));
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "admin_user_deleted",
    entity: "admin_user",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
