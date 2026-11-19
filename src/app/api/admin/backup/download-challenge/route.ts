import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { issueAdminOtp } from "@/lib/admin-otp";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.76.0 — download-challenge (the Google-login side of the dump gate).
 *
 * GET  → which verification modes the signed-in admin has:
 *        { hasPassword, email }. The dialog renders the password field
 *        when a local password exists and always offers the emailed code.
 * POST → mails a 6-digit one-time code to the admin's OWN address
 *        (10 min TTL, 3 codes / 10 min, 5 wrong attempts). The owner's
 *        "google login wela gitiyoth mokada karanne" — a Google session
 *        re-proves itself through the mailbox instead of a password.
 *
 * Both are super_admin-only (same guard as the download itself) and the
 * send is audited. The email shown is the session user's own — nothing
 * about OTHER accounts is ever revealed.
 */
export async function GET() {
  const session = await guardApi("backup", "read");
  if (session instanceof NextResponse) return session;

  await ensureSchemaExtras();
  const [user] = await db
    .select({ email: adminUsers.email, passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.id))
    .limit(1);

  return NextResponse.json({
    ok: true,
    hasPassword: Boolean(user?.passwordHash),
    email: user?.email ?? session.email,
  });
}

export async function POST(req: Request) {
  const session = await guardApi("backup", "read");
  if (session instanceof NextResponse) return session;

  await ensureSchemaExtras();
  const [user] = await db
    .select({ email: adminUsers.email })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.id))
    .limit(1);
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");

  const result = await issueAdminOtp({
    adminId: session.id,
    purpose: "backup_download",
    email: user.email,
    ip,
  });

  if (result.status === "rate_limited") {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }
  if (result.status === "mail_failed") {
    return NextResponse.json(
      { ok: false, error: "mail_failed" },
      { status: 502 },
    );
  }

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "backup_download_code_sent",
    entity: "db_backup_store",
    entityId: String(session.id),
    details: { purpose: "backup_download" },
  });

  return NextResponse.json({
    ok: true,
    sentTo: user.email,
    // Sandbox QA only — never ships to Vercel (NODE_ENV=production there).
    ...(result.devCode ? { devCode: result.devCode } : {}),
  });
}
