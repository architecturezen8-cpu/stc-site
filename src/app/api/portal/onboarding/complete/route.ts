import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts, lmsPortalSessions } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getPortalSessionForRequest, LEGACY_PORTAL_COOKIE } from "@/lib/portal-auth";
import { LMS_ADMIN_SESSION_COOKIE } from "@/lib/lms-admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.9.15.6 — stamp the first-login onboarding flag for EVERY portal role
 * (the owner: "aluthin acc ekak create karala ena kenekta cinematic tour
 * ekak ... parents,teachers,principal,lms-admin,student portal walatath
 * danna").
 *
 * POST /api/portal/onboarding/complete — called by the portal onboarding
 * island when the tour finishes OR is skipped (fire-and-forget with
 * keepalive, exactly like the admin studio's own onboarding/complete).
 *
 * Accepts BOTH worlds, because one person can hold either:
 *   · a live portal session (student / teacher / parent / principal);
 *   · a live lms-admin session (stc_lmsadmin_session, or the legacy shared
 *     cookie carrying an lms_admin row).
 * Self-scoped + idempotent: only the caller's own account row is stamped.
 */
async function resolveLmsAdminAccountId(): Promise<number | null> {
  const jar = await cookies();
  const token =
    jar.get(LMS_ADMIN_SESSION_COOKIE)?.value ?? jar.get(LEGACY_PORTAL_COOKIE)?.value ?? "";
  if (token.length < 16) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await db
    .select({ accountId: lmsPortalSessions.accountId })
    .from(lmsPortalSessions)
    .innerJoin(lmsPortalAccounts, eq(lmsPortalAccounts.id, lmsPortalSessions.accountId))
    .where(eq(lmsPortalSessions.tokenHash, tokenHash))
    .limit(1);
  return row?.accountId ?? null;
}

export async function POST(req: Request) {
  await ensureSchemaExtras();

  const portalSession = await getPortalSessionForRequest(req);
  const accountId = portalSession?.accountId ?? (await resolveLmsAdminAccountId());
  if (!accountId) {
    return NextResponse.json(
      { ok: false, error: "Sign in first." },
      { status: 401 },
    );
  }

  try {
    const now = new Date();
    await db
      .update(lmsPortalAccounts)
      .set({ onboardedAt: now })
      .where(eq(lmsPortalAccounts.id, accountId));

    /* Audit (best-effort) — the admin log stays the project's single
       action trail; portal self-actions use dedicated action names. */
    try {
      await db.insert(adminAuditLogs).values({
        userId: null,
        action: "portal_onboarding_completed",
        entity: "lms_portal_account",
        entityId: String(accountId),
        details: { role: portalSession?.role ?? "lms_admin" },
      });
    } catch {
      /* audit must never block the stamp */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the onboarding state." },
      { status: 500 },
    );
  }
}
