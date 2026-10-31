import "server-only";

import { createHash, randomInt, randomBytes } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsClasses,
  lmsClassSubjects,
  lmsEnrollments,
  lmsPasswordResets,
  lmsPortalAccounts,
  lmsPortalSessions,
  lmsStudents,
  lmsTeachers,
} from "@/db/schema-lms";
import { hashPortalPassword } from "@/lib/portal-auth";
import { ledByFilter } from "@/lib/portal-class-teacher";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { STUDENT_LOGIN_DOMAIN, studentAccountEmail } from "@/lib/verification";
import { sendPasswordResetCode } from "@/lib/mailer";

/**
 * v2.8.67.0 — D.1 SELF-SERVICE password reset (the owner's redesign of the
 * old "call the admin" idea: a 12-year-old must never phone the office to
 * change a password).
 *
 * Two paths, both without an admin in the loop:
 *
 *  1. EMAIL CODE  — the account's email receives a 6-digit one-time code
 *     (10 min TTL, 5 attempts, newest request supersedes older ones). This
 *     works for every account with a REAL address (teachers, parents,
 *     principal). Students whose account still carries the synthetic
 *     `adm-…@portal.stcmatale.lk` identity get the gentle "ask your class
 *     teacher" answer instead — the synthetic address cannot receive mail.
 *
 *  2. TEACHER TEMP PASSWORD — a teacher who teaches the student's class
 *     (or is its class teacher) issues a one-time temp password; the next
 *     login is bounced to /account/secure to choose a private one.
 *
 * Security posture: the code is stored only as a sha256 hash salted with
 * the account email; unknown emails answer the same generic "sent" as
 * known ones (no enumeration); the synthetic-domain answer leaks nothing
 * (every synthetic address returns it regardless of account existence).
 */

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const PER_EMAIL_LIMIT_PER_HOUR = 3;
const PER_IP_LIMIT_PER_HOUR = 10;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 72;

export type ResetRequestStatus = "sent" | "no_email" | "rate_limited";
export type ResetVerifyStatus =
  | "ok"
  | "invalid"
  | "expired"
  | "too_many_attempts"
  | "bad_password";

/** Students type their ADMISSION NUMBER — same identity rule as login. */
function normalizeIdentity(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("@")) return value;
  return studentAccountEmail(value);
}

function isSyntheticStudentEmail(email: string): boolean {
  return email.endsWith(`@${STUDENT_LOGIN_DOMAIN}`);
}

function codeHash(email: string, code: string): string {
  return createHash("sha256").update(`${email.toLowerCase()}#${code}`).digest("hex");
}

