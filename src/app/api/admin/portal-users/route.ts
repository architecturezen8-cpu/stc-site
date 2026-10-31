import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { guardApi } from "@/lib/admin-auth";
import { hashPortalPassword } from "@/lib/portal-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** List portal accounts (Student / Teacher / Parent / Principal) with an optional search. */
export async function GET(req: Request) {
  const denied = await guardApi("portal", "read");
  if (denied instanceof NextResponse) return denied;
  await ensureSchemaExtras();

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const base = db
    .select({
      id: lmsPortalAccounts.id,
      email: lmsPortalAccounts.email,
      role: lmsPortalAccounts.role,
      fullName: lmsPortalAccounts.fullName,
      avatarUrl: lmsPortalAccounts.avatarUrl,
      active: lmsPortalAccounts.active,
      status: lmsPortalAccounts.status,
      hasPassword: lmsPortalAccounts.passwordHash,
      lastLoginAt: lmsPortalAccounts.lastLoginAt,
      createdAt: lmsPortalAccounts.createdAt,
    })
    .from(lmsPortalAccounts);

  const rows = q
    ? await base
        .where(
          or(
            ilike(lmsPortalAccounts.email, `%${q}%`),
            ilike(lmsPortalAccounts.fullName, `%${q}%`),
            ilike(lmsPortalAccounts.role, `%${q}%`),
          ),
        )
        .orderBy(desc(lmsPortalAccounts.id))
        .limit(300)
    : await base.orderBy(desc(lmsPortalAccounts.id)).limit(300);

  return NextResponse.json({
    users: rows.map((row) => ({
      ...row,
      hasPassword: Boolean(row.hasPassword),
    })),
  });
}

/** Create a portal account with a temporary password (invite by hand). */
export async function POST(req: Request) {
  const session = await guardApi("portal", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as
    | { fullName?: string; email?: string; role?: string; password?: string }
    | null;

  const fullName = body?.fullName?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const role = body?.role ?? "";
  const password = body?.password ?? "";

  if (!fullName || fullName.length > 120) {
    return NextResponse.json({ error: "A full name is required." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  /* v2.8.35.0 — the site owner may also invite LMS ADMIN accounts here:
     role "lms_admin" signs in at the separate /lms-admin studio.
     v2.8.63.0 — role "principal" joins: the report-card certification
     portal at /principal. */
  const INVITABLE_ROLES = ["student", "teacher", "parent", "lms_admin", "principal"] as const;
  const roleLabel: Record<string, string> = {
    student: "Student",
    teacher: "Teacher",
    parent: "Parent",
    lms_admin: "LMS Admin",
    principal: "Principal",
  };
  if (!(INVITABLE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { error: "Choose Student, Teacher, Parent, LMS Admin or Principal." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must contain at least 8 characters." },
      { status: 400 },
    );
  }

  const dup = await db
    .select({ id: lmsPortalAccounts.id })
    .from(lmsPortalAccounts)
    .where(
      and(eq(lmsPortalAccounts.email, email), eq(lmsPortalAccounts.role, role)),
    )
    .limit(1);
  if (dup.length > 0) {
    return NextResponse.json(
      { error: "That email already has an account on this portal." },
      { status: 409 },
    );
  }

  try {
    const [created] = await db
      .insert(lmsPortalAccounts)
      .values({
        email,
        role,
        fullName,
        passwordHash: await hashPortalPassword(password),
        active: true,
        invitedBy: session.id,
      })
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "portal_user_created",
      entity: "lms_portal_account",
      entityId: String(created.id),
    });

    return NextResponse.json({ id: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the account.";
    if (message.includes("duplicate key")) {
      return NextResponse.json(
        { error: "That email already has an account on this portal." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
