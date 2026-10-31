import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  lmsAssignmentFiles,
  lmsAssignmentQuestions,
  lmsAssignments,
  lmsClasses,
  lmsEnrollments,
  lmsMaterialFiles,
  lmsMaterials,
  lmsNoticeFiles,
  lmsNotices,
  lmsParents,
  lmsPortalAccounts,
  lmsStudents,
  lmsStorageCaps,
  lmsSubmissionFiles,
  lmsTeachers,
} from "@/db/schema-lms";
import { mediaAssets, mediaBlobs, mediaVariants } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { isVideoExt } from "@/lib/portal-file-types";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/**
 * v2.8.67.1 — D.2: B2 storage quotas + the 3-month cleanup marks.
 *
 * The owner-approved rules, exactly:
 *   - every STUDENT answers to a 500 MB bucket quota (their submission files
 *     + their chat attachments — both ride the same storage layer); teachers
 *     are trusted staff and are exempt from the quota (per-file caps still
 *     apply through portal-file-types.ts);
 *   - video files get a 100 MB per-file cap (documents stay at 20 MB);
 *   - files older than 3 months become CLEANUP MARKS — the admin panel lists
 *     them with reclaimable bytes, but NOTHING is deleted automatically. A
 *     human (the owner) decides what goes, one click at a time.
 *
 * v2.8.67.3 — D.3 storage package, layered on top:
 *   - WhatsApp-style TRASH: the four classroom file tables carry deleted_at;
 *     the owner's "My Storage" delete sets it, trashed bytes stop counting
 *     toward EVERY quota sum below, and only a purge removes the object.
 *   - PER-PERSON CAPS: lms_storage_caps overrides the role default for one
 *     person (student default stays 500 MB; teachers/parents are unlimited
 *     unless a cap row exists).
 *   - TEACHER + PARENT accounting: the studio's Storage panel now sees every
 *     role's usage in one place, and each portal role gets a "My Storage"
 *     manager over its own files.
 *
 * Usage is computed on the fly from the size columns the rows already carry
 * — school scale is a few thousand rows, no counter table to keep in step.
 */

export const STUDENT_QUOTA_BYTES = 500 * 1024 * 1024;
export const FILE_MAX_BYTES = 20 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const CLEANUP_MARK_DAYS = 90;

export function capForExt(ext: string): number {
  return isVideoExt(ext) ? VIDEO_MAX_BYTES : FILE_MAX_BYTES;
}

/* ── per-person caps (D.3) ─────────────────────────────────────────────── */

export type StorageCapRole = "student" | "teacher" | "parent";

/**
 * The custom cap for ONE person, or null when none is set (the caller then
 * applies its role default — students fall back to STUDENT_QUOTA_BYTES).
 * FAIL-OPEN: any read error answers null so nobody is ever locked out by a
 * caps-table hiccup.
 */
export async function getEffectiveCapBytes(
  role: StorageCapRole,
  personId: number,
): Promise<number | null> {
  try {
    await ensureSchemaExtras();
    const [row] = await db
      .select({ quotaBytes: lmsStorageCaps.quotaBytes })
      .from(lmsStorageCaps)
      .where(and(eq(lmsStorageCaps.role, role), eq(lmsStorageCaps.personId, personId)))
      .limit(1);
    return row ? Number(row.quotaBytes) : null;
  } catch {
    return null;
  }
}

/** Upsert one person's cap; `null` removes the override (back to default). */
export async function setStorageCap(
  role: StorageCapRole,
  personId: number,
  quotaBytes: number | null,
): Promise<void> {
  await ensureSchemaExtras();
  if (quotaBytes == null) {
    await db
      .delete(lmsStorageCaps)
      .where(and(eq(lmsStorageCaps.role, role), eq(lmsStorageCaps.personId, personId)));
    return;
  }
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) {
    throw new Error("quotaBytes must be a positive number of bytes.");
  }
  const bytes = Math.round(quotaBytes);
  await db
    .insert(lmsStorageCaps)
    .values({ role, personId, quotaBytes: bytes })
    .onConflictDoUpdate({
      target: [lmsStorageCaps.role, lmsStorageCaps.personId],
      set: { quotaBytes: bytes, updatedAt: new Date() },
    });
}

/* ── usage ─────────────────────────────────────────────────────────────── */

/** Student submission bytes — TRASH-AWARE since D.3 (deleted_at IS NULL). */
async function sumSubmissionBytes(studentId: number): Promise<number> {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(${lmsSubmissionFiles.sizeBytes}), 0)::bigint` })
    .from(lmsSubmissionFiles)
    .where(
      and(eq(lmsSubmissionFiles.studentId, studentId), isNull(lmsSubmissionFiles.deletedAt)),
    );
  return Number(row?.bytes ?? 0);
}

async function sumChatBytes(studentId: number): Promise<number> {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(${lmsAssignmentQuestions.sizeBytes}), 0)::bigint` })
    .from(lmsAssignmentQuestions)
    .where(
      and(
        eq(lmsAssignmentQuestions.studentId, studentId),
        eq(lmsAssignmentQuestions.authorRole, "student"),
        isNotNull(lmsAssignmentQuestions.objectKey),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    );
  return Number(row?.bytes ?? 0);
}

/** Total B2 bytes one student owns right now (submission files + chat). */
export async function getStudentUsageBytes(studentId: number): Promise<number> {
  const [sub, chat] = await Promise.all([
    sumSubmissionBytes(studentId),
    sumChatBytes(studentId),
  ]);
  return sub + chat;
}

/* ── teacher usage (D.3) ───────────────────────────────────────────────── */

async function sumAssignmentBytes(accountId: number): Promise<number> {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(${lmsAssignmentFiles.sizeBytes}), 0)::bigint` })
    .from(lmsAssignmentFiles)
    .where(
      and(
        eq(lmsAssignmentFiles.uploadedByAccountId, accountId),
        isNull(lmsAssignmentFiles.deletedAt),
      ),
    );
  return Number(row?.bytes ?? 0);
}

async function sumMaterialBytes(accountId: number): Promise<number> {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(${lmsMaterialFiles.sizeBytes}), 0)::bigint` })
    .from(lmsMaterialFiles)
    .innerJoin(lmsMaterials, eq(lmsMaterials.id, lmsMaterialFiles.materialId))
    .where(
      and(eq(lmsMaterials.createdByAccountId, accountId), isNull(lmsMaterialFiles.deletedAt)),
    );
  return Number(row?.bytes ?? 0);
}

