import { NextResponse } from "next/server";
import { applyPasswordAfterLogin } from "@/lib/portal-password-reset";
import { getPortalSessionForRequest, verifyPortalPassword } from "@/lib/portal-auth";
import { db } from "@/db";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.0 — the signed-in portal user chooses a NEW password.
 *
 * Two shapes:
 * - must_change_password = true (teacher-issued temp password): the new
 *   password alone is accepted — the temp one is already being replaced.
 * - voluntary change: the CURRENT password must be verified first.
 */
export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, status: "unauthorized" }, { status: 200 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const newPassword = body.newPassword || "";
  if (!newPassword) {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  try {
    const [account] = await db
      .select({
        mustChangePassword: lmsPortalAccounts.mustChangePassword,
        passwordHash: lmsPortalAccounts.passwordHash,
      })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, session.accountId))
      .limit(1);

    if (!account) {
      return NextResponse.json({ ok: false, status: "unauthorized" }, { status: 200 });
    }

    if (!account.mustChangePassword) {
      const current = body.currentPassword || "";
      if (!current || !account.passwordHash) {
        return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
      }
      if (!(await verifyPortalPassword(current, account.passwordHash))) {
        return NextResponse.json({ ok: false, status: "bad_current" }, { status: 200 });
      }
    }

    const result = await applyPasswordAfterLogin(session.accountId, newPassword);
    if (result.status !== "ok") {
      return NextResponse.json({ ok: false, status: result.status }, { status: 200 });
    }
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, status: "server_error" }, { status: 200 });
  }
}
