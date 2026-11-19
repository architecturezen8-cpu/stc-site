import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { guardApi, createAdminUser } from "@/lib/admin-auth";
import {
  isAdminRole,
  roleLabel,
  validateFeatureGrant,
  MODULE_LABELS,
  type CustomPermissions,
} from "@/lib/admin-roles";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { publicOriginFromRequest } from "@/lib/supabase-auth";
import { mailerConfigured, sendAdminInviteEmail } from "@/lib/mailer";

/**
 * Invite a new admin — v2.9.10.4 rebuild. The Supabase service-role invite
 * (which needed SUPABASE_SERVICE_ROLE_KEY and silently 503-ed without it)
 * is replaced by the site's own chain: the account is minted passwordless
 * (exactly like the "Google login" type — identity matched by email at the
 * OAuth callback), then the sign-in brief MAILS ITSELF to the invitee via
 * the Mailjet mailer. The response also carries the login URL so the
 * inviting admin can copy it into WhatsApp when email is not the fastest
 * channel. If the mail provider is not configured the invite STILL
 * succeeds — the response says `emailed: false` and the UI hands over the
 * copy/share link instead. super_admin only; every invite is audited.
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
    | {
        name?: string;
        email?: string;
        role?: string;
        origin?: string;
        /** v2.9.12.0 — per-account feature checklist (role becomes "custom"). */
        features?: Record<string, string>;
      }
    | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";

  if (!name || name.length > 120) {
    return NextResponse.json({ error: "A name (max 120 chars) is required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  /* v2.9.12.0 — checklist invite. The email brief describes the exact
     feature list instead of a preset role label. */
  let features: CustomPermissions | undefined;
  let accessLabel: string;
  if (body?.features !== undefined) {
    const grant = validateFeatureGrant(body.features, session);
    if (!grant.ok) return NextResponse.json({ error: grant.error }, { status: 400 });
    features = grant.perms;
    const labels = Object.keys(grant.perms).map((m) => MODULE_LABELS[m as keyof typeof MODULE_LABELS]);
    accessLabel = labels.length <= 4 ? labels.join(", ") : `${labels.slice(0, 4).join(", ")} +${labels.length - 4} more`;
  } else {
    const role = body?.role ?? "";
    if (!isAdminRole(role)) {
      return NextResponse.json({ error: "Tick the features this account may use." }, { status: 400 });
    }
    accessLabel = roleLabel(role);
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
  // preview proxy the server-side Host headers only say localhost, which
  // would bake a dead link into the invite email (v2.8.28.1 lesson).
  const loginUrl = `${publicOriginFromRequest(request, body?.origin)}/admin/login`;

  // Passwordless Google identity — the invited person signs in with the
  // Google button; the OAuth callback matches this row by email. No
  // password exists, so password login is impossible until Reset adds one.
  const user = await createAdminUser({
    name,
    email,
    password: "",
    role: "",
    actorId: session.id,
    loginType: "google",
    features,
  });

  let emailed = false;
  if (mailerConfigured()) {
    emailed = await sendAdminInviteEmail({
      to: email,
      name,
      roleLabel: accessLabel,
      invitedByName: session.name || "a Super Admin",
      loginUrl,
    });
  }

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "admin_user_invited",
    entity: "admin_user",
    entityId: String(user.id),
    details: { emailed, loginUrl },
  });

  return NextResponse.json({
    success: true,
    invited: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    },
    inviteUrl: loginUrl,
    emailed,
  });
}