async function sumNoticeBytes(accountId: number): Promise<number> {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(${lmsNoticeFiles.sizeBytes}), 0)::bigint` })
    .from(lmsNoticeFiles)
    .innerJoin(lmsNotices, eq(lmsNotices.id, lmsNoticeFiles.noticeId))
    .where(and(eq(lmsNotices.createdByAccountId, accountId), isNull(lmsNoticeFiles.deletedAt)));
  return Number(row?.bytes ?? 0);
}

async function sumTeacherChatBytes(accountId: number): Promise<number> {
  const [row] = await db
    .select({ bytes: sql<number>`coalesce(sum(${lmsAssignmentQuestions.sizeBytes}), 0)::bigint` })
    .from(lmsAssignmentQuestions)
    .where(
      and(
        eq(lmsAssignmentQuestions.authorRole, "teacher"),
        eq(lmsAssignmentQuestions.authorAccountId, accountId),
        isNotNull(lmsAssignmentQuestions.objectKey),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    );
  return Number(row?.bytes ?? 0);
}

/** Total B2 bytes one teacher account owns right now (all four sources). */
export async function getTeacherUsageBytes(accountId: number): Promise<number> {
  const [a, m, n, c] = await Promise.all([
    sumAssignmentBytes(accountId),
    sumMaterialBytes(accountId),
    sumNoticeBytes(accountId),
    sumTeacherChatBytes(accountId),
  ]);
  return a + m + n + c;
}

export type QuotaVerdict = {
  ok: boolean;
  used: number;
  quota: number;
  incoming: number;
};

/**
 * Quota check for an incoming STUDENT upload — never throws.
 * D.3: the effective cap is the person's lms_storage_caps row when one
 * exists, else the 500 MB role default.
 */
export async function checkStudentQuota(
  studentId: number,
  incomingBytes: number,
): Promise<QuotaVerdict> {
  const cap = (await getEffectiveCapBytes("student", studentId)) ?? STUDENT_QUOTA_BYTES;
  let used = 0;
  try {
    used = await getStudentUsageBytes(studentId);
  } catch {
    // A read failure must never lock a student out — fail open, the
    // per-file caps still bound the blast radius.
    return { ok: true, used: -1, quota: cap, incoming: incomingBytes };
  }
  return {
    ok: used + incomingBytes <= cap,
    used,
    quota: cap,
    incoming: incomingBytes,
  };
}

/**
 * D.3 — quota check for an incoming TEACHER upload — never throws.
 * Teachers have no default cap: only a person's lms_storage_caps row
 * bounds them (no row / no teacher person → always { ok: true }).
 */
export async function checkTeacherQuota(
  accountId: number,
  incomingBytes: number,
): Promise<QuotaVerdict> {
  try {
    await ensureSchemaExtras();
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    if (!teacher) return { ok: true, used: -1, quota: 0, incoming: incomingBytes };
    const cap = await getEffectiveCapBytes("teacher", teacher.id);
    if (cap == null) return { ok: true, used: -1, quota: 0, incoming: incomingBytes };
    let used = 0;
    try {
      used = await getTeacherUsageBytes(accountId);
    } catch {
      return { ok: true, used: -1, quota: cap, incoming: incomingBytes };
    }
    return {
      ok: used + incomingBytes <= cap,
      used,
      quota: cap,
      incoming: incomingBytes,
    };
  } catch {
    // Fail open — a caps/lookup failure never blocks a teacher's upload.
    return { ok: true, used: -1, quota: 0, incoming: incomingBytes };
  }
}

function mb(bytes: number): string {
  if (bytes < 0) return "?";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function quotaErrorMessage(
  verdict: QuotaVerdict,
  /** v2.8.68.1 — the hint tail matches who hit the wall. */
  role?: "student" | "teacher",
): string {
  const head = `Your file storage is full — ${mb(verdict.used)} of ${mb(
    verdict.quota,
  )} used, and this file needs ${mb(verdict.incoming)}.`;
  if (role === "teacher") {
    return `${head} Delete old files in My Storage, or ask the office to raise your cap.`;
  }
  return `${head} Delete old files in My Storage, or ask your teacher for help.`;
}

/* ── admin analytics ───────────────────────────────────────────────────── */

export type StudentUsageRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  className: string | null;
  submissionBytes: number;
  chatBytes: number;
  totalBytes: number;
  /** Percentage against the DEFAULT 500 MB quota (D.2 semantics kept). */
  quotaPct: number;
  /* D.3 — the effective cap (custom row or the 500 MB default) + whether
     it is a custom override, for the studio's cap pill. */
  capBytes: number;
  capCustom: boolean;
  capPct: number;
};

/** Per-student usage table (only students that own bytes today). */
export async function getStudentUsageRows(): Promise<StudentUsageRow[]> {
  await ensureSchemaExtras();

  const subRows = await db
    .select({
      studentId: lmsSubmissionFiles.studentId,
      bytes: sql<number>`coalesce(sum(${lmsSubmissionFiles.sizeBytes}), 0)::bigint`,
      files: sql<number>`count(*)::int`,
    })
    .from(lmsSubmissionFiles)
    .where(isNull(lmsSubmissionFiles.deletedAt))
    .groupBy(lmsSubmissionFiles.studentId);

  const chatRows = await db
    .select({
      studentId: lmsAssignmentQuestions.studentId,
      bytes: sql<number>`coalesce(sum(${lmsAssignmentQuestions.sizeBytes}), 0)::bigint`,
    })
    .from(lmsAssignmentQuestions)
    .where(
      and(
        eq(lmsAssignmentQuestions.authorRole, "student"),
        isNotNull(lmsAssignmentQuestions.objectKey),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    )
    .groupBy(lmsAssignmentQuestions.studentId);

  const ids = new Set<number>([...subRows.map((r) => r.studentId), ...chatRows.map((r) => r.studentId)]);
  if (ids.size === 0) return [];

  /* D.3 — custom caps for exactly the students on the table. */
  const capRows = await db
    .select({ personId: lmsStorageCaps.personId, quotaBytes: lmsStorageCaps.quotaBytes })
    .from(lmsStorageCaps)
    .where(and(eq(lmsStorageCaps.role, "student"), inArray(lmsStorageCaps.personId, [...ids])));
  const capByPerson = new Map(capRows.map((c) => [c.personId, Number(c.quotaBytes)]));

  const students = await db
    .select({
      id: lmsStudents.id,
      admissionNo: lmsStudents.admissionNo,
      fullName: lmsStudents.fullName,
    })
    .from(lmsStudents);
  const byId = new Map(students.map((s) => [s.id, s]));

  const enrollmentRows = await db
    .select({
      studentId: lmsEnrollments.studentId,
      className: lmsClasses.name,
    })
    .from(lmsEnrollments)
    .innerJoin(lmsClasses, eq(lmsClasses.id, lmsEnrollments.classId))
    .where(eq(lmsEnrollments.status, "active"));
  const classByStudent = new Map<number, string>();
  for (const row of enrollmentRows) {
    if (!classByStudent.has(row.studentId)) classByStudent.set(row.studentId, row.className);
  }

  const subById = new Map(subRows.map((r) => [r.studentId, r]));
  const chatById = new Map(chatRows.map((r) => [r.studentId, Number(r.bytes)]));

  const rows: StudentUsageRow[] = [];
  for (const id of ids) {
    const student = byId.get(id);
    if (!student) continue;
    const submissionBytes = Number(subById.get(id)?.bytes ?? 0);
    const chatBytes = chatById.get(id) ?? 0;
    const totalBytes = submissionBytes + chatBytes;
    const capCustom = capByPerson.has(id);
    const capBytes = capCustom ? (capByPerson.get(id) as number) : STUDENT_QUOTA_BYTES;
    rows.push({
      studentId: id,
      admissionNo: student.admissionNo,
      fullName: student.fullName,
      className: classByStudent.get(id) ?? null,
      submissionBytes,
      chatBytes,
      totalBytes,
      quotaPct: Math.min(100, Math.round((totalBytes / STUDENT_QUOTA_BYTES) * 100)),
      capBytes,
      capCustom,
      capPct: capBytes > 0 ? Math.min(100, Math.round((totalBytes / capBytes) * 100)) : 0,
    });
  }
  rows.sort((a, b) => b.totalBytes - a.totalBytes);
  return rows;
}

export type StorageOverview = {
  prefixes: {
    label: string;
    hint: string;
    bytes: number;
    files: number;
  }[];
  studentBytes: number;
  studentQuotaBytes: number;
};

/** Bucket-wide view computed from the DB rows (no provider listing). */
export async function getStorageOverview(): Promise<StorageOverview> {
  await ensureSchemaExtras();

  const [[sub], [afiles], [mfiles], [nfiles], [chat], [assets], [variants], [blobs]] =
    await Promise.all([
      db
        .select({
          bytes: sql<number>`coalesce(sum(${lmsSubmissionFiles.sizeBytes}), 0)::bigint`,
          files: sql<number>`count(*)::int`,
        })
        .from(lmsSubmissionFiles)
        .where(isNull(lmsSubmissionFiles.deletedAt)),
      db
        .select({
          bytes: sql<number>`coalesce(sum(${lmsAssignmentFiles.sizeBytes}), 0)::bigint`,
          files: sql<number>`count(*)::int`,
        })
        .from(lmsAssignmentFiles)
        .where(isNull(lmsAssignmentFiles.deletedAt)),
      db
        .select({
          bytes: sql<number>`coalesce(sum(${lmsMaterialFiles.sizeBytes}), 0)::bigint`,
          files: sql<number>`count(*)::int`,
        })
        .from(lmsMaterialFiles)
        .where(isNull(lmsMaterialFiles.deletedAt)),
      db
        .select({
          bytes: sql<number>`coalesce(sum(${lmsNoticeFiles.sizeBytes}), 0)::bigint`,
          files: sql<number>`count(*)::int`,
        })
        .from(lmsNoticeFiles)
        .where(isNull(lmsNoticeFiles.deletedAt)),
      db
        .select({
          bytes: sql<number>`coalesce(sum(${lmsAssignmentQuestions.sizeBytes}), 0)::bigint`,
          files: sql<number>`count(*)::int`,
        })
        .from(lmsAssignmentQuestions)
        .where(
          and(isNotNull(lmsAssignmentQuestions.objectKey), isNull(lmsAssignmentQuestions.deletedAt)),
        ),
      db
        .select({
          bytes: sql<number>`coalesce(sum(${mediaAssets.originalSize}), 0)::bigint`,
          files: sql<number>`count(*)::int`,
        })
        .from(mediaAssets)
        .where(isNull(mediaAssets.deletedAt)),
      db
        .select({ bytes: sql<number>`coalesce(sum(${mediaVariants.fileSize}), 0)::bigint` })
        .from(mediaVariants),
      db.select({ bytes: sql<number>`coalesce(sum(${mediaBlobs.byteSize}), 0)::bigint` }).from(mediaBlobs),
    ]);

  const studentSubBytes = Number(sub?.bytes ?? 0);
  const chatBytes = Number(chat?.bytes ?? 0);
  // Only the STUDENT-authored half of chat rides the student quota.
  const studentChat = await db
    .select({ bytes: sql<number>`coalesce(sum(${lmsAssignmentQuestions.sizeBytes}), 0)::bigint` })
    .from(lmsAssignmentQuestions)
    .where(
      and(
        eq(lmsAssignmentQuestions.authorRole, "student"),
        isNotNull(lmsAssignmentQuestions.objectKey),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    );

  /* D.3 — the "Teacher attachments" prefix now folds in ALL THREE teacher
     file groups (assignments + materials + notices), each trash-aware. */
  const teacherBytes =
    Number(afiles?.bytes ?? 0) + Number(mfiles?.bytes ?? 0) + Number(nfiles?.bytes ?? 0);
  const teacherFiles = Number(afiles?.files ?? 0) + Number(mfiles?.files ?? 0) + Number(nfiles?.files ?? 0);

  return {
    prefixes: [
      {
        label: "Student work files",
        hint: "lms-work/ · submission attachments",
        bytes: studentSubBytes,
        files: Number(sub?.files ?? 0),
      },
      {
        label: "Teacher attachments",
        hint: "lms-work/ + lms-notice/ · assignments, materials & notices",
        bytes: teacherBytes,
        files: teacherFiles,
      },
      {
        label: "Chat files",
        hint: "lms-chat/ · ask-the-teacher attachments",
        bytes: chatBytes,
        files: Number(chat?.files ?? 0),
      },
      {
        label: "Media originals",
        hint: "media library · original images",
        bytes: Number(assets?.bytes ?? 0),
        files: Number(assets?.files ?? 0),
      },
      {
        label: "Media variants",
        hint: "responsive WebP copies sharp produced",
        bytes: Number(variants?.bytes ?? 0),
        files: 0,
      },
      {
        label: "Legacy DB blobs",
        hint: "pre-B2 images still in the database",
        bytes: Number(blobs?.bytes ?? 0),
        files: 0,
      },
    ],
    studentBytes: studentSubBytes + Number(studentChat[0]?.bytes ?? 0),
    studentQuotaBytes: STUDENT_QUOTA_BYTES,
  };
}

/* ── 3-month cleanup marks ─────────────────────────────────────────────── */

export type CleanupCandidate = {
  kind: "submission" | "chat";
  id: number;
  studentId: number;
  admissionNo: string;
  fullName: string;
  className: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type CleanupReport = {
  days: number;
  candidates: CleanupCandidate[];
  totalCount: number;
  totalBytes: number;
};

/**
 * Files older than `days` — the "marks". Student submissions + student chat
 * attachments only: teacher assignment attachments stay out (they are the
 * live teaching material and are tiny), and soft-deleted chat rows are
 * already gone from the bucket. D.3: trashed submissions skip the list too
 * — their bytes are already out of the quota and their owner can still
 * purge them from Trash.
 */
export async function getCleanupCandidates(days = CLEANUP_MARK_DAYS): Promise<CleanupReport> {
  await ensureSchemaExtras();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const classNameFor = async () => {
    const rows = await db
      .select({ studentId: lmsEnrollments.studentId, className: lmsClasses.name })
      .from(lmsEnrollments)
      .innerJoin(lmsClasses, eq(lmsClasses.id, lmsEnrollments.classId))
      .where(eq(lmsEnrollments.status, "active"));
    const map = new Map<number, string>();
    for (const row of rows) if (!map.has(row.studentId)) map.set(row.studentId, row.className);
    return map;
  };

  const [subRows, chatRows, classMap] = await Promise.all([
    db
      .select({
        kind: sql<"submission">`'submission'`,
        id: lmsSubmissionFiles.id,
        studentId: lmsSubmissionFiles.studentId,
        fileName: lmsSubmissionFiles.fileName,
        mimeType: lmsSubmissionFiles.mimeType,
        sizeBytes: lmsSubmissionFiles.sizeBytes,
        createdAt: lmsSubmissionFiles.createdAt,
        admissionNo: lmsStudents.admissionNo,
        fullName: lmsStudents.fullName,
      })
      .from(lmsSubmissionFiles)
      .innerJoin(lmsStudents, eq(lmsStudents.id, lmsSubmissionFiles.studentId))
      .where(and(lt(lmsSubmissionFiles.createdAt, cutoff), isNull(lmsSubmissionFiles.deletedAt)))
      .orderBy(asc(lmsSubmissionFiles.createdAt))
      .limit(500),
    db
      .select({
        kind: sql<"chat">`'chat'`,
        id: lmsAssignmentQuestions.id,
        studentId: lmsAssignmentQuestions.studentId,
        fileName: lmsAssignmentQuestions.fileName,
        mimeType: lmsAssignmentQuestions.mimeType,
        sizeBytes: lmsAssignmentQuestions.sizeBytes,
        createdAt: lmsAssignmentQuestions.createdAt,
        admissionNo: lmsStudents.admissionNo,
        fullName: lmsStudents.fullName,
      })
      .from(lmsAssignmentQuestions)
      .innerJoin(lmsStudents, eq(lmsStudents.id, lmsAssignmentQuestions.studentId))
      .where(
        and(
          lt(lmsAssignmentQuestions.createdAt, cutoff),
          isNotNull(lmsAssignmentQuestions.objectKey),
          isNull(lmsAssignmentQuestions.deletedAt),
        ),
      )
      .orderBy(asc(lmsAssignmentQuestions.createdAt))
      .limit(500),
    classNameFor(),
  ]);

  const candidates: CleanupCandidate[] = [
    ...subRows.map((r) => ({
      kind: "submission" as const,
      id: r.id,
      studentId: r.studentId,
      admissionNo: r.admissionNo,
      fullName: r.fullName,
      className: classMap.get(r.studentId) ?? null,
      fileName: r.fileName,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt.toISOString(),
    })),
    ...chatRows
      .filter((r) => r.fileName != null && r.sizeBytes != null)
      .map((r) => ({
        kind: "chat" as const,
        id: r.id,
        studentId: r.studentId,
        admissionNo: r.admissionNo,
        fullName: r.fullName,
        className: classMap.get(r.studentId) ?? null,
        fileName: r.fileName as string,
        mimeType: (r.mimeType as string) ?? "application/octet-stream",
        sizeBytes: r.sizeBytes as number,
        createdAt: (r.createdAt as Date).toISOString(),
      })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    days,
    candidates,
    totalCount: candidates.length,
    totalBytes: candidates.reduce((sum, c) => sum + c.sizeBytes, 0),
  };
}

/* ── D.3 teacher + parent usage rows for the studio panel ──────────────── */

export type TeacherUsageRow = {
  /** lms_teachers.id — the person the cap pill addresses. */
  teacherId: number;
  accountId: number | null;
  fullName: string;
  assignmentBytes: number;
  materialBytes: number;
  noticeBytes: number;
  chatBytes: number;
  totalBytes: number;
  capBytes: number | null;
  capPct: number;
};

/**
 * Per-teacher usage across all four byte sources (trash-aware), names
 * resolved through the account row. Only teachers that own bytes today OR
 * carry a custom cap row appear — sorted heaviest first.
 */
export async function getTeacherUsageRows(): Promise<TeacherUsageRow[]> {
  await ensureSchemaExtras();

  const [assignmentRows, materialRows, noticeRows, chatRows, capRows] = await Promise.all([
    db
      .select({
        accountId: lmsAssignmentFiles.uploadedByAccountId,
        bytes: sql<number>`coalesce(sum(${lmsAssignmentFiles.sizeBytes}), 0)::bigint`,
      })
      .from(lmsAssignmentFiles)
      .where(
        and(
          isNotNull(lmsAssignmentFiles.uploadedByAccountId),
          isNull(lmsAssignmentFiles.deletedAt),
        ),
      )
      .groupBy(lmsAssignmentFiles.uploadedByAccountId),
    db
      .select({
        accountId: lmsMaterials.createdByAccountId,
        bytes: sql<number>`coalesce(sum(${lmsMaterialFiles.sizeBytes}), 0)::bigint`,
      })
      .from(lmsMaterialFiles)
      .innerJoin(lmsMaterials, eq(lmsMaterials.id, lmsMaterialFiles.materialId))
      .where(
        and(isNotNull(lmsMaterials.createdByAccountId), isNull(lmsMaterialFiles.deletedAt)),
      )
      .groupBy(lmsMaterials.createdByAccountId),
    db
      .select({
        accountId: lmsNotices.createdByAccountId,
        bytes: sql<number>`coalesce(sum(${lmsNoticeFiles.sizeBytes}), 0)::bigint`,
      })
      .from(lmsNoticeFiles)
      .innerJoin(lmsNotices, eq(lmsNotices.id, lmsNoticeFiles.noticeId))
      .where(and(isNotNull(lmsNotices.createdByAccountId), isNull(lmsNoticeFiles.deletedAt)))
      .groupBy(lmsNotices.createdByAccountId),
    db
      .select({
        accountId: lmsAssignmentQuestions.authorAccountId,
        bytes: sql<number>`coalesce(sum(${lmsAssignmentQuestions.sizeBytes}), 0)::bigint`,
      })
      .from(lmsAssignmentQuestions)
      .where(
        and(
          eq(lmsAssignmentQuestions.authorRole, "teacher"),
          isNotNull(lmsAssignmentQuestions.authorAccountId),
          isNotNull(lmsAssignmentQuestions.objectKey),
          isNull(lmsAssignmentQuestions.deletedAt),
        ),
      )
      .groupBy(lmsAssignmentQuestions.authorAccountId),
    db
      .select({ personId: lmsStorageCaps.personId, quotaBytes: lmsStorageCaps.quotaBytes })
      .from(lmsStorageCaps)
      .where(eq(lmsStorageCaps.role, "teacher")),
  ]);

  const accountIds = new Set<number>();
  for (const r of [...assignmentRows, ...materialRows, ...noticeRows, ...chatRows]) {
    if (r.accountId != null) accountIds.add(r.accountId);
  }
  const capByPerson = new Map(capRows.map((c) => [c.personId, Number(c.quotaBytes)]));

  /* Teachers referenced by bytes, plus (for cap-only rows) any teacher
     person whose id carries a cap but whose account owns nothing yet. */
  const teacherRows =
    accountIds.size > 0
      ? await db
          .select({
            id: lmsTeachers.id,
            accountId: lmsTeachers.accountId,
            staffCode: lmsTeachers.staffCode,
          })
          .from(lmsTeachers)
          .where(inArray(lmsTeachers.accountId, [...accountIds]))
      : [];
  const byId = new Map(teacherRows.map((t) => [t.id, t]));
  const capOnlyPersons = [...capByPerson.keys()].filter((pid) => !byId.has(pid));
  if (capOnlyPersons.length > 0) {
    const extra = await db
      .select({
        id: lmsTeachers.id,
        accountId: lmsTeachers.accountId,
        staffCode: lmsTeachers.staffCode,
      })
      .from(lmsTeachers)
      .where(inArray(lmsTeachers.id, capOnlyPersons));
    for (const t of extra) byId.set(t.id, t);
  }

  const allAccountIds = new Set<number>(accountIds);
  for (const t of byId.values()) if (t.accountId != null) allAccountIds.add(t.accountId);
  const accounts =
    allAccountIds.size > 0
      ? await db
          .select({ id: lmsPortalAccounts.id, fullName: lmsPortalAccounts.fullName })
          .from(lmsPortalAccounts)
          .where(inArray(lmsPortalAccounts.id, [...allAccountIds]))
      : [];
  const nameByAccount = new Map(accounts.map((a) => [a.id, a.fullName]));

  const assignBytes = new Map<number, number>();
  for (const r of assignmentRows) if (r.accountId != null) assignBytes.set(r.accountId, Number(r.bytes));
  const materialBytes = new Map<number, number>();
  for (const r of materialRows) if (r.accountId != null) materialBytes.set(r.accountId, Number(r.bytes));
  const noticeBytes = new Map<number, number>();
  for (const r of noticeRows) if (r.accountId != null) noticeBytes.set(r.accountId, Number(r.bytes));
  const chatBytes = new Map<number, number>();
  for (const r of chatRows) if (r.accountId != null) chatBytes.set(r.accountId, Number(r.bytes));

  const rows: TeacherUsageRow[] = [];
  for (const t of byId.values()) {
    const a = t.accountId != null ? (assignBytes.get(t.accountId) ?? 0) : 0;
    const m = t.accountId != null ? (materialBytes.get(t.accountId) ?? 0) : 0;
    const n = t.accountId != null ? (noticeBytes.get(t.accountId) ?? 0) : 0;
    const c = t.accountId != null ? (chatBytes.get(t.accountId) ?? 0) : 0;
    const totalBytes = a + m + n + c;
    const capBytes = capByPerson.get(t.id) ?? null;
    if (totalBytes <= 0 && capBytes == null) continue;
    rows.push({
      teacherId: t.id,
      accountId: t.accountId,
      fullName:
        (t.accountId != null ? nameByAccount.get(t.accountId) : undefined) ||
        t.staffCode ||
        `Teacher #${t.id}`,
      assignmentBytes: a,
      materialBytes: m,
      noticeBytes: n,
      chatBytes: c,
      totalBytes,
      capBytes,
      capPct:
        capBytes && capBytes > 0 ? Math.min(100, Math.round((totalBytes / capBytes) * 100)) : 0,
    });
  }
  rows.sort((a, b) => b.totalBytes - a.totalBytes);
  return rows;
}

