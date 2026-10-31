import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { isAdminRole } from "@/lib/admin-roles";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  inviteSupabaseUser,
  publicOriginFromRequest,
  supabaseAdminConfigured,
} from "@/lib/supabase-auth";

/**
 * Invite a new admin — Phase 2.3. Supabase Auth emails the invite; when the
 * invitee accepts (link → /api/admin/auth/oauth/callback) the identity is
 * matched by email to the local role row created here, so they land with the
 * right role immediately. super_admin only; identity via Supabase, roles in
 * the app DB.
 */
export async function POST(request: Request) {
  const session = await guardApi("roles", "edit");
  if (session instanceof NextResponse) return session;
  if (session.role !== "super_admin") {
    return NextResponse.json(
      { error: "Only a Super Admin can invite new admins." },
      { status: 403 },
    );
  }
  await ensureSchemaExtras();

  const body = (await request.json().catch(() => null)) as
    | { name?: string; email?: string; role?: string; origin?: string }
    | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const role = body?.role ?? "";

  if (!name || name.length > 120) {
    return NextResponse.json({ error: "A name (max 120 chars) is required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!isAdminRole(role)) {
    return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  }
  if (!supabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase Auth keys are missing on the server — invites are disabled." },
      { status: 503 },
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

  // The inviting admin's browser reports the public origin — behind the
  // preview proxy the server-side Host headers only say localhost (v2.8.28.1),
  // which would bake a dead link into the invite email.
  const redirectTo = `${publicOriginFromRequest(request, body?.origin)}/api/admin/auth/oauth/callback`;
  const invited = await inviteSupabaseUser(email, redirectTo);
  if (!invited) {
    return NextResponse.json(
      {
        error:
          "Supabase did not accept the invite. Check Auth → URL Configuration (redirect allow-list) and the provider settings in the dashboard.",
      },
      { status: 502 },
    );
  }

  // Local role row, created up-front (no password: sign-in happens through
  // Supabase — Google or the invite link — so password login stays impossible
  // until a password is ever set for the account).
  const [user] = await db
    .insert(adminUsers)
    .values({
      name,
      email,
      passwordHash: "",
      role,
      authProvider: "supabase",
      supabaseUserId: invited.id ?? null,
    })
    .returning();
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "admin_user_invited",
    entity: "admin_user",
    entityId: String(user.id),
  });

  return NextResponse.json({
    success: true,
    invited: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
