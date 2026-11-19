import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { guardApi, verifyPassword } from "@/lib/admin-auth";
import { verifyAdminOtp } from "@/lib/admin-otp";
import { getDumpBytes } from "@/lib/backup-store";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.75.0 — POST /api/admin/backup/download  { file, password }
 * Streams a dump out of the private store to the owner's browser
 * (super_admin only; name strictly validated; nothing else is reachable).
 *
 * v2.8.75.0 (owner ask): the downloader must RE-ENTER THEIR OWN ACCOUNT'S
 * PASSWORD — "naththan ona kenekta database eke data ganna puluwan, admin
 * browser eken log wela gitiyoth". The session alone is not enough; the
 * password is verified against admin_users.password_hash with the same
 * scrypt verifier the login uses. Both grant and denial are audited.
 *
 * v2.8.76.0 (owner ask): GOOGLE-LOGIN admins have no local password they
 * actually use — "google login wela gitiyoth mokada karanne". The same
 * body now also accepts { otp } — a 6-digit one-time code mailed to the
 * admin's own address (see download-challenge). Either proof unlocks the
 * stream; denials under BOTH paths are audited.
 */
export async function POST(req: Request) {
  const session = await guardApi("backup", "read");
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => null)) as {
    file?: unknown;
    password?: unknown;
    otp?: unknown;
  } | null;
  const file = typeof body?.file === "string" ? body.file : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const otp = typeof body?.otp === "string" ? body.otp : "";

  if (!/^stc-db-\d{4}-\d{2}-\d{2}\.dump$/.test(file)) {
    return NextResponse.json({ ok: false, error: "bad_file" }, { status: 400 });
  }
  if (!password && !otp) {
    return NextResponse.json({ ok: false, error: "password_required" }, { status: 400 });
  }

  await ensureSchemaExtras();
  const [user] = await db
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, session.id))
    .limit(1);

  const deny = async (status: number, error: string) => {
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "backup_dump_download_denied",
      entity: "db_backup_store",
      entityId: file.slice(0, 120),
      details: { method: otp && !password ? "otp" : "password", error },
    });
    return NextResponse.json({ ok: false, error }, { status });
  };

  if (otp && !password) {
    // v2.8.76.0 — the emailed-code path (the Google-login default).
    const verdict = await verifyAdminOtp({
      adminId: session.id,
      purpose: "backup_download",
      code: otp,
    });
    if (verdict.status === "expired") return deny(400, "code_expired");
    if (verdict.status === "too_many_attempts") return deny(429, "too_many_attempts");
    if (verdict.status !== "ok") return deny(401, "wrong_code");
  } else {
    // v2.8.75.0 — the original password path.
    // A missing hash is its own error ("no_password"): the dialog can then
    // point the admin at the emailed-code path instead of blaming the value.
    if (!user?.passwordHash) return deny(400, "no_password");
    if (!(await verifyPassword(password, user.passwordHash))) {
      return deny(401, "wrong_password");
    }
  }

  const bytes = await getDumpBytes(file);
  if (!bytes) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "backup_dump_download",
    entity: "db_backup_store",
    entityId: file.slice(0, 120),
    details: { method: otp && !password ? "otp" : "password" },
  });

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