export type ParentUsageRow = {
  parentId: number;
  accountId: number;
  fullName: string;
  totalBytes: number;
  capBytes: number | null;
  capPct: number;
};

/**
 * Parents own nothing today — they appear in the studio so caps can be set
 * AHEAD of the day uploads arrive. Only parents with a live portal account
 * are listed (the account row supplies the display name).
 */
export async function getParentUsageRows(): Promise<ParentUsageRow[]> {
  await ensureSchemaExtras();

  const [rows, capRows] = await Promise.all([
    db
      .select({
        parentId: lmsParents.id,
        accountId: lmsParents.accountId,
        accountName: lmsPortalAccounts.fullName,
        relationship: lmsParents.relationship,
      })
      .from(lmsParents)
      .innerJoin(lmsPortalAccounts, eq(lmsPortalAccounts.id, lmsParents.accountId)),
    db
      .select({ personId: lmsStorageCaps.personId, quotaBytes: lmsStorageCaps.quotaBytes })
      .from(lmsStorageCaps)
      .where(eq(lmsStorageCaps.role, "parent")),
  ]);

  const capByPerson = new Map(capRows.map((c) => [c.personId, Number(c.quotaBytes)]));

  return rows
    .map((r) => {
      const capBytes = capByPerson.get(r.parentId) ?? null;
      return {
        parentId: r.parentId,
        accountId: r.accountId,
        fullName: r.accountName || r.relationship || `Parent #${r.parentId}`,
        totalBytes: 0,
        capBytes,
        capPct: 0,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/* ── D.3 my-storage readers (portal side) ──────────────────────────────── */

export type MyFile = {
  kind: "submission" | "assignment" | "material" | "notice" | "chat";
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  trashed: boolean;
  /** Where the file belongs — assignment / material / notice title. */
  context?: string | null;
};

export type StudentMyStorage = {
  used: number;
  capBytes: number;
  files: { submissions: MyFile[]; chat: MyFile[] };
};

/**
 * EVERYTHING one student owns — live AND trashed (the client splits the
 * tabs). Chat files have no trash state: a soft-deleted message's columns
 * are already nulled, so only live attachments ever appear here.
 */
export async function getMyStorageStudent(studentId: number): Promise<StudentMyStorage> {
  await ensureSchemaExtras();

  const [subRows, chatRows, used, cap] = await Promise.all([
    db
      .select({
        id: lmsSubmissionFiles.id,
        fileName: lmsSubmissionFiles.fileName,
        mimeType: lmsSubmissionFiles.mimeType,
        sizeBytes: lmsSubmissionFiles.sizeBytes,
        createdAt: lmsSubmissionFiles.createdAt,
        deletedAt: lmsSubmissionFiles.deletedAt,
        context: lmsAssignments.title,
      })
      .from(lmsSubmissionFiles)
      .leftJoin(lmsAssignments, eq(lmsAssignments.id, lmsSubmissionFiles.assignmentId))
      .where(eq(lmsSubmissionFiles.studentId, studentId))
      .orderBy(desc(lmsSubmissionFiles.createdAt)),
    db
      .select({
        id: lmsAssignmentQuestions.id,
        fileName: lmsAssignmentQuestions.fileName,
        mimeType: lmsAssignmentQuestions.mimeType,
        sizeBytes: lmsAssignmentQuestions.sizeBytes,
        createdAt: lmsAssignmentQuestions.createdAt,
        context: lmsAssignments.title,
      })
      .from(lmsAssignmentQuestions)
      .leftJoin(lmsAssignments, eq(lmsAssignments.id, lmsAssignmentQuestions.assignmentId))
      .where(
        and(
          eq(lmsAssignmentQuestions.studentId, studentId),
          eq(lmsAssignmentQuestions.authorRole, "student"),
          isNotNull(lmsAssignmentQuestions.objectKey),
        ),
      )
      .orderBy(desc(lmsAssignmentQuestions.createdAt)),
    getStudentUsageBytes(studentId),
    getEffectiveCapBytes("student", studentId),
  ]);

  return {
    used,
    capBytes: cap ?? STUDENT_QUOTA_BYTES,
    files: {
      submissions: subRows.map((r) => ({
        kind: "submission" as const,
        id: r.id,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt.toISOString(),
        trashed: r.deletedAt != null,
        context: r.context ?? null,
      })),
      chat: chatRows
        .filter((r) => r.fileName != null)
        .map((r) => ({
          kind: "chat" as const,
          id: r.id,
          fileName: r.fileName as string,
          mimeType: r.mimeType ?? "application/octet-stream",
          sizeBytes: r.sizeBytes ?? 0,
          createdAt: r.createdAt.toISOString(),
          trashed: false,
          context: r.context ?? null,
        })),
    },
  };
}

export type TeacherMyStorage = {
  used: number;
  capBytes: number | null;
  files: { assignments: MyFile[]; materials: MyFile[]; notices: MyFile[]; chat: MyFile[] };
};

/**
 * Everything one TEACHER owns, keyed by their portal account id. When the
 * account has no lms_teachers row (or accountId is null) the files are
 * empty but a cap set on `teacherPersonId` still resolves.
 */
export async function getMyStorageTeacher(
  accountId: number | null,
  teacherPersonId?: number | null,
): Promise<TeacherMyStorage> {
  await ensureSchemaExtras();

  let personId = teacherPersonId ?? null;
  if (personId == null && accountId != null) {
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    personId = teacher?.id ?? null;
  }

  if (accountId == null) {
    return {
      used: 0,
      capBytes: personId != null ? await getEffectiveCapBytes("teacher", personId) : null,
      files: { assignments: [], materials: [], notices: [], chat: [] },
    };
  }

  const [assignmentRows, materialRows, noticeRows, chatRows, used] = await Promise.all([
    db
      .select({
        id: lmsAssignmentFiles.id,
        fileName: lmsAssignmentFiles.fileName,
        mimeType: lmsAssignmentFiles.mimeType,
        sizeBytes: lmsAssignmentFiles.sizeBytes,
        createdAt: lmsAssignmentFiles.createdAt,
        deletedAt: lmsAssignmentFiles.deletedAt,
        context: lmsAssignments.title,
      })
      .from(lmsAssignmentFiles)
      .leftJoin(lmsAssignments, eq(lmsAssignments.id, lmsAssignmentFiles.assignmentId))
      .where(eq(lmsAssignmentFiles.uploadedByAccountId, accountId))
      .orderBy(desc(lmsAssignmentFiles.createdAt)),
    db
      .select({
        id: lmsMaterialFiles.id,
        fileName: lmsMaterialFiles.fileName,
        mimeType: lmsMaterialFiles.mimeType,
        sizeBytes: lmsMaterialFiles.sizeBytes,
        createdAt: lmsMaterialFiles.createdAt,
        deletedAt: lmsMaterialFiles.deletedAt,
        context: lmsMaterials.title,
      })
      .from(lmsMaterialFiles)
      .innerJoin(lmsMaterials, eq(lmsMaterials.id, lmsMaterialFiles.materialId))
      .where(eq(lmsMaterials.createdByAccountId, accountId))
      .orderBy(desc(lmsMaterialFiles.createdAt)),
    db
      .select({
        id: lmsNoticeFiles.id,
        fileName: lmsNoticeFiles.fileName,
        mimeType: lmsNoticeFiles.mimeType,
        sizeBytes: lmsNoticeFiles.sizeBytes,
        createdAt: lmsNoticeFiles.createdAt,
        deletedAt: lmsNoticeFiles.deletedAt,
        context: lmsNotices.title,
      })
      .from(lmsNoticeFiles)
      .innerJoin(lmsNotices, eq(lmsNotices.id, lmsNoticeFiles.noticeId))
      .where(eq(lmsNotices.createdByAccountId, accountId))
      .orderBy(desc(lmsNoticeFiles.createdAt)),
    db
      .select({
        id: lmsAssignmentQuestions.id,
        fileName: lmsAssignmentQuestions.fileName,
        mimeType: lmsAssignmentQuestions.mimeType,
        sizeBytes: lmsAssignmentQuestions.sizeBytes,
        createdAt: lmsAssignmentQuestions.createdAt,
        context: lmsAssignments.title,
      })
      .from(lmsAssignmentQuestions)
      .leftJoin(lmsAssignments, eq(lmsAssignments.id, lmsAssignmentQuestions.assignmentId))
      .where(
        and(
          eq(lmsAssignmentQuestions.authorRole, "teacher"),
          eq(lmsAssignmentQuestions.authorAccountId, accountId),
          isNotNull(lmsAssignmentQuestions.objectKey),
        ),
      )
      .orderBy(desc(lmsAssignmentQuestions.createdAt)),
    getTeacherUsageBytes(accountId),
  ]);

  const cap = personId != null ? await getEffectiveCapBytes("teacher", personId) : null;

  return {
    used,
    capBytes: cap,
    files: {
      assignments: assignmentRows.map((r) => ({
        kind: "assignment" as const,
        id: r.id,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt.toISOString(),
        trashed: r.deletedAt != null,
        context: r.context ?? null,
      })),
      materials: materialRows.map((r) => ({
        kind: "material" as const,
        id: r.id,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt.toISOString(),
        trashed: r.deletedAt != null,
        context: r.context ?? null,
      })),
      notices: noticeRows.map((r) => ({
        kind: "notice" as const,
        id: r.id,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt.toISOString(),
        trashed: r.deletedAt != null,
        context: r.context ?? null,
      })),
      chat: chatRows
        .filter((r) => r.fileName != null)
        .map((r) => ({
          kind: "chat" as const,
          id: r.id,
          fileName: r.fileName as string,
          mimeType: r.mimeType ?? "application/octet-stream",
          sizeBytes: r.sizeBytes ?? 0,
          createdAt: r.createdAt.toISOString(),
          trashed: false,
          context: r.context ?? null,
        })),
    },
  };
}

export type ParentMyStorage = {
  used: number;
  capBytes: number | null;
  files: { submissions: MyFile[]; chat: MyFile[] };
};

/** Parents upload nothing today — a static, honest empty view. */
export async function getMyStorageParent(parentId: number): Promise<ParentMyStorage> {
  await ensureSchemaExtras();
  return {
    used: 0,
    capBytes: await getEffectiveCapBytes("parent", parentId),
    files: { submissions: [], chat: [] },
  };
}

/* ── purge (manual, admin-driven) ──────────────────────────────────────── */

export type PurgeResult =
  | { ok: true; reclaimed: number }
  | { ok: false; error: string };

async function deleteBucketObject(objectKey: string): Promise<void> {
  await getStorage()
    .deleteObject(objectKey)
    .catch(() => undefined);
}

/** Delete ONE submission file: bucket object + its lms_submission_files row. */
export async function purgeSubmissionFile(id: number): Promise<PurgeResult> {
  await ensureSchemaExtras();
  const [row] = await db
    .select()
    .from(lmsSubmissionFiles)
    .where(eq(lmsSubmissionFiles.id, id));
  if (!row) return { ok: false, error: "File row not found." };
  await deleteBucketObject(row.objectKey);
  await db.delete(lmsSubmissionFiles).where(eq(lmsSubmissionFiles.id, id));
  return { ok: true, reclaimed: row.sizeBytes };
}

/** D.3 — purge ONE teacher assignment attachment (bucket object + row). */
export async function purgeAssignmentFile(id: number): Promise<PurgeResult> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({ objectKey: lmsAssignmentFiles.objectKey, sizeBytes: lmsAssignmentFiles.sizeBytes })
    .from(lmsAssignmentFiles)
    .where(eq(lmsAssignmentFiles.id, id));
  if (!row) return { ok: false, error: "File row not found." };
  await deleteBucketObject(row.objectKey);
  await db.delete(lmsAssignmentFiles).where(eq(lmsAssignmentFiles.id, id));
  return { ok: true, reclaimed: row.sizeBytes };
}

/** D.3 — purge ONE material file (bucket object + row). */
export async function purgeMaterialFile(id: number): Promise<PurgeResult> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({ objectKey: lmsMaterialFiles.objectKey, sizeBytes: lmsMaterialFiles.sizeBytes })
    .from(lmsMaterialFiles)
    .where(eq(lmsMaterialFiles.id, id));
  if (!row) return { ok: false, error: "File row not found." };
  await deleteBucketObject(row.objectKey);
  await db.delete(lmsMaterialFiles).where(eq(lmsMaterialFiles.id, id));
  return { ok: true, reclaimed: row.sizeBytes };
}

/** D.3 — purge ONE notice file (bucket object + row). */
export async function purgeNoticeFile(id: number): Promise<PurgeResult> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({ objectKey: lmsNoticeFiles.objectKey, sizeBytes: lmsNoticeFiles.sizeBytes })
    .from(lmsNoticeFiles)
    .where(eq(lmsNoticeFiles.id, id));
  if (!row) return { ok: false, error: "File row not found." };
  await deleteBucketObject(row.objectKey);
  await db.delete(lmsNoticeFiles).where(eq(lmsNoticeFiles.id, id));
  return { ok: true, reclaimed: row.sizeBytes };
}

/**
 * Detach ONE chat attachment: bucket object gone, the message text stays,
 * the four file columns are nulled so the row stops claiming bytes.
 */
export async function purgeChatAttachment(id: number): Promise<PurgeResult> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({
      id: lmsAssignmentQuestions.id,
      objectKey: lmsAssignmentQuestions.objectKey,
      sizeBytes: lmsAssignmentQuestions.sizeBytes,
      deletedAt: lmsAssignmentQuestions.deletedAt,
    })
    .from(lmsAssignmentQuestions)
    .where(eq(lmsAssignmentQuestions.id, id));
  if (!row) return { ok: false, error: "Message not found." };
  if (!row.objectKey) return { ok: false, error: "This message has no attachment." };
  await deleteBucketObject(row.objectKey);
  await db
    .update(lmsAssignmentQuestions)
    .set({ objectKey: null, fileName: null, mimeType: null, sizeBytes: null })
    .where(eq(lmsAssignmentQuestions.id, id));
  return { ok: true, reclaimed: row.sizeBytes ?? 0 };
}

