import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { lmsStudentRecords, lmsTeacherRecords } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   REGISTRATION VERIFICATION (v2.8.33.0)

   Self-registration stays OPEN, but every registration is checked against
   the OFFICE REGISTERS (lms_student_records / lms_teacher_records):

     full match  → account is ACTIVE immediately (auto-approve)
     any doubt   → account is PENDING and lands in the office approval
                   queue (Admin → Registration Approvals). A pending
                   account cannot sign in until the office approves it.

   Name matching is deliberately forgiving: "W.A.D. Perera" == "perera w a d"
   == "W A D Perera". Titles (Mr/Mrs/…) are ignored. Nothing else is.
   ──────────────────────────────────────────────────────────────────────── */

export type VerificationOutcome = {
  result: "approved" | "pending";
  reason: string | null;
  recordId: number | null;
};

/** Sorted token bag — order/punctuation-insensitive name comparison. */
export function normalizeName(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[.,'’"()\-]/g, " ")
    .replace(/\b(mr|mrs|ms|miss|rev|dr|mr\.|mrs\.)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort();
}

export function namesMatch(a: string, b: string): boolean {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (left.length === 0 || right.length === 0) return false;
  if (left.length !== right.length) return false;
  return left.every((token, i) => token === right[i]);
}

/** Class "10 - B" == "10B" == "10-b". */
export function normalizeClass(raw: string): string {
  return raw.toLowerCase().replace(/[\s.]/g, "");
}

/** IDs: strip punctuation/spaces, lowercase — "ADM/19/23" == "adm1923". */
export function normalizeId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ── Student login identity ──────────────────────────────────────────────
   Students register with an ADMISSION NUMBER, not an email (email is
   optional). Their portal identity is a deterministic synthetic address
   built from the admission number, so the existing (email, role) account
   model keeps working untouched. At sign-in the same mapping is applied
   to whatever the student typed. */

export const STUDENT_LOGIN_DOMAIN = "portal.stcmatale.lk";

export function studentAccountEmail(admissionNo: string): string {
  return `adm-${normalizeId(admissionNo)}@${STUDENT_LOGIN_DOMAIN}`;
}

/** Login resolver: students may type their admission number OR an email. */
export function resolvePortalLoginEmail(role: string, raw: string): string {
  const value = raw.trim();
  if (role === "student" && value && !value.includes("@")) {
    return studentAccountEmail(value);
  }
  return value.toLowerCase();
}

/* ── Record lookup helpers ─────────────────────────────────────────────── */

async function findStudentRecord(admissionNo: string) {
  await ensureSchemaExtras();
  const [row] = await db
    .select()
    .from(lmsStudentRecords)
    .where(
      sql`lower(${lmsStudentRecords.admissionNo}) = ${admissionNo.trim().toLowerCase()}`,
    )
    .limit(1);
  return row ?? null;
}

async function findTeacherRecord(teacherId: string) {
  await ensureSchemaExtras();
  const [row] = await db
    .select()
    .from(lmsTeacherRecords)
    .where(
      sql`lower(${lmsTeacherRecords.teacherId}) = ${teacherId.trim().toLowerCase()}`,
    )
    .limit(1);
  return row ?? null;
}

const pending = (reason: string, recordId: number | null = null): VerificationOutcome => ({
  result: "pending",
  reason,
  recordId,
});
const approved = (recordId: number | null): VerificationOutcome => ({
  result: "approved",
  reason: null,
  recordId,
});

/* ── Per-role verifiers ────────────────────────────────────────────────── */

/** Student: admission no + name + class + register no + both parents. */
export async function verifyStudentRegistration(input: {
  admissionNo: string;
  fullName: string;
  className: string;
  registerNo: string;
  fatherName: string;
  motherName: string;
}): Promise<VerificationOutcome> {
  const record = await findStudentRecord(input.admissionNo);
  if (!record) {
    return pending("Admission number is not on the school register");
  }
  if (!namesMatch(input.fullName, record.fullName)) {
    return pending("Student name does not match the school register", record.id);
  }
  if (normalizeClass(input.className) !== normalizeClass(record.className)) {
    return pending("Class does not match the school register", record.id);
  }
  if (
    record.registerNo &&
    normalizeId(input.registerNo) !== normalizeId(record.registerNo)
  ) {
    return pending("Register number does not match the school register", record.id);
  }
  if (!namesMatch(input.fatherName, record.fatherName)) {
    return pending("Father's name does not match the school register", record.id);
  }
  if (!namesMatch(input.motherName, record.motherName)) {
    return pending("Mother's name does not match the school register", record.id);
  }
  return approved(record.id);
}

/** Teacher: teacher ID + name (+ email when the staff register holds one). */
export async function verifyTeacherRegistration(input: {
  teacherId: string;
  fullName: string;
  email: string;
}): Promise<VerificationOutcome> {
  const record = await findTeacherRecord(input.teacherId);
  if (!record) {
    return pending("Teacher ID is not on the staff register");
  }
  if (
    record.email &&
    record.email.trim().toLowerCase() !== input.email.trim().toLowerCase()
  ) {
    return pending("Email does not match the staff register", record.id);
  }
  if (!namesMatch(input.fullName, record.fullName)) {
    return pending("Name does not match the staff register", record.id);
  }
  return approved(record.id);
}

/**
 * Parent: anchored to the CHILD's record. Father/Mother must match the
 * corresponding register name; Guardian always needs the office.
 */
export async function verifyParentRegistration(input: {
  childAdmissionNo: string;
  childClass: string;
  relation: string;
  guardianName: string;
}): Promise<VerificationOutcome> {
  const record = await findStudentRecord(input.childAdmissionNo);
  if (!record) {
    return pending("Child's admission number is not on the school register");
  }
  if (normalizeClass(input.childClass) !== normalizeClass(record.className)) {
    return pending("Child's class does not match the school register", record.id);
  }
  const relation = input.relation.trim().toLowerCase();
  if (relation === "father") {
    return namesMatch(input.guardianName, record.fatherName)
      ? approved(record.id)
      : pending("Name does not match the father on the school register", record.id);
  }
  if (relation === "mother") {
    return namesMatch(input.guardianName, record.motherName)
      ? approved(record.id)
      : pending("Name does not match the mother on the school register", record.id);
  }
  return pending("Guardian accounts need school office verification", record.id);
}
