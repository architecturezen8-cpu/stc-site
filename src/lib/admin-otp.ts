import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminOtpCodes } from "@/db/schema";
import { sendBackupDownloadCode } from "@/lib/mailer";

/**
 * v2.8.76.0 — ADMIN one-time email codes (shared lib, zero duplication).
 *
 * The dump download gate re-verifies the signed-in account's PASSWORD —
 * but an admin who signs in with Google never uses a local password, so
 * the gate offers an emailed 6-digit code to the SAME identity instead
 * (the owner: "google login wela gitiyoth mokada karanne").
 *
 * Same security posture as the portal password reset (portal-password-
 * reset.ts): the code is stored ONLY as a sha256 hash salted with
 * adminId+purpose, a newer request supersedes older live codes, the code
 * lives 10 minutes, survives 5 wrong attempts, and every verify consumes
 * it on success (one-time). Purpose-scoped so future admin re-verification
 * needs reuse this table without colliding.
 */

export const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** Max codes issued per (admin, purpose) per rolling 10 minutes. */
const MAX_ISSUES_PER_WINDOW = 3;

export type AdminOtpPurpose = "backup_download";

export type IssueOtpStatus = "sent" | "mail_failed" | "rate_limited";
export type VerifyOtpStatus =
  | "ok"
  | "invalid"
  | "expired"
  | "too_many_attempts";

function codeHash(adminId: number, purpose: string, code: string): string {
  return createHash("sha256")
    .update(`${adminId}#${purpose}#${code}`)
    .digest("hex");
}

function timingSafeEq(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/* ── 1) ISSUE A CODE ────────────────────────────────────────────────────── */

export async function issueAdminOtp({
  adminId,
  purpose,
  email,
  ip,
}: {
  adminId: number;
  purpose: AdminOtpPurpose;
  email: string;
  ip: string | null;
}): Promise<{ status: IssueOtpStatus; devCode?: string }> {
  const windowStart = new Date(Date.now() - OTP_TTL_MINUTES * 60 * 1000);
  const [{ count: recent }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminOtpCodes)
    .where(
      and(
        eq(adminOtpCodes.adminId, adminId),
        eq(adminOtpCodes.purpose, purpose),
        gt(adminOtpCodes.createdAt, windowStart),
      ),
    );
  if (recent >= MAX_ISSUES_PER_WINDOW) return { status: "rate_limited" };

  // A newer request supersedes any live codes for this admin + purpose.
  await db
    .update(adminOtpCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(adminOtpCodes.adminId, adminId),
        eq(adminOtpCodes.purpose, purpose),
        isNull(adminOtpCodes.consumedAt),
      ),
    );

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(adminOtpCodes).values({
    adminId,
    purpose,
    codeHash: codeHash(adminId, purpose, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    createdIp: ip?.slice(0, 60) ?? null,
  });

  const sent = await sendBackupDownloadCode(email, code);
  if (!sent) {
    console.error(`[admin-otp] mail delivery FAILED for admin #${adminId} (${purpose})`);
    return { status: "mail_failed" };
  }
  if (process.env.NODE_ENV !== "production") {
    // Sandbox QA only — never ships to Vercel (NODE_ENV=production there).
    console.info(`[admin-otp] DEV CODE for admin #${adminId} (${purpose}): ${code}`);
    return { status: "sent", devCode: code };
  }
  return { status: "sent" };
}

/* ── 2) VERIFY + CONSUME ───────────────────────────────────────────────── */

export async function verifyAdminOtp({
  adminId,
  purpose,
  code,
}: {
  adminId: number;
  purpose: AdminOtpPurpose;
  code: string;
}): Promise<{ status: VerifyOtpStatus }> {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return { status: "invalid" };

  const [row] = await db
    .select()
    .from(adminOtpCodes)
    .where(
      and(
        eq(adminOtpCodes.adminId, adminId),
        eq(adminOtpCodes.purpose, purpose),
        isNull(adminOtpCodes.consumedAt),
        gt(adminOtpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(adminOtpCodes.id))
    .limit(1);

  if (!row) return { status: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) {
    await db
      .update(adminOtpCodes)
      .set({ consumedAt: new Date() })
      .where(eq(adminOtpCodes.id, row.id));
    return { status: "too_many_attempts" };
  }

  if (!timingSafeEq(row.codeHash, codeHash(adminId, purpose, trimmed))) {
    const attempts = row.attempts + 1;
    await db
      .update(adminOtpCodes)
      .set({ attempts, ...(attempts >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}) })
      .where(eq(adminOtpCodes.id, row.id));
    return {
      status: attempts >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid",
    };
  }

  // One-time: the correct code burns itself immediately.
  await db
    .update(adminOtpCodes)
    .set({ consumedAt: new Date() })
    .where(eq(adminOtpCodes.id, row.id));
  return { status: "ok" };
}
