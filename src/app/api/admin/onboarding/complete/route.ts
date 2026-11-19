import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, adminUsers } from "@/db/schema";
import { requireAdminApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/**
 * v2.9.9.0 — first-login onboarding completed.
 *
 * Called by the AdminOnboarding component when the cinematic welcome +
 * feature tour finishes (or is skipped). Stamps `admin_users.onboarded_at`
 * so the experience never replays for this account, and writes one audit
 * line for the trail. Idempotent — a second call simply re-stamps.
 */
export async function POST() {
  const session = await requireAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await ensureSchemaExtras();
    const now = new Date();
    await db
      .update(adminUsers)
      .set({ onboardedAt: now, updatedAt: now })
      .where(eq(adminUsers.id, session.id));
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "onboarding_completed",
      entity: "admin_user",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[onboarding/complete] failed:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
}