function timingSafeEq(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/* ── 1) REQUEST A CODE ─────────────────────────────────────────────────── */

export async function requestPortalPasswordReset(
  rawInput: string,
  ip: string | null,
): Promise<{ status: ResetRequestStatus; devCode?: string }> {
  await ensureSchemaExtras();
  const email = normalizeIdentity(rawInput);
  if (!email) return { status: "sent" };

  // Synthetic student identities cannot receive mail — honest, safe answer.
  if (isSyntheticStudentEmail(email)) return { status: "no_email" };

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ count: emailHits }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lmsPasswordResets)
    .where(and(eq(lmsPasswordResets.email, email), gt(lmsPasswordResets.createdAt, hourAgo)));
  if (emailHits >= PER_EMAIL_LIMIT_PER_HOUR) return { status: "rate_limited" };

  if (ip) {
    const [{ count: ipHits }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lmsPasswordResets)
      .where(and(eq(lmsPasswordResets.createdIp, ip), gt(lmsPasswordResets.createdAt, hourAgo)));
    if (ipHits >= PER_IP_LIMIT_PER_HOUR) return { status: "rate_limited" };
  }

  const accounts = await db
    .select()
    .from(lmsPortalAccounts)
    .where(
      and(
        eq(lmsPortalAccounts.email, email),
        eq(lmsPortalAccounts.active, true),
        // Google-only accounts have no password to reset.
        sql`${lmsPortalAccounts.passwordHash} is not null`,
      ),
    );
  if (accounts.length === 0) return { status: "sent" };

  // A newer request supersedes any live codes for this email.
  await db
    .update(lmsPasswordResets)
    .set({ consumedAt: new Date() })
    .where(and(eq(lmsPasswordResets.email, email), isNull(lmsPasswordResets.consumedAt)));

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  await db.insert(lmsPasswordResets).values(
    accounts.map((account) => ({
      accountId: account.id,
      email,
      role: account.role,
      codeHash: codeHash(email, code),
      expiresAt,
      createdIp: ip?.slice(0, 60) ?? null,
    })),
  );

  const sent = await sendPasswordResetCode(email, code);
  if (!sent) {
    // Generic answer regardless — a mail outage must never leak which
    // emails exist. The user simply retries; ops sees the [mailer] log.
    console.error(`[reset] mail delivery FAILED for ${email} (code not delivered)`);
  }
  if (process.env.NODE_ENV !== "production") {
    // Sandbox QA only — never ships to Vercel (NODE_ENV=production there).
    console.info(`[reset] DEV CODE for ${email}: ${code}`);
    return { status: "sent", devCode: code };
  }
  return { status: "sent" };
}

/* ── 2) VERIFY CODE + SET NEW PASSWORD ────────────────────────────────── */

export async function resetPortalPassword(
  rawInput: string,
  code: string,
  newPassword: string,
): Promise<{ status: ResetVerifyStatus }> {
  await ensureSchemaExtras();
  const email = normalizeIdentity(rawInput);
  const trimmedCode = code.trim();
  if (!email || !/^\d{6}$/.test(trimmedCode)) return { status: "invalid" };
  if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
    return { status: "bad_password" };
  }

  const live = await db
    .select()
    .from(lmsPasswordResets)
    .where(
      and(
        eq(lmsPasswordResets.email, email),
        isNull(lmsPasswordResets.consumedAt),
        gt(lmsPasswordResets.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(lmsPasswordResets.id))
    .limit(1);

  const row = live[0];
  if (!row) return { status: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) {
    await db
      .update(lmsPasswordResets)
      .set({ consumedAt: new Date() })
      .where(eq(lmsPasswordResets.id, row.id));
    return { status: "too_many_attempts" };
  }

  if (!timingSafeEq(row.codeHash, codeHash(email, trimmedCode))) {
    const attempts = row.attempts + 1;
    await db
      .update(lmsPasswordResets)
      .set({ attempts, ...(attempts >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}) })
      .where(eq(lmsPasswordResets.id, row.id));
    return { status: attempts >= MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
  }

  const accountIds = (
    await db
      .select({ accountId: lmsPasswordResets.accountId })
      .from(lmsPasswordResets)
      .where(
        and(
          eq(lmsPasswordResets.email, email),
          isNull(lmsPasswordResets.consumedAt),
          gt(lmsPasswordResets.expiresAt, new Date()),
        ),
      )
  ).map((r) => r.accountId);

  const newPasswordHash = await hashPortalPassword(newPassword);
  const now = new Date();

  await db
    .update(lmsPortalAccounts)
    .set({ passwordHash: newPasswordHash, mustChangePassword: false })
    .where(inArray(lmsPortalAccounts.id, accountIds));
  await db
    .update(lmsPasswordResets)
    .set({ consumedAt: now })
    .where(
      and(
        eq(lmsPasswordResets.email, email),
        isNull(lmsPasswordResets.consumedAt),
        gt(lmsPasswordResets.expiresAt, new Date()),
      ),
    );
  // Any signed-in device using the OLD password is signed out everywhere.
  await db.delete(lmsPortalSessions).where(inArray(lmsPortalSessions.accountId, accountIds));

  for (const accountId of accountIds) {
    await db.insert(adminAuditLogs).values({
      userId: null,
      action: "portal_password_reset",
      entity: "lms_portal_account",
      entityId: String(accountId),
      details: { email, via: "email_code" },
    });
  }

  return { status: "ok" };
}

/* ── 3) CHOOSE A NEW PASSWORD AFTER A TEMP-PASSWORD LOGIN ─────────────── */

export async function applyPasswordAfterLogin(
  accountId: number,
  newPassword: string,
): Promise<{ status: "ok" | "bad_password" }> {
  await ensureSchemaExtras();
  if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
    return { status: "bad_password" };
  }
  const newPasswordHash = await hashPortalPassword(newPassword);
  await db
    .update(lmsPortalAccounts)
    .set({
      passwordHash: newPasswordHash,
      mustChangePassword: false,
    })
    .where(eq(lmsPortalAccounts.id, accountId));
  await db.insert(adminAuditLogs).values({
    userId: null,
    action: "portal_password_changed",
    entity: "lms_portal_account",
    entityId: String(accountId),
    details: { via: "account_secure" },
  });
  return { status: "ok" };
}

