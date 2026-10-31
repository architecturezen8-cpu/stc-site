import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions } from "@/db/schema";
import { lmsPortalSessions } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ── v2.8.70.2 — FRESH-LOGIN DETECTION (welcome-back popup) ──────────────
   The owner: "student kenek, parent kenek, admin kenek, teacher kenek
   ehema acc ekata log weddi welcome back wage popup ekak show wenna".
   A login is "fresh" when the account's newest session row was created
   within the last few minutes — this works for password AND Google
   sign-in alike, because both paths insert a session row. */

const FRESH_WINDOW_MS = 5 * 60 * 1000;

/** Any portal-role account (student / teacher / parent / principal / lms_admin). */
export async function isFreshPortalLogin(accountId: number): Promise<boolean> {
  try {
    await ensureSchemaExtras();
    const [row] = await db
      .select({ createdAt: lmsPortalSessions.createdAt })
      .from(lmsPortalSessions)
      .where(eq(lmsPortalSessions.accountId, accountId))
      .orderBy(desc(lmsPortalSessions.id))
      .limit(1);
    if (!row) return false;
    return Date.now() - row.createdAt.getTime() <= FRESH_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Website admin — keyed by the live session row (admin_sessions). */
export async function isFreshAdminLogin(sessionId: number): Promise<boolean> {
  try {
    await ensureSchemaExtras();
    const [row] = await db
      .select({ createdAt: adminSessions.createdAt })
      .from(adminSessions)
      .where(eq(adminSessions.id, sessionId))
      .limit(1);
    if (!row) return false;
    return Date.now() - row.createdAt.getTime() <= FRESH_WINDOW_MS;
  } catch {
    return false;
  }
}