/* ── D.3 ownership-guarded self-service purge + trash ──────────────────── */

export type TrashResult = { ok: true } | { ok: false; error: string };

/**
 * The student's own purge — ownership enforced IN THE SQL (the row must
 * carry ownerStudentId) before the shared purge helper runs.
 */
export async function purgeOwnSubmissionFile(
  id: number,
  ownerStudentId: number,
): Promise<PurgeResult> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({ id: lmsSubmissionFiles.id })
    .from(lmsSubmissionFiles)
    .where(and(eq(lmsSubmissionFiles.id, id), eq(lmsSubmissionFiles.studentId, ownerStudentId)))
    .limit(1);
  if (!row) return { ok: false, error: "File not found." };
  return purgeSubmissionFile(id);
}

/**
 * The teacher's own purge across the three file kinds — ownership resolved
 * through the owner column (assignments) or the parent row (materials,
 * notices) IN THE SQL, then the shared purge helper runs.
 */
export async function purgeOwnTeacherFile(
  kind: "assignment" | "material" | "notice",
  id: number,
  ownerAccountId: number,
): Promise<PurgeResult> {
  await ensureSchemaExtras();

  if (kind === "assignment") {
    const [row] = await db
      .select({ id: lmsAssignmentFiles.id })
      .from(lmsAssignmentFiles)
      .where(
        and(
          eq(lmsAssignmentFiles.id, id),
          eq(lmsAssignmentFiles.uploadedByAccountId, ownerAccountId),
        ),
      )
      .limit(1);
    if (!row) return { ok: false, error: "File not found." };
    return purgeAssignmentFile(id);
  }

  if (kind === "material") {
    const [row] = await db
      .select({ id: lmsMaterialFiles.id })
      .from(lmsMaterialFiles)
      .innerJoin(lmsMaterials, eq(lmsMaterials.id, lmsMaterialFiles.materialId))
      .where(
        and(eq(lmsMaterialFiles.id, id), eq(lmsMaterials.createdByAccountId, ownerAccountId)),
      )
      .limit(1);
    if (!row) return { ok: false, error: "File not found." };
    return purgeMaterialFile(id);
  }

  const [row] = await db
    .select({ id: lmsNoticeFiles.id })
    .from(lmsNoticeFiles)
    .innerJoin(lmsNotices, eq(lmsNotices.id, lmsNoticeFiles.noticeId))
    .where(and(eq(lmsNoticeFiles.id, id), eq(lmsNotices.createdByAccountId, ownerAccountId)))
    .limit(1);
  if (!row) return { ok: false, error: "File not found." };
  return purgeNoticeFile(id);
}

