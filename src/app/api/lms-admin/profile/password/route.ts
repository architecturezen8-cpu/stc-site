import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import { hashPortalPassword, verifyPortalPassword } from "@/lib/portal-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.8 — LMS ADMIN PASSWORD CHANGE ON THE PROFILE
   (owner: "dan google login nathuwan nomal email ekai password ekai dala
   log unama acc eke password eka change karanna ba ne student,lms-admin,
   teachers,principal,parent portal wala").

   The studio had NO way at all to change its own password — the setup
   screen set it once at creation and that was final. This route brings
   the portal's v2.8.67.0 flow to the studio:

     · password sign-in → the CURRENT password is verified first, then
       the new one is hashed with the same scrypt pipeline.
     · Google-only account → rejected with google_only (the UI shows the
       honest note instead of the form).
     · min 10 characters — the same rule the studio's own setup screen
       (v2.8.40.0) enforces, so no password gets weaker than the one the
       admin chose at creation.
   ──────────────────────────────────────────────────────────────────────── */

function json(status: string, code: number) {
  return NextResponse.json({ ok: false, status }, { status: code });
}

export async function POST(req: Request) {
  const session = await getLmsAdminSession();
  if (!session) return json("unauthorized", 401);

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json("bad_request", 400);
  }

  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!current || !newPassword) return json("bad_request", 400);

  await ensureSchemaExtras();

  try {
    const [account] = await db
      .select({ passwordHash: lmsPortalAccounts.passwordHash })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, session.accountId))
      .limit(1);
    if (!account) return json("unauthorized", 401);

    /* A Google-only studio account has no password of ours to change —
       the profile shows the honest note instead of this form. */
    if (!account.passwordHash) return json("google_only", 400);

    if (!(await verifyPortalPassword(current, account.passwordHash))) {
      return json("bad_current", 400);
    }

    /* Same bounds as createFirstLmsAdmin (v2.8.40.0): 10..128 characters. */
    if (newPassword.length < 10 || newPassword.length > 128) {
      return json("bad_password", 400);
    }

    await db
      .update(lmsPortalAccounts)
      .set({
        passwordHash: await hashPortalPassword(newPassword),
        mustChangePassword: false,
      })
      .where(eq(lmsPortalAccounts.id, session.accountId));

    await db.insert(adminAuditLogs).values({
      userId: null,
      action: "lms_admin_password_changed",
      entity: "lms_portal_account",
      entityId: String(session.accountId),
      details: { via: "lms_admin_profile" },
    });

    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return json("server_error", 500);
  }
}