/* ── 4) TEACHER ISSUES A TEMP PASSWORD ────────────────────────────────── */

const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export async function issueStudentTempPassword(
  teacherAccountId: number,
  studentAccountId: number,
): Promise<{ status: "ok" | "no_account" | "not_enrolled"; tempPassword?: string }> {
  await ensureSchemaExtras();

  const [teacher] = await db
    .select({ id: lmsTeachers.id })
    .from(lmsTeachers)
    .where(eq(lmsTeachers.accountId, teacherAccountId))
    .limit(1);
  if (!teacher) return { status: "no_account" };

  const [student] = await db
    .select({ id: lmsStudents.id, admissionNo: lmsStudents.admissionNo })
    .from(lmsStudents)
    .where(eq(lmsStudents.accountId, studentAccountId))
    .limit(1);
  if (!student) return { status: "no_account" };

  // The teacher must teach the student's class (any subject) OR be its
  // class teacher — exactly the register/class-teacher circle of trust.
  const taughtClassIds = (
    await db
      .selectDistinct({ classId: lmsClassSubjects.classId })
      .from(lmsClassSubjects)
      .where(eq(lmsClassSubjects.teacherId, teacher.id))
  ).map((r) => r.classId);
  const ledClasses = await db
    .select({ id: lmsClasses.id })
    .from(lmsClasses)
    .where(ledByFilter(teacher.id)); // v2.8.83.0 — class teacher OR assistant, ALL their classes
  for (const row of ledClasses) {
    if (!taughtClassIds.includes(row.id)) taughtClassIds.push(row.id);
  }
  if (taughtClassIds.length === 0) return { status: "not_enrolled" };

  const [enrolled] = await db
    .select({ id: lmsEnrollments.id })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.studentId, student.id),
        inArray(lmsEnrollments.classId, taughtClassIds),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .limit(1);
  if (!enrolled) return { status: "not_enrolled" };

  const tempBytes = randomBytes(10);
  let tempPassword = "";
  for (let i = 0; i < 10; i += 1) {
    tempPassword += TEMP_ALPHABET[tempBytes[i] % TEMP_ALPHABET.length];
  }

  await db
    .update(lmsPortalAccounts)
    .set({
      passwordHash: await hashPortalPassword(tempPassword),
      mustChangePassword: true,
    })
    .where(eq(lmsPortalAccounts.id, studentAccountId));
  await db.delete(lmsPortalSessions).where(eq(lmsPortalSessions.accountId, studentAccountId));
  await db.insert(adminAuditLogs).values({
    userId: teacherAccountId,
    action: "portal_temp_password_issued",
    entity: "lms_portal_account",
    entityId: String(studentAccountId),
    details: { studentAdmissionNo: student.admissionNo },
  });

  return { status: "ok", tempPassword };
}