/**
 * Trash / restore ONE submission file. Ownership is enforced in the WHERE
 * (id AND studentId) — a wrong owner matches nothing and gets { ok: false }.
 */
export async function setSubmissionFileTrashed(
  id: number,
  trashed: boolean,
  ownerStudentId: number,
): Promise<TrashResult> {
  await ensureSchemaExtras();
  const updated = await db
    .update(lmsSubmissionFiles)
    .set({ deletedAt: trashed ? sql`now()` : null })
    .where(and(eq(lmsSubmissionFiles.id, id), eq(lmsSubmissionFiles.studentId, ownerStudentId)))
    .returning({ id: lmsSubmissionFiles.id });
  if (updated.length === 0) return { ok: false, error: "File not found." };
  return { ok: true };
}

/**
 * Trash / restore ONE teacher file. Ownership: assignments by their
 * uploaded_by_account_id; materials/notices through the parent row's
 * created_by_account_id (WHERE EXISTS) — all enforced in the SQL.
 */
export async function setTeacherFileTrashed(
  kind: "assignment" | "material" | "notice",
  id: number,
  trashed: boolean,
  ownerAccountId: number,
): Promise<TrashResult> {
  await ensureSchemaExtras();
  const deletedAt = trashed ? sql`now()` : null;

  if (kind === "assignment") {
    const updated = await db
      .update(lmsAssignmentFiles)
      .set({ deletedAt })
      .where(
        and(
          eq(lmsAssignmentFiles.id, id),
          eq(lmsAssignmentFiles.uploadedByAccountId, ownerAccountId),
        ),
      )
      .returning({ id: lmsAssignmentFiles.id });
    if (updated.length === 0) return { ok: false, error: "File not found." };
    return { ok: true };
  }

  if (kind === "material") {
    const updated = await db
      .update(lmsMaterialFiles)
      .set({ deletedAt })
      .where(
        and(
          eq(lmsMaterialFiles.id, id),
          sql`exists (select 1 from "lms_materials" m where m."id" = ${lmsMaterialFiles.materialId} and m."created_by_account_id" = ${ownerAccountId})`,
        ),
      )
      .returning({ id: lmsMaterialFiles.id });
    if (updated.length === 0) return { ok: false, error: "File not found." };
    return { ok: true };
  }

  const updated = await db
    .update(lmsNoticeFiles)
    .set({ deletedAt })
    .where(
      and(
        eq(lmsNoticeFiles.id, id),
        sql`exists (select 1 from "lms_notices" n where n."id" = ${lmsNoticeFiles.noticeId} and n."created_by_account_id" = ${ownerAccountId})`,
      ),
    )
    .returning({ id: lmsNoticeFiles.id });
  if (updated.length === 0) return { ok: false, error: "File not found." };
  return { ok: true };
}

/**
 * D.3 self-service chat purge: the AUTHOR removes their own attachment —
 * bucket object gone, the four file columns nulled, the message text stays.
 * Only rows whose author_account_id matches are touched.
 */
export async function purgeOwnChatAttachment(
  id: number,
  authorAccountId: number,
): Promise<PurgeResult> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({
      objectKey: lmsAssignmentQuestions.objectKey,
      sizeBytes: lmsAssignmentQuestions.sizeBytes,
    })
    .from(lmsAssignmentQuestions)
    .where(
      and(
        eq(lmsAssignmentQuestions.id, id),
        eq(lmsAssignmentQuestions.authorAccountId, authorAccountId),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Message not found." };
  if (!row.objectKey) return { ok: false, error: "This message has no attachment." };
  await deleteBucketObject(row.objectKey);
  await db
    .update(lmsAssignmentQuestions)
    .set({ objectKey: null, fileName: null, mimeType: null, sizeBytes: null })
    .where(eq(lmsAssignmentQuestions.id, id));
  return { ok: true, reclaimed: row.sizeBytes ?? 0 };
}
