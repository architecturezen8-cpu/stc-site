import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureLmsPerson } from "@/lib/lms-identity";
import {
  lmsAssignmentFiles,
  lmsAssignmentGroupMembers,
  lmsAssignmentGroups,
  lmsAssignmentQuestions,
  lmsAssignments,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsMaterialFiles,
  lmsStudents,
  lmsSubjects,
  lmsSubmissionFiles,
  lmsSubmissions,
  lmsTeachers,
} from "@/db/schema-lms";
import { getStorage } from "@/lib/storage";
import { isVideoExt } from "@/lib/portal-file-types";
import {
  loadTeacherThreads,
  unansweredCountsByAssignment,
  type TeacherThreadView,
} from "@/lib/portal-questions";

/**
 * PHASE 3.1-d — Assignments & submissions depth (v2.8.42.0).
 *
 * The full classroom loop on top of the lms_assignments / lms_submissions
 * tables that have been waiting since Phase 3.1-a:
 *   teacher posts (class + subject + title + instructions + due) →
 *   student sees it in Homework → submits text →
 *   teacher sees who submitted (late flag) → grades with score + feedback →
 *   student reads the result. Re-submitting stays open until the work is
 *   graded; after that the submission is locked for the student.
 *
 * Every helper is ownership-checked at the SERVER boundary:
 *  · a teacher only ever touches assignments of their OWN class_subjects,
 *  · a student only ever submits to work assigned to THEIR enrolled class.
 * Every failure degrades to { ok:false, error } — never an exception stack
 * in a JSON response.
 */

const MAX_SCORE = 1000;
const MAX_TEXT = 5000;
const MAX_TITLE = 160;
const MAX_INSTRUCTIONS = 2000;
/* v2.8.57.0 — Phase 4.1 groups */
const MAX_GROUP_NAME = 80;
const MAX_GROUP_COUNT = 30;
/* v2.8.58.0 — batch member add: bigger than any real class roster. */
const MAX_BATCH_MEMBERS = 60;

/* ── v2.8.43.0 attachments ────────────────────────────────────────────
   Every answer / assignment may carry up to 8 files + one reference
   link. Files live in the shared storage layer under lms-work/; the
   upload endpoint enforces the same type + size rules before any of
   these refs ever reaches the database. */
export const MAX_FILES_PER_GROUP = 8;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** v2.8.67.1 — videos get the owner-approved 100 MB per-file cap. */
export const VIDEO_FILE_BYTES = 100 * 1024 * 1024;
const MAX_LINK_LENGTH = 500;

export type AssignmentFileRef = {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Validates the client-supplied file refs that accompany a create / submit
 * call. Only freshly minted upload keys (lms-work/…) are accepted — this is
 * NOT a way to reference arbitrary media-library objects. Returns null when
 * the payload is malformed, [] when nothing was attached.
 */
export function sanitizeFileRefs(input: unknown): AssignmentFileRef[] | null {
  if (input == null) return [];
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_FILES_PER_GROUP) return null;
  const out: AssignmentFileRef[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw == null) return null;
    const ref = raw as Record<string, unknown>;
    const key = typeof ref.key === "string" ? ref.key.trim() : "";
    const fileName = typeof ref.fileName === "string" ? ref.fileName.trim().slice(0, 180) : "";
    const mimeType =
      typeof ref.mimeType === "string" && ref.mimeType.trim() !== ""
        ? ref.mimeType.trim().slice(0, 120)
        : "application/octet-stream";
    const sizeBytes = Number(ref.sizeBytes);
    if (!key.startsWith("lms-work/") || key.length > 200) return null;
    if (fileName.length < 1) return null;
    /* v2.8.67.1 — per-type caps: the cap follows the FILENAME's extension so
       a presigned 100 MB video ref passes while a 100 MB pdf never does. */
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const cap = isVideoExt(ext) ? VIDEO_FILE_BYTES : MAX_FILE_BYTES;
    if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > cap) return null;
    out.push({ key, fileName, mimeType, sizeBytes });
  }
  return out;
}

/** Accepts http(s) and mailto: links only — everything else is rejected. */
export function sanitizeLinkUrl(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false };
  const trimmed = input.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_LINK_LENGTH) return { ok: false };
  if (!/^(https?:\/\/\S+|mailto:\S+@\S+\.\S+)$/i.test(trimmed)) return { ok: false };
  return { ok: true, value: trimmed };
}

function colomboDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
  }).format(date);
}

function colomboTime(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** "24 Oct · 5:00 PM" — the friendly due label used across the portals. */
export function dueLabelFor(date: Date | null): string {
  if (!date) return "No due date";
  return `${colomboDate(date)} · ${colomboTime(date)}`;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/* ── Teacher ──────────────────────────────────────────────────────────── */

export type TeacherClassSubjectOption = {
  csId: number;
  classId: number;
  className: string;
  subjectName: string;
  students: number;
};

/** The class×subject pairs this teacher may post work for, with roll counts. */
export async function getTeacherAssignmentOptions(
  accountId: number,
): Promise<TeacherClassSubjectOption[]> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return [];

  const pairs = await db
    .select({
      csId: lmsClassSubjects.id,
      classId: lmsClassSubjects.classId,
      className: lmsClasses.name,
      subjectName: lmsSubjects.name,
    })
    .from(lmsClassSubjects)
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
    .where(eq(lmsClassSubjects.teacherId, teacher.id))
    .orderBy(lmsClasses.name, lmsSubjects.name);

  if (pairs.length === 0) return [];

  const counts = await db
    .select({
      classId: lmsEnrollments.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(lmsEnrollments)
    .where(
      and(
        inArray(
          lmsEnrollments.classId,
          pairs.map((p) => p.classId),
        ),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .groupBy(lmsEnrollments.classId);
  const byClass = new Map(counts.map((c) => [c.classId, c.count]));

  /* Year-end staleness guard: pairs on classes with no ACTIVE enrollment
     left (the rollover moved everyone on) are dropped — work posted to an
     empty old-year class reaches nobody. */
  return pairs
    .filter((p) => (byClass.get(p.classId) ?? 0) > 0)
    .map((p) => ({
      csId: p.csId,
      classId: p.classId,
      className: p.className,
      subjectName: p.subjectName,
      students: byClass.get(p.classId) ?? 0,
    }));
}

export type TeacherAssignmentItem = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  instructions: string;
  dueLabel: string;
  postedLabel: string;
  submittedCount: number;
  gradedCount: number;
  students: number;
  fileCount: number;
  hasLink: boolean;
  /* v2.8.50.0 — Phase 2.1: threads still waiting for the teacher's reply. */
  unansweredQuestions: number;
};

/** Every assignment the teacher has posted, newest first, with roll counts. */
export async function getTeacherAssignments(
  accountId: number,
): Promise<TeacherAssignmentItem[]> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return [];

  const rows = await db
    .select({
      id: lmsAssignments.id,
      classSubjectId: lmsAssignments.classSubjectId,
      title: lmsAssignments.title,
      instructions: lmsAssignments.instructions,
      dueAt: lmsAssignments.dueAt,
      createdAt: lmsAssignments.createdAt,
      isActive: lmsAssignments.isActive,
      className: lmsClasses.name,
      subjectName: lmsSubjects.name,
      classId: lmsClassSubjects.classId,
    })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
    .where(and(eq(lmsClassSubjects.teacherId, teacher.id), eq(lmsAssignments.isActive, true)))
    .orderBy(desc(lmsAssignments.createdAt))
    .limit(60);

  if (rows.length === 0) return [];

  const classIds = [...new Set(rows.map((r) => r.classId))];
  const counts = await db
    .select({
      classId: lmsEnrollments.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(lmsEnrollments)
    .where(
      and(
        inArray(lmsEnrollments.classId, classIds),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .groupBy(lmsEnrollments.classId);
  const byClass = new Map(counts.map((c) => [c.classId, c.count]));

  const ids = rows.map((r) => r.id);
  const submissionStats = await db
    .select({
      assignmentId: lmsSubmissions.assignmentId,
      submitted: sql<number>`count(*)::int`,
      graded: sql<number>`count(${lmsSubmissions.score})::int`,
    })
    .from(lmsSubmissions)
    .where(inArray(lmsSubmissions.assignmentId, ids))
    .groupBy(lmsSubmissions.assignmentId);
  const statsById = new Map(submissionStats.map((s) => [s.assignmentId, s]));

  /* v2.8.43.0 — attachment counts + link flag for the list cards. */
  const fileCounts = await db
    .select({
      assignmentId: lmsAssignmentFiles.assignmentId,
      count: sql<number>`count(*)::int`,
    })
    .from(lmsAssignmentFiles)
    /* v2.8.85.0 — files trashed from My Storage stop appearing here too. */
    .where(
      and(
        inArray(lmsAssignmentFiles.assignmentId, ids),
        isNull(lmsAssignmentFiles.deletedAt),
      ),
    )
    .groupBy(lmsAssignmentFiles.assignmentId);
  const countsById = new Map(fileCounts.map((f) => [f.assignmentId, f.count]));
  const linkRows = await db
    .select({ id: lmsAssignments.id, linkUrl: lmsAssignments.linkUrl })
    .from(lmsAssignments)
    .where(inArray(lmsAssignments.id, ids));
  const linkById = new Map(linkRows.map((l) => [l.id, Boolean(l.linkUrl)]));

  /* v2.8.50.0 — Phase 2.1: threads still waiting for a teacher reply. */
  const unanswered = await unansweredCountsByAssignment(ids);

  return rows.map((r) => ({
    id: r.id,
    classSubjectId: r.classSubjectId,
    className: r.className,
    subjectName: r.subjectName,
    title: r.title,
    instructions: r.instructions ?? "",
    dueLabel: dueLabelFor(r.dueAt),
    postedLabel: colomboDate(r.createdAt),
    submittedCount: statsById.get(r.id)?.submitted ?? 0,
    gradedCount: statsById.get(r.id)?.graded ?? 0,
    students: byClass.get(r.classId) ?? 0,
    fileCount: countsById.get(r.id) ?? 0,
    hasLink: linkById.get(r.id) ?? false,
    unansweredQuestions: unanswered.get(r.id) ?? 0,
  }));
}

export type AssignmentSubmissionRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  status: "pending" | "submitted" | "graded";
  isLate: boolean;
  contentText: string;
  submittedLabel: string;
  score: number | null;
  feedback: string;
  files: AssignmentFileRef[];
  linkUrl: string;
};

export type TeacherAssignmentDetail = {
  id: number;
  classSubjectId: number;
  title: string;
  instructions: string;
  className: string;
  subjectName: string;
  dueLabel: string;
  /* v2.8.49.0 — raw due instant + a datetime-local string that the SERVER
     parses back to the exact same moment (zero timezone drift when the
     edit form is saved untouched). */
  dueAt: string | null;
  dueAtInput: string;
  /* v2.8.56.0 — Phase 3.2: the mark ceiling (grade letters derive from
     score ÷ maxScore, both here and on the student's side). */
  maxScore: number;
  files: AssignmentFileRef[];
  linkUrl: string;
  submissions: AssignmentSubmissionRow[];
  /* v2.8.50.0 — Phase 2.1: the private Q&A threads ("Ask the teacher")
     keyed by student; only threads that already carry messages appear. */
  threads: TeacherThreadView[];
  /* v2.8.57.0 — Phase 4.1: group rows when this is group work (NULL on
     the classic individual works). Members carry the final mark. */
  groups: AssignmentGroupRow[] | null;
};

/**
 * v2.8.49.0 — formats a stored instant as the datetime-local value in the
 * SERVER's own wall clock. new Date("<that string>") on this server lands
 * on the same instant, so edit forms round-trip without shifting.
 */
export function serverLocalInputValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The register view for ONE assignment: every enrolled student joined with
 * their submission (left join — students who haven't submitted still show,
 * with status "pending"). Ownership enforced; null when not the owner.
 */
export async function getTeacherAssignmentDetail(
  accountId: number,
  assignmentId: number,
): Promise<TeacherAssignmentDetail | null> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return null;

  const [assignment] = await db
    .select({
      id: lmsAssignments.id,
      classSubjectId: lmsAssignments.classSubjectId,
      title: lmsAssignments.title,
      instructions: lmsAssignments.instructions,
      dueAt: lmsAssignments.dueAt,
      linkUrl: lmsAssignments.linkUrl,
      maxScore: lmsAssignments.maxScore,
      classId: lmsClassSubjects.classId,
      className: lmsClasses.name,
      subjectName: lmsSubjects.name,
    })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
    .where(
      and(
        eq(lmsAssignments.id, assignmentId),
        eq(lmsClassSubjects.teacherId, teacher.id),
        eq(lmsAssignments.isActive, true),
      ),
    )
    .limit(1);
  if (!assignment) return null;

  /* v2.8.43.0 — the teacher's own attachments + every student's files in
     two batched queries, then grouped in memory. */
  const teacherFiles = await db
    .select({
      key: lmsAssignmentFiles.objectKey,
      fileName: lmsAssignmentFiles.fileName,
      mimeType: lmsAssignmentFiles.mimeType,
      sizeBytes: lmsAssignmentFiles.sizeBytes,
    })
    .from(lmsAssignmentFiles)
    /* v2.8.85.0 — the detail view honours the trash as well. */
    .where(
      and(
        eq(lmsAssignmentFiles.assignmentId, assignmentId),
        isNull(lmsAssignmentFiles.deletedAt),
      ),
    )
    .orderBy(lmsAssignmentFiles.id);
  const studentFileRows = await db
    .select({
      studentId: lmsSubmissionFiles.studentId,
      key: lmsSubmissionFiles.objectKey,
      fileName: lmsSubmissionFiles.fileName,
      mimeType: lmsSubmissionFiles.mimeType,
      sizeBytes: lmsSubmissionFiles.sizeBytes,
    })
    .from(lmsSubmissionFiles)
    /* v2.8.85.0 — trashed student answers leave the grading view. */
    .where(
      and(
        eq(lmsSubmissionFiles.assignmentId, assignmentId),
        isNull(lmsSubmissionFiles.deletedAt),
      ),
    )
    .orderBy(lmsSubmissionFiles.id);
  const filesByStudent = new Map<number, AssignmentFileRef[]>();
  for (const f of studentFileRows) {
    const list = filesByStudent.get(f.studentId) ?? [];
    list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
    filesByStudent.set(f.studentId, list);
  }

  const rows = await db
    .select({
      studentId: lmsEnrollments.studentId,
      admissionNo: lmsStudents.admissionNo,
      fullName: lmsStudents.fullName,
      submissionId: lmsSubmissions.id,
      contentText: lmsSubmissions.contentText,
      linkUrl: lmsSubmissions.linkUrl,
      submittedAt: lmsSubmissions.submittedAt,
      isLate: lmsSubmissions.isLate,
      score: lmsSubmissions.score,
      feedback: lmsSubmissions.feedback,
      submissionGroupId: lmsSubmissions.groupId,
    })
    .from(lmsEnrollments)
    .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
    .leftJoin(
      lmsSubmissions,
      and(
        eq(lmsSubmissions.studentId, lmsEnrollments.studentId),
        eq(lmsSubmissions.assignmentId, assignmentId),
      ),
    )
    .where(
      and(
        eq(lmsEnrollments.classId, assignment.classId),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .orderBy(lmsStudents.fullName);

  /* v2.8.50.0 — Phase 2.1: the Q&A threads for this assignment (ownership
     already established above, so the raw loader is safe here). */
  const threads = await loadTeacherThreads(assignmentId);

  /* v2.8.57.0 — Phase 4.1: group rows when this is group work. The team's
     submission rides on the uploader's roster row (the group row's
     student_id is the member who submitted), so no extra join is needed —
     the files map already holds them under the uploader's id. */
  const groupRows = await db
    .select({ id: lmsAssignmentGroups.id, name: lmsAssignmentGroups.name })
    .from(lmsAssignmentGroups)
    .where(eq(lmsAssignmentGroups.assignmentId, assignmentId))
    .orderBy(lmsAssignmentGroups.id);
  let groups: AssignmentGroupRow[] | null = null;
  if (groupRows.length > 0) {
    const memberRows = await db
      .select({
        groupId: lmsAssignmentGroupMembers.groupId,
        studentId: lmsAssignmentGroupMembers.studentId,
        adjustment: lmsAssignmentGroupMembers.adjustment,
        admissionNo: lmsStudents.admissionNo,
        fullName: lmsStudents.fullName,
      })
      .from(lmsAssignmentGroupMembers)
      .innerJoin(lmsStudents, eq(lmsAssignmentGroupMembers.studentId, lmsStudents.id))
      .where(eq(lmsAssignmentGroupMembers.assignmentId, assignmentId))
      .orderBy(lmsStudents.fullName);

    const subByGroup = new Map<
      number,
      AssignmentGroupSubmissionView & { score: number | null }
    >();
    for (const r of rows) {
      if (r.submissionGroupId == null || subByGroup.has(r.submissionGroupId)) continue;
      subByGroup.set(r.submissionGroupId, {
        status: r.score != null ? ("graded" as const) : ("submitted" as const),
        contentText: r.contentText ?? "",
        submittedLabel:
          r.submittedAt != null
            ? `${colomboDate(r.submittedAt)} · ${colomboTime(r.submittedAt)}`
            : "",
        isLate: Boolean(r.isLate),
        score: r.score,
        feedback: r.feedback ?? "",
        submittedByName: r.fullName,
        files: filesByStudent.get(r.studentId) ?? [],
        linkUrl: r.linkUrl ?? "",
      });
    }

    groups = groupRows.map((g) => {
      const sub = subByGroup.get(g.id) ?? null;
      const members = memberRows
        .filter((m) => m.groupId === g.id)
        .map((m) => ({
          studentId: m.studentId,
          admissionNo: m.admissionNo,
          fullName: m.fullName,
          adjustment: m.adjustment,
          finalScore: finalScoreFor(sub?.score ?? null, m.adjustment, assignment.maxScore),
        }));
      return {
        groupId: g.id,
        name: g.name,
        members,
        submission: sub,
      };
    });
  }

  return {
    id: assignment.id,
    classSubjectId: assignment.classSubjectId,
    title: assignment.title,
    instructions: assignment.instructions ?? "",
    className: assignment.className,
    subjectName: assignment.subjectName,
    dueLabel: dueLabelFor(assignment.dueAt),
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    dueAtInput: serverLocalInputValue(assignment.dueAt),
    maxScore: assignment.maxScore,
    files: teacherFiles.map((f) => ({
      key: f.key,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    })),
    linkUrl: assignment.linkUrl ?? "",
    threads,
    submissions: rows.map((r) => ({
      studentId: r.studentId,
      admissionNo: r.admissionNo,
      fullName: r.fullName,
      status:
        r.submissionId == null
          ? ("pending" as const)
          : r.score != null
            ? ("graded" as const)
            : ("submitted" as const),
      isLate: Boolean(r.isLate),
      contentText: r.contentText ?? "",
      submittedLabel:
        r.submittedAt != null
          ? `${colomboDate(r.submittedAt)} · ${colomboTime(r.submittedAt)}`
          : "",
      score: r.score,
      feedback: r.feedback ?? "",
      files: filesByStudent.get(r.studentId) ?? [],
      linkUrl: r.linkUrl ?? "",
    })),
    groups,
  };
}

export type AssignmentMutation =
  | { ok: true; id?: number }
  | { ok: false; error: string };

/** Teacher posts a new assignment for one of THEIR class×subject pairs. */
export async function createAssignment(input: {
  accountId: number;
  classSubjectId: number;
  title: unknown;
  instructions: unknown;
  dueAt: unknown;
  linkUrl?: unknown;
  files?: unknown;
}): Promise<AssignmentMutation> {
  const teacher = (await ensureLmsPerson("teacher", input.accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return { ok: false, error: "Teacher record missing." };

  const csId = Number(input.classSubjectId);
  if (!Number.isInteger(csId) || csId <= 0) {
    return { ok: false, error: "Pick a class and subject." };
  }
  const [pair] = await db
    .select({ id: lmsClassSubjects.id })
    .from(lmsClassSubjects)
    .where(
      and(eq(lmsClassSubjects.id, csId), eq(lmsClassSubjects.teacherId, teacher.id)),
    )
    .limit(1);
  if (!pair) {
    return { ok: false, error: "That class-subject is not yours to assign." };
  }

  const title = cleanText(input.title, MAX_TITLE);
  if (title.length < 3) {
    return { ok: false, error: "Give the assignment a title (3+ characters)." };
  }
  const instructions = cleanText(input.instructions, MAX_INSTRUCTIONS);

  /* v2.8.43.0 — attachments: files uploaded through the portal upload
     endpoint + one reference link. Both optional. */
  const files = sanitizeFileRefs(input.files);
  if (files == null) {
    return { ok: false, error: "One of the attachments is not valid." };
  }
  const link = sanitizeLinkUrl(input.linkUrl);
  if (!link.ok) {
    return { ok: false, error: "The link must be a http(s) or mailto address." };
  }

  let dueAt: Date | null = null;
  if (typeof input.dueAt === "string" && input.dueAt.trim() !== "") {
    const parsed = new Date(input.dueAt);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: "The due date is not valid." };
    }
    dueAt = parsed;
  }

  const [created] = await db
    .insert(lmsAssignments)
    .values({
      classSubjectId: csId,
      title,
      instructions: instructions || null,
      dueAt,
      linkUrl: link.value,
      createdByAccountId: input.accountId,
    })
    .returning({ id: lmsAssignments.id });

  if (created && files.length > 0) {
    await db.insert(lmsAssignmentFiles).values(
      files.map((f) => ({
        assignmentId: created.id,
        objectKey: f.key,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        uploadedByAccountId: input.accountId,
      })),
    );
  }

  return { ok: true, id: created?.id };
}

/** Teacher grades ONE submission (score 0–1000 + feedback). Re-grading overwrites. */
export async function gradeSubmission(input: {
  accountId: number;
  assignmentId: number;
  studentId: number;
  score: unknown;
  feedback: unknown;
}): Promise<AssignmentMutation> {
  const assignmentId = Number(input.assignmentId);
  const studentId = Number(input.studentId);
  if (!Number.isInteger(assignmentId) || !Number.isInteger(studentId)) {
    return { ok: false, error: "Bad request." };
  }

  const [owned] = await db
    .select({ id: lmsAssignments.id, maxScore: lmsAssignments.maxScore })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .innerJoin(lmsTeachers, eq(lmsClassSubjects.teacherId, lmsTeachers.id))
    .where(
      and(
        eq(lmsAssignments.id, assignmentId),
        eq(lmsTeachers.accountId, input.accountId),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Not your assignment." };

  /* v2.8.57.0 — Phase 4.1: group work grades through the GROUP pen. */
  const [groupWork] = await db
    .select({ id: lmsAssignmentGroups.id })
    .from(lmsAssignmentGroups)
    .where(eq(lmsAssignmentGroups.assignmentId, assignmentId))
    .limit(1);
  if (groupWork) {
    return {
      ok: false,
      error: "This is group work — grade the groups instead.",
    };
  }

  /* v2.8.56.0 — Phase 3.2: the ceiling is THIS assignment's own max_score
     (legacy rows default 100). MAX_SCORE stays as the absolute sanity cap. */
  const ceiling = Math.min(owned.maxScore || MAX_SCORE, MAX_SCORE);

  let score: number | null = null;
  if (input.score !== null && input.score !== undefined && input.score !== "") {
    const parsed = Number(input.score);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > ceiling) {
      return { ok: false, error: `Score must be between 0 and ${ceiling}.` };
    }
    score = Math.round(parsed);
  }
  const feedback = cleanText(input.feedback, MAX_INSTRUCTIONS);

  const updated = await db
    .update(lmsSubmissions)
    .set({
      score,
      feedback: feedback || null,
      gradedAt: new Date(),
      gradedByAccountId: input.accountId,
    })
    .where(
      and(
        eq(lmsSubmissions.assignmentId, assignmentId),
        eq(lmsSubmissions.studentId, studentId),
      ),
    )
    .returning({ id: lmsSubmissions.id });

  if (updated.length === 0) {
    return { ok: false, error: "That student has not submitted yet." };
  }
  return { ok: true };
}

/* ══ v2.8.57.0 — PHASE 4.1: GROUP ASSIGNMENTS (Option B) ═══════════════
   The owner's approved design: teacher-created groups; ONE submission per
   group (any member submits, the whole team sees it); graded per group
   with an optional per-student adjustment; two small tables.

   Group mode is DERIVED: an assignment is group work exactly when it has
   rows in lms_assignment_groups — no extra mode flag to keep in step. */

export type AssignmentGroupMemberRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  adjustment: number | null;
  /** final mark when the group is graded: clamp(group score + adjustment) */
  finalScore: number | null;
};

export type AssignmentGroupSubmissionView = {
  status: "submitted" | "graded";
  contentText: string;
  submittedLabel: string;
  isLate: boolean;
  score: number | null;
  feedback: string;
  submittedByName: string;
  files: AssignmentFileRef[];
  linkUrl: string;
};

export type AssignmentGroupRow = {
  groupId: number;
  name: string;
  members: AssignmentGroupMemberRow[];
  submission: AssignmentGroupSubmissionView | null;
};

export type AssignmentGroupManagerRow = {
  groupId: number;
  name: string;
  memberIds: number[];
  hasSubmission: boolean;
};

export type AssignmentGroupManagerView = {
  maxScore: number;
  locked: boolean;
  groups: AssignmentGroupManagerRow[];
  /** every actively-enrolled student of the class who is in NO group yet */
  ungrouped: { studentId: number; admissionNo: string; fullName: string }[];
};

/** Small helper: the final mark for one member (server-computed truth). */
function finalScoreFor(
  groupScore: number | null,
  adjustment: number | null,
  maxScore: number,
): number | null {
  if (groupScore == null) return null;
  const raw = groupScore + (adjustment ?? 0);
  return Math.max(0, Math.min(maxScore, raw));
}

/** The shared ownership gate for every group call: THIS teacher's assignment. */
async function ownedAssignmentForTeacher(
  accountId: number,
  assignmentId: number,
): Promise<{ id: number; classId: number; maxScore: number } | null> {
  const [row] = await db
    .select({
      id: lmsAssignments.id,
      classId: lmsClassSubjects.classId,
      maxScore: lmsAssignments.maxScore,
    })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .innerJoin(lmsTeachers, eq(lmsClassSubjects.teacherId, lmsTeachers.id))
    .where(
      and(
        eq(lmsAssignments.id, assignmentId),
        eq(lmsTeachers.accountId, accountId),
        eq(lmsAssignments.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The teacher's group manager payload: groups + members, whether the
 * structure is locked (any group has submitted — v2.8.49's "roster pinned"
 * rule, applied to teams), and the not-yet-grouped roster.
 */
export async function getAssignmentGroupManager(
  accountId: number,
  assignmentId: number,
): Promise<AssignmentGroupManagerView | null> {
  const owned = await ownedAssignmentForTeacher(accountId, assignmentId);
  if (!owned) return null;

  const groupRows = await db
    .select({ id: lmsAssignmentGroups.id, name: lmsAssignmentGroups.name })
    .from(lmsAssignmentGroups)
    .where(eq(lmsAssignmentGroups.assignmentId, assignmentId))
    .orderBy(lmsAssignmentGroups.id);

  const memberRows = groupRows.length
    ? await db
        .select({
          groupId: lmsAssignmentGroupMembers.groupId,
          studentId: lmsAssignmentGroupMembers.studentId,
        })
        .from(lmsAssignmentGroupMembers)
        .where(eq(lmsAssignmentGroupMembers.assignmentId, assignmentId))
    : [];
  const membersByGroup = new Map<number, number[]>();
  const groupedIds = new Set<number>();
  for (const m of memberRows) {
    const list = membersByGroup.get(m.groupId) ?? [];
    list.push(m.studentId);
    membersByGroup.set(m.groupId, list);
    groupedIds.add(m.studentId);
  }

  const submissionRows = await db
    .select({ groupId: lmsSubmissions.groupId })
    .from(lmsSubmissions)
    .where(eq(lmsSubmissions.assignmentId, assignmentId));
  const submittedGroupIds = new Set(
    submissionRows.map((r) => r.groupId).filter((g): g is number => g != null),
  );

  const roster = await db
    .select({
      studentId: lmsEnrollments.studentId,
      admissionNo: lmsStudents.admissionNo,
      fullName: lmsStudents.fullName,
    })
    .from(lmsEnrollments)
    .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
    .where(
      and(
        eq(lmsEnrollments.classId, owned.classId),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .orderBy(lmsStudents.fullName);

  return {
    maxScore: owned.maxScore,
    locked: submittedGroupIds.size > 0,
    groups: groupRows.map((g) => ({
      groupId: g.id,
      name: g.name,
      memberIds: membersByGroup.get(g.id) ?? [],
      hasSubmission: submittedGroupIds.has(g.id),
    })),
    ungrouped: roster.filter((r) => !groupedIds.has(r.studentId)),
  };
}

/**
 * Create / rename / delete groups and move members. The STRUCTURE is
 * locked the moment any group has submitted (members can no longer be
 * reshuffled — the submitted work belongs to a pinned team); grading and
 * adjustments stay open as usual.
 */
export async function mutateAssignmentGroup(input: {
  accountId: number;
  assignmentId: number;
  action: unknown;
  groupId?: unknown;
  name?: unknown;
  studentId?: unknown;
  /* v2.8.58.0 — batch member add: the picker may send SEVERAL students in
     one request ("add the whole team at once"). `studentId` stays for the
     single-add path and older clients. */
  studentIds?: unknown;
}): Promise<AssignmentMutation> {
  const assignmentId = Number(input.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return { ok: false, error: "Bad request." };
  }
  const owned = await ownedAssignmentForTeacher(input.accountId, assignmentId);
  if (!owned) return { ok: false, error: "Not your assignment." };

  const action = String(input.action ?? "");
  const groupId = Number(input.groupId);

  const [submittedRow] = await db
    .select({ id: lmsSubmissions.id })
    .from(lmsSubmissions)
    .where(
      and(
        eq(lmsSubmissions.assignmentId, assignmentId),
        sql`${lmsSubmissions.groupId} is not null`,
      ),
    )
    .limit(1);
  const structureLocked = Boolean(submittedRow);
  if (
    structureLocked &&
    action !== "noop" &&
    action !== "grade"
  ) {
    return {
      ok: false,
      error:
        "Groups are locked — work has already been submitted by a team.",
    };
  }

  if (action === "create") {
    const name = cleanText(input.name, MAX_GROUP_NAME);
    if (name.length < 1) {
      return { ok: false, error: "Give the group a name." };
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lmsAssignmentGroups)
      .where(eq(lmsAssignmentGroups.assignmentId, assignmentId));
    if (count >= MAX_GROUP_COUNT) {
      return { ok: false, error: `A work can hold at most ${MAX_GROUP_COUNT} groups.` };
    }
    await db
      .insert(lmsAssignmentGroups)
      .values({ assignmentId, name });
    return { ok: true };
  }

  if (action === "rename") {
    if (!Number.isInteger(groupId)) return { ok: false, error: "Bad request." };
    const name = cleanText(input.name, MAX_GROUP_NAME);
    if (name.length < 1) {
      return { ok: false, error: "Give the group a name." };
    }
    await db
      .update(lmsAssignmentGroups)
      .set({ name })
      .where(
        and(
          eq(lmsAssignmentGroups.id, groupId),
          eq(lmsAssignmentGroups.assignmentId, assignmentId),
        ),
      );
    return { ok: true };
  }

  if (action === "delete") {
    if (!Number.isInteger(groupId)) return { ok: false, error: "Bad request." };
    const [group] = await db
      .select({ id: lmsAssignmentGroups.id })
      .from(lmsAssignmentGroups)
      .where(
        and(
          eq(lmsAssignmentGroups.id, groupId),
          eq(lmsAssignmentGroups.assignmentId, assignmentId),
        ),
      )
      .limit(1);
    if (!group) return { ok: false, error: "Group not found." };
    const [groupSubmission] = await db
      .select({ id: lmsSubmissions.id })
      .from(lmsSubmissions)
      .where(
        and(
          eq(lmsSubmissions.assignmentId, assignmentId),
          eq(lmsSubmissions.groupId, groupId),
        ),
      )
      .limit(1);
    if (groupSubmission) {
      return {
        ok: false,
        error: "This group has already submitted — the submission must be cleared first.",
      };
    }
    await db
      .delete(lmsAssignmentGroupMembers)
      .where(eq(lmsAssignmentGroupMembers.groupId, groupId));
    await db
      .delete(lmsAssignmentGroups)
      .where(eq(lmsAssignmentGroups.id, groupId));
    return { ok: true };
  }

  if (action === "addMember" || action === "removeMember") {
    /* v2.8.58.0 — addMember takes ONE studentId OR a studentIds[] batch;
       removeMember stays single. */
    const hasBatch =
      action === "addMember" &&
      Array.isArray(input.studentIds) &&
      input.studentIds.length > 0;
    if (
      !Number.isInteger(groupId) ||
      (!hasBatch && !Number.isInteger(Number(input.studentId)))
    ) {
      return { ok: false, error: "Bad request." };
    }
    const studentId = Number(input.studentId);
    const [group] = await db
      .select({ id: lmsAssignmentGroups.id })
      .from(lmsAssignmentGroups)
      .where(
        and(
          eq(lmsAssignmentGroups.id, groupId),
          eq(lmsAssignmentGroups.assignmentId, assignmentId),
        ),
      )
      .limit(1);
    if (!group) return { ok: false, error: "Group not found." };

    if (action === "removeMember") {
      await db
        .delete(lmsAssignmentGroupMembers)
        .where(
          and(
            eq(lmsAssignmentGroupMembers.groupId, groupId),
            eq(lmsAssignmentGroupMembers.studentId, studentId),
          ),
        );
      return { ok: true };
    }

    /* addMember — every student must be actively enrolled in THIS class and
       not already placed in another group of the same assignment.
       v2.8.58.0 — the whole batch is validated BEFORE anything is written
       (all-or-nothing: the teacher fixes the one bad pick and resends, no
       half-formed teams), then one multi-row insert lands them all. */
    const wanted = [
      ...new Set(
        (Array.isArray(input.studentIds) ? input.studentIds : [input.studentId])
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0),
      ),
    ];
    if (wanted.length === 0) return { ok: false, error: "Bad request." };
    if (wanted.length > MAX_BATCH_MEMBERS) {
      return { ok: false, error: `Add at most ${MAX_BATCH_MEMBERS} students at a time.` };
    }

    const enrolledIds = new Set(
      (
        await db
          .select({ studentId: lmsEnrollments.studentId })
          .from(lmsEnrollments)
          .where(
            and(
              inArray(lmsEnrollments.studentId, wanted),
              eq(lmsEnrollments.classId, owned.classId),
              eq(lmsEnrollments.status, "active"),
            ),
          )
      ).map((r) => r.studentId),
    );
    for (const sid of wanted) {
      if (!enrolledIds.has(sid)) {
        return { ok: false, error: "One of those students is not in this class." };
      }
    }
    const busyIds = new Set(
      (
        await db
          .select({ studentId: lmsAssignmentGroupMembers.studentId })
          .from(lmsAssignmentGroupMembers)
          .where(
            and(
              eq(lmsAssignmentGroupMembers.assignmentId, assignmentId),
              inArray(lmsAssignmentGroupMembers.studentId, wanted),
            ),
          )
      ).map((r) => r.studentId),
    );
    if (busyIds.size > 0) {
      return { ok: false, error: "One of those students is already in a group." };
    }
    await db
      .insert(lmsAssignmentGroupMembers)
      .values(wanted.map((sid) => ({ assignmentId, groupId, studentId: sid })))
      .onConflictDoNothing();
    return { ok: true };
  }

  return { ok: false, error: "Unknown group action." };
}

/**
 * Grade ONE group: a score + feedback on the group's submission, plus the
 * optional per-student adjustments (deltas on top of the group score).
 * Any member of the team reads the same result with their final mark.
 */
export async function gradeGroupSubmission(input: {
  accountId: number;
  assignmentId: number;
  groupId: unknown;
  score: unknown;
  feedback: unknown;
  adjustments?: unknown;
}): Promise<AssignmentMutation> {
  const assignmentId = Number(input.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return { ok: false, error: "Bad request." };
  }
  const groupId = Number(input.groupId);
  if (!Number.isInteger(groupId)) return { ok: false, error: "Bad request." };

  const owned = await ownedAssignmentForTeacher(input.accountId, assignmentId);
  if (!owned) return { ok: false, error: "Not your assignment." };

  const [group] = await db
    .select({ id: lmsAssignmentGroups.id })
    .from(lmsAssignmentGroups)
    .where(
      and(
        eq(lmsAssignmentGroups.id, groupId),
        eq(lmsAssignmentGroups.assignmentId, assignmentId),
      ),
    )
    .limit(1);
  if (!group) return { ok: false, error: "Group not found." };

  /* the score ceiling is THIS assignment's own max_score */
  const ceiling = Math.min(owned.maxScore || MAX_SCORE, MAX_SCORE);
  let score: number | null = null;
  if (input.score !== null && input.score !== undefined && input.score !== "") {
    const parsed = Number(input.score);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > ceiling) {
      return { ok: false, error: `Score must be between 0 and ${ceiling}.` };
    }
    score = Math.round(parsed);
  }
  const feedback = cleanText(input.feedback, MAX_INSTRUCTIONS);

  const [groupSubmission] = await db
    .select({ id: lmsSubmissions.id })
    .from(lmsSubmissions)
    .where(
      and(
        eq(lmsSubmissions.assignmentId, assignmentId),
        eq(lmsSubmissions.groupId, groupId),
      ),
    )
    .limit(1);
  if (!groupSubmission) {
    return { ok: false, error: "That group has not submitted yet." };
  }

  await db
    .update(lmsSubmissions)
    .set({
      score,
      feedback: feedback || null,
      gradedAt: new Date(),
      gradedByAccountId: input.accountId,
    })
    .where(eq(lmsSubmissions.id, groupSubmission.id));

  /* optional per-student adjustments — only members of THIS group */
  if (input.adjustments !== null && input.adjustments !== undefined) {
    if (!Array.isArray(input.adjustments)) {
      return { ok: false, error: "Adjustments must be a list." };
    }
    const memberRows = await db
      .select({ studentId: lmsAssignmentGroupMembers.studentId })
      .from(lmsAssignmentGroupMembers)
      .where(eq(lmsAssignmentGroupMembers.groupId, groupId));
    const memberIds = new Set(memberRows.map((m) => m.studentId));

    for (const raw of input.adjustments) {
      const entry = raw as { studentId?: unknown; adjustment?: unknown };
      const studentId = Number(entry?.studentId);
      if (!Number.isInteger(studentId) || !memberIds.has(studentId)) {
        return { ok: false, error: "An adjustment is for a student outside this group." };
      }
      let adjustment: number | null = null;
      if (
        entry?.adjustment !== null &&
        entry?.adjustment !== undefined &&
        entry?.adjustment !== ""
      ) {
        const parsed = Number(entry.adjustment);
        if (!Number.isFinite(parsed) || parsed < -ceiling || parsed > ceiling) {
          return {
            ok: false,
            error: `Adjustments must be between −${ceiling} and +${ceiling}.`,
          };
        }
        adjustment = Math.round(parsed);
      }
      await db
        .update(lmsAssignmentGroupMembers)
        .set({ adjustment })
        .where(
          and(
            eq(lmsAssignmentGroupMembers.groupId, groupId),
            eq(lmsAssignmentGroupMembers.studentId, studentId),
          ),
        );
    }
  }

  return { ok: true };
}

/* ── v2.8.49.0 — Phase 1.2: editing a posted assignment ────────────────
   Fresh attachment keys may never reference bytes that already belong to
   another post or a student submission — every other key on THIS post is
   simply kept (no re-upload needed). */
async function assertKeysAreFresh(keys: string[]): Promise<string | null> {
  if (keys.length === 0) return null;
  const [elsewhere, submissions, materials] = await Promise.all([
    db
      .select({ key: lmsAssignmentFiles.objectKey })
      .from(lmsAssignmentFiles)
      .where(inArray(lmsAssignmentFiles.objectKey, keys))
      .limit(1),
    db
      .select({ key: lmsSubmissionFiles.objectKey })
      .from(lmsSubmissionFiles)
      .where(inArray(lmsSubmissionFiles.objectKey, keys))
      .limit(1),
    db
      .select({ key: lmsMaterialFiles.objectKey })
      .from(lmsMaterialFiles)
      .where(inArray(lmsMaterialFiles.objectKey, keys))
      .limit(1),
  ]);
  if (submissions.length > 0) {
    return "One of the files is already attached to a student's submission.";
  }
  if (elsewhere.length > 0 || materials.length > 0) {
    return "One of the files is already attached to another post.";
  }
  return null;
}

/**
 * v2.8.49.0 — Phase 1.2: the teacher EDITS a posted assignment.
 * Every field is optional — undefined always means "keep what is there",
 * so partial patches can never wipe data by accident.
 *
 * Safety rules:
 *  · nobody has submitted → free edit, including moving the class×subject;
 *  · submissions exist    → title / instructions / due date / attachments
 *    stay correctable, but the class×subject is locked (the register
 *    roster is pinned to it — moving it would orphan the submissions).
 * Attachment edits reconcile in place: kept keys reuse the stored rows,
 * removed keys drop their rows AND their stored bytes, new keys must be
 * freshly uploaded through the portal uploader.
 */
export async function updateAssignment(input: {
  accountId: number;
  assignmentId: number;
  classSubjectId?: unknown;
  title?: unknown;
  instructions?: unknown;
  dueAt?: unknown;
  linkUrl?: unknown;
  files?: unknown;
}): Promise<AssignmentMutation> {
  const teacher = (await ensureLmsPerson("teacher", input.accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return { ok: false, error: "Teacher record missing." };

  const assignmentId = Number(input.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return { ok: false, error: "Bad request." };
  }

  const [owned] = await db
    .select({
      id: lmsAssignments.id,
      classSubjectId: lmsAssignments.classSubjectId,
      title: lmsAssignments.title,
      instructions: lmsAssignments.instructions,
      dueAt: lmsAssignments.dueAt,
      linkUrl: lmsAssignments.linkUrl,
    })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .where(
      and(
        eq(lmsAssignments.id, assignmentId),
        eq(lmsClassSubjects.teacherId, teacher.id),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Not your assignment." };

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lmsSubmissions)
    .where(eq(lmsSubmissions.assignmentId, assignmentId));
  const hasSubmissions = (countRow?.count ?? 0) > 0;

  /* class×subject — locked once submissions exist */
  let classSubjectId = owned.classSubjectId;
  if (input.classSubjectId !== undefined) {
    const next = Number(input.classSubjectId);
    if (!Number.isInteger(next) || next <= 0) {
      return { ok: false, error: "Pick a class and subject." };
    }
    if (next !== owned.classSubjectId) {
      if (hasSubmissions) {
        return {
          ok: false,
          error:
            "Students have already submitted work — the class can no longer be moved.",
        };
      }
      const [pair] = await db
        .select({ id: lmsClassSubjects.id })
        .from(lmsClassSubjects)
        .where(
          and(eq(lmsClassSubjects.id, next), eq(lmsClassSubjects.teacherId, teacher.id)),
        )
        .limit(1);
      if (!pair) {
        return { ok: false, error: "That class-subject is not yours to assign." };
      }
      classSubjectId = next;
    }
  }

  let title = owned.title;
  if (input.title !== undefined) {
    title = cleanText(input.title, MAX_TITLE);
    if (title.length < 3) {
      return { ok: false, error: "Give the assignment a title (3+ characters)." };
    }
  }

  let instructions = owned.instructions;
  if (input.instructions !== undefined) {
    instructions = cleanText(input.instructions, MAX_INSTRUCTIONS) || null;
  }

  let dueAt = owned.dueAt;
  if (input.dueAt !== undefined) {
    if (typeof input.dueAt === "string" && input.dueAt.trim() !== "") {
      const parsed = new Date(input.dueAt);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "The due date is not valid." };
      }
      dueAt = parsed;
    } else {
      dueAt = null; /* empty string = clear the due date */
    }
  }

  let linkUrl = owned.linkUrl;
  if (input.linkUrl !== undefined) {
    const link = sanitizeLinkUrl(input.linkUrl);
    if (!link.ok) {
      return { ok: false, error: "The link must be a http(s) or mailto address." };
    }
    linkUrl = link.value;
  }

  /* attachments — undefined = untouched; present (even []) = full replace */
  if (input.files !== undefined) {
    const incoming = sanitizeFileRefs(input.files);
    if (incoming == null) {
      return { ok: false, error: "One of the attachments is not valid." };
    }
    const seen = new Set<string>();
    const wanted: AssignmentFileRef[] = [];
    for (const f of incoming) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        wanted.push(f);
      }
    }
    if (wanted.length > MAX_FILES_PER_GROUP) {
      return {
        ok: false,
        error: `Up to ${MAX_FILES_PER_GROUP} files per assignment.`,
      };
    }

    const existingRows = await db
      .select({
        id: lmsAssignmentFiles.id,
        key: lmsAssignmentFiles.objectKey,
      })
      .from(lmsAssignmentFiles)
      .where(eq(lmsAssignmentFiles.assignmentId, assignmentId));
    const existingByKey = new Map(existingRows.map((r) => [r.key, r]));

    const fresh = wanted.filter((f) => !existingByKey.has(f.key));
    const freshError = await assertKeysAreFresh(fresh.map((f) => f.key));
    if (freshError) return { ok: false, error: freshError };

    const removeRows = existingRows.filter((r) => !seen.has(r.key));
    if (removeRows.length > 0) {
      await db
        .delete(lmsAssignmentFiles)
        .where(
          inArray(
            lmsAssignmentFiles.id,
            removeRows.map((r) => r.id),
          ),
        );
      const storage = getStorage();
      await Promise.allSettled(
        removeRows.map((r) =>
          storage.deleteObject(r.key).catch(() => undefined),
        ),
      );
    }
    if (fresh.length > 0) {
      await db.insert(lmsAssignmentFiles).values(
        fresh.map((f) => ({
          assignmentId,
          objectKey: f.key,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          uploadedByAccountId: input.accountId,
        })),
      );
    }
  }

  await db
    .update(lmsAssignments)
    .set({ classSubjectId, title, instructions, dueAt, linkUrl })
    .where(eq(lmsAssignments.id, owned.id));

  return { ok: true, id: owned.id };
}

/** Teacher retires an assignment (soft — rows stay for the record). */
export async function deactivateAssignment(
  accountId: number,
  assignmentId: number,
): Promise<AssignmentMutation> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return { ok: false, error: "Teacher record missing." };

  const [owned] = await db
    .select({ id: lmsAssignments.id })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .where(
      and(
        eq(lmsAssignments.id, Number(assignmentId)),
        eq(lmsClassSubjects.teacherId, teacher.id),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Not your assignment." };

  await db
    .update(lmsAssignments)
    .set({ isActive: false })
    .where(eq(lmsAssignments.id, owned.id));
  return { ok: true };
}

/**
 * v2.8.61.0 — the owner: "assignment delete option ekak na ne … edit
 * karanna withari puluwan delete karanna ba". A REAL delete: the work, its
 * files, every submission + answer file, the Q&A threads and the groups all
 * go, inside ONE transaction; the storage blobs are reclaimed after the
 * commit (best-effort, same as the edit path). The tests' hard delete
 * (deleteAssessment) is the precedent — one honest confirm and it is gone.
 */
export async function deleteAssignment(
  accountId: number,
  assignmentId: number,
): Promise<AssignmentMutation> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return { ok: false, error: "Teacher record missing." };

  const numericId = Number(assignmentId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: "Bad assignment id." };
  }

  /* Same ownership gate as retire/edit: the work must sit on a class_subject
     the signed-in teacher owns. */
  const [owned] = await db
    .select({ id: lmsAssignments.id })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .where(
      and(
        eq(lmsAssignments.id, numericId),
        eq(lmsClassSubjects.teacherId, teacher.id),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Not your assignment." };

  /* Collect every blob key BEFORE the transaction so the storage cleanup
     can run after the rows are gone. */
  const assignmentFileRows = await db
    .select({ key: lmsAssignmentFiles.objectKey })
    .from(lmsAssignmentFiles)
    .where(eq(lmsAssignmentFiles.assignmentId, numericId));
  const submissionFileRows = await db
    .select({ key: lmsSubmissionFiles.objectKey })
    .from(lmsSubmissionFiles)
    .where(eq(lmsSubmissionFiles.assignmentId, numericId));
  const blobKeys = [
    ...assignmentFileRows.map((r) => r.key),
    ...submissionFileRows.map((r) => r.key),
  ];

  await db.transaction(async (tx) => {
    await tx
      .delete(lmsAssignmentGroupMembers)
      .where(eq(lmsAssignmentGroupMembers.assignmentId, numericId));
    await tx
      .delete(lmsAssignmentGroups)
      .where(eq(lmsAssignmentGroups.assignmentId, numericId));
    await tx
      .delete(lmsAssignmentQuestions)
      .where(eq(lmsAssignmentQuestions.assignmentId, numericId));
    await tx
      .delete(lmsSubmissionFiles)
      .where(eq(lmsSubmissionFiles.assignmentId, numericId));
    await tx
      .delete(lmsSubmissions)
      .where(eq(lmsSubmissions.assignmentId, numericId));
    await tx
      .delete(lmsAssignmentFiles)
      .where(eq(lmsAssignmentFiles.assignmentId, numericId));
    await tx.delete(lmsAssignments).where(eq(lmsAssignments.id, numericId));
  });

  if (blobKeys.length > 0) {
    const storage = getStorage();
    await Promise.allSettled(
      blobKeys.map((key) => storage.deleteObject(key).catch(() => undefined)),
    );
  }

  return { ok: true };
}

/* ── Student ──────────────────────────────────────────────────────────── */

export type StudentHomeworkItem = {
  id: number;
  title: string;
  instructions: string;
  subject: string;
  className: string;
  dueLabel: string;
  dueAt: string | null;
  duePassed: boolean;
  status: "pending" | "submitted" | "graded";
  isLate: boolean;
  myText: string;
  submittedLabel: string;
  score: number | null;
  /* v2.8.56.0 — Phase 3.2: the scale the score is out of (grade letters
     A/B/C/S/W derive from score ÷ maxScore on every view). */
  maxScore: number;
  feedback: string;
  teacherFiles: AssignmentFileRef[];
  linkUrl: string;
  myFiles: AssignmentFileRef[];
  myLinkUrl: string;
  /* v2.8.57.0 — Phase 4.1: group work fields (group mode is derived from
     the membership tables; every field is null/false on individual work). */
  isGroup: boolean;
  groupName: string | null;
  groupMembers: { studentId: number; fullName: string; admissionNo: string }[];
  myAdjustment: number | null;
  /** the mark THIS student reads: group score + own adjustment, clamped */
  finalScore: number | null;
};

/**
 * The student's homework list with FULL submission state — this feeds the
 * interactive Homework panel (open → read instructions → submit / re-submit
 * → read the score + feedback).
 */
export async function getStudentHomework(
  accountId: number,
): Promise<StudentHomeworkItem[]> {
  const student = (await ensureLmsPerson("student", accountId)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!student) return [];

  const enrollments = await db
    .select({ classId: lmsEnrollments.classId })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.studentId, student.id),
        eq(lmsEnrollments.status, "active"),
      ),
    );
  if (enrollments.length === 0) return [];
  const classIds = enrollments.map((e) => e.classId);

  const rows = await db
    .select({
      id: lmsAssignments.id,
      title: lmsAssignments.title,
      instructions: lmsAssignments.instructions,
      dueAt: lmsAssignments.dueAt,
      linkUrl: lmsAssignments.linkUrl,
      subjectName: lmsSubjects.name,
      className: lmsClasses.name,
      maxScore: lmsAssignments.maxScore,
      contentText: lmsSubmissions.contentText,
      myLinkUrl: lmsSubmissions.linkUrl,
      submittedAt: lmsSubmissions.submittedAt,
      isLate: lmsSubmissions.isLate,
      score: lmsSubmissions.score,
      feedback: lmsSubmissions.feedback,
    })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
    .leftJoin(
      lmsSubmissions,
      and(
        eq(lmsSubmissions.assignmentId, lmsAssignments.id),
        eq(lmsSubmissions.studentId, student.id),
      ),
    )
    .where(
      and(
        inArray(lmsClassSubjects.classId, classIds),
        eq(lmsAssignments.isActive, true),
      ),
    )
    .orderBy(desc(lmsAssignments.createdAt))
    .limit(30);

  if (rows.length === 0) return [];

  /* v2.8.43.0 — teacher attachments + the student's own uploaded files,
     batched over the whole list and grouped in memory. */
  const ids = rows.map((r) => r.id);
  const teacherFileRows = await db
    .select({
      assignmentId: lmsAssignmentFiles.assignmentId,
      key: lmsAssignmentFiles.objectKey,
      fileName: lmsAssignmentFiles.fileName,
      mimeType: lmsAssignmentFiles.mimeType,
      sizeBytes: lmsAssignmentFiles.sizeBytes,
    })
    .from(lmsAssignmentFiles)
    .where(inArray(lmsAssignmentFiles.assignmentId, ids))
    .orderBy(lmsAssignmentFiles.id);
  const teacherFilesById = new Map<number, AssignmentFileRef[]>();
  for (const f of teacherFileRows) {
    const list = teacherFilesById.get(f.assignmentId) ?? [];
    list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
    teacherFilesById.set(f.assignmentId, list);
  }
  const myFileRows = await db
    .select({
      assignmentId: lmsSubmissionFiles.assignmentId,
      key: lmsSubmissionFiles.objectKey,
      fileName: lmsSubmissionFiles.fileName,
      mimeType: lmsSubmissionFiles.mimeType,
      sizeBytes: lmsSubmissionFiles.sizeBytes,
    })
    .from(lmsSubmissionFiles)
    .where(
      and(
        inArray(lmsSubmissionFiles.assignmentId, ids),
        eq(lmsSubmissionFiles.studentId, student.id),
      ),
    )
    .orderBy(lmsSubmissionFiles.id);
  const myFilesById = new Map<number, AssignmentFileRef[]>();
  for (const f of myFileRows) {
    const list = myFilesById.get(f.assignmentId) ?? [];
    list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
    myFilesById.set(f.assignmentId, list);
  }

  /* v2.8.57.0 — Phase 4.1: my team for each group assignment. The group's
     ONE submission is what every member reads; the final mark is the group
     score + this student's own adjustment, clamped to the scale. */
  const myMemberRows = await db
    .select({
      assignmentId: lmsAssignmentGroupMembers.assignmentId,
      groupId: lmsAssignmentGroupMembers.groupId,
      adjustment: lmsAssignmentGroupMembers.adjustment,
      groupName: lmsAssignmentGroups.name,
    })
    .from(lmsAssignmentGroupMembers)
    .innerJoin(
      lmsAssignmentGroups,
      eq(lmsAssignmentGroupMembers.groupId, lmsAssignmentGroups.id),
    )
    .where(
      and(
        eq(lmsAssignmentGroupMembers.studentId, student.id),
        inArray(lmsAssignmentGroupMembers.assignmentId, ids),
      ),
    );
  const groupByAssignment = new Map(
    myMemberRows.map((m) => [m.assignmentId, m]),
  );
  const myGroupIds = [...new Set(myMemberRows.map((m) => m.groupId))];

  const groupSubRows = myGroupIds.length
    ? await db
        .select({
          id: lmsSubmissions.id,
          groupId: lmsSubmissions.groupId,
          assignmentId: lmsSubmissions.assignmentId,
          contentText: lmsSubmissions.contentText,
          linkUrl: lmsSubmissions.linkUrl,
          submittedAt: lmsSubmissions.submittedAt,
          isLate: lmsSubmissions.isLate,
          score: lmsSubmissions.score,
          feedback: lmsSubmissions.feedback,
        })
        .from(lmsSubmissions)
        .where(inArray(lmsSubmissions.groupId, myGroupIds))
    : [];
  const groupSubByGroup = new Map(
    groupSubRows.map((s) => [s.groupId ?? -1, s]),
  );

  const teamNameRows = myGroupIds.length
    ? await db
        .select({
          groupId: lmsAssignmentGroupMembers.groupId,
          studentId: lmsStudents.id,
          admissionNo: lmsStudents.admissionNo,
          fullName: lmsStudents.fullName,
        })
        .from(lmsAssignmentGroupMembers)
        .innerJoin(lmsStudents, eq(lmsAssignmentGroupMembers.studentId, lmsStudents.id))
        .where(inArray(lmsAssignmentGroupMembers.groupId, myGroupIds))
        .orderBy(lmsStudents.fullName)
    : [];
  const teamByGroup = new Map<number, { studentId: number; fullName: string; admissionNo: string }[]>();
  for (const m of teamNameRows) {
    const list = teamByGroup.get(m.groupId) ?? [];
    list.push({ studentId: m.studentId, fullName: m.fullName, admissionNo: m.admissionNo });
    teamByGroup.set(m.groupId, list);
  }

  const groupSubFileRows = groupSubRows.length
    ? await db
        .select({
          submissionId: lmsSubmissionFiles.submissionId,
          key: lmsSubmissionFiles.objectKey,
          fileName: lmsSubmissionFiles.fileName,
          mimeType: lmsSubmissionFiles.mimeType,
          sizeBytes: lmsSubmissionFiles.sizeBytes,
        })
        .from(lmsSubmissionFiles)
        .where(
          inArray(
            lmsSubmissionFiles.submissionId,
            groupSubRows.map((s) => s.id),
          ),
        )
        .orderBy(lmsSubmissionFiles.id)
    : [];
  const filesBySubmission = new Map<number, AssignmentFileRef[]>();
  for (const f of groupSubFileRows) {
    const list = filesBySubmission.get(f.submissionId) ?? [];
    list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
    filesBySubmission.set(f.submissionId, list);
  }

  return rows.map((r) => {
    const grp = groupByAssignment.get(r.id) ?? null;
    const gsub = grp ? groupSubByGroup.get(grp.groupId) ?? null : null;
    const isGroup = grp != null;
    const submittedAt = isGroup ? gsub?.submittedAt ?? null : r.submittedAt;
    const score = isGroup ? gsub?.score ?? null : r.score;
    const myAdjustment = grp?.adjustment ?? null;
    const finalScore = finalScoreFor(score, myAdjustment, r.maxScore);
    return {
    id: r.id,
    title: r.title,
    instructions: r.instructions ?? "",
    subject: r.subjectName,
    className: r.className,
    dueLabel: dueLabelFor(r.dueAt),
    dueAt: r.dueAt ? r.dueAt.toISOString() : null,
    /* v2.8.44.0 — computed on the server so the client island never has to
       call the impure Date.now() during render (the React compiler lint). */
    duePassed: r.dueAt != null ? r.dueAt.getTime() < Date.now() : false,
    status:
      submittedAt == null
        ? ("pending" as const)
        : score != null
          ? ("graded" as const)
          : ("submitted" as const),
    isLate: Boolean(isGroup ? gsub?.isLate ?? false : r.isLate),
    myText: isGroup ? gsub?.contentText ?? "" : r.contentText ?? "",
    submittedLabel:
      submittedAt != null
        ? `${colomboDate(submittedAt)} · ${colomboTime(submittedAt)}`
        : "",
    score,
    maxScore: r.maxScore,
    feedback: isGroup ? gsub?.feedback ?? "" : r.feedback ?? "",
    teacherFiles: teacherFilesById.get(r.id) ?? [],
    linkUrl: r.linkUrl ?? "",
    myFiles: isGroup
      ? filesBySubmission.get(gsub?.id ?? -1) ?? []
      : myFilesById.get(r.id) ?? [],
    myLinkUrl: isGroup ? gsub?.linkUrl ?? "" : r.myLinkUrl ?? "",
    isGroup,
    groupName: grp?.groupName ?? null,
    groupMembers: grp ? teamByGroup.get(grp.groupId) ?? [] : [],
    myAdjustment,
    finalScore,
    };
  });
}

/**
 * Student submits (or re-submits) an answer for an assignment of THEIR class.
 * v2.8.43.0 — the answer may be text, files (uploaded through the portal
 * upload endpoint), a reference link, or any combination of the three.
 * Re-submitting replaces the whole attachment set (old blobs deleted).
 */
export async function upsertStudentSubmission(input: {
  accountId: number;
  assignmentId: number;
  contentText: unknown;
  linkUrl?: unknown;
  files?: unknown;
}): Promise<AssignmentMutation> {
  const student = (await ensureLmsPerson("student", input.accountId)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!student) return { ok: false, error: "Student record missing." };

  const assignmentId = Number(input.assignmentId);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return { ok: false, error: "Bad request." };
  }
  const contentText = cleanText(input.contentText, MAX_TEXT);
  const files = sanitizeFileRefs(input.files);
  if (files == null) {
    return { ok: false, error: "One of the attached files is not valid." };
  }
  const link = sanitizeLinkUrl(input.linkUrl);
  if (!link.ok) {
    return { ok: false, error: "The link must be a http(s) or mailto address." };
  }
  if (contentText.length < 2 && files.length === 0 && !link.value) {
    return {
      ok: false,
      error: "Write your answer, attach a file, or add a link before submitting.",
    };
  }

  const [assignment] = await db
    .select({
      id: lmsAssignments.id,
      dueAt: lmsAssignments.dueAt,
      classId: lmsClassSubjects.classId,
    })
    .from(lmsAssignments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssignments.classSubjectId, lmsClassSubjects.id),
    )
    .where(
      and(eq(lmsAssignments.id, assignmentId), eq(lmsAssignments.isActive, true)),
    )
    .limit(1);
  if (!assignment) return { ok: false, error: "Assignment not found." };

  const [enrolled] = await db
    .select({ id: lmsEnrollments.id })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.studentId, student.id),
        eq(lmsEnrollments.classId, assignment.classId),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .limit(1);
  if (!enrolled) {
    return { ok: false, error: "This work is not for your class." };
  }

  /* v2.8.57.0 — Phase 4.1: GROUP work. The answer belongs to the whole
     team — any member submits/edits it, everyone reads the same answer,
     and it is the GROUP's row (not the individual unique index) that the
     grade locks. The attachment set replaces by submission id. */
  const [myGroup] = await db
    .select({ groupId: lmsAssignmentGroupMembers.groupId })
    .from(lmsAssignmentGroupMembers)
    .where(
      and(
        eq(lmsAssignmentGroupMembers.assignmentId, assignmentId),
        eq(lmsAssignmentGroupMembers.studentId, student.id),
      ),
    )
    .limit(1);
  if (myGroup) {
    const [groupRow] = await db
      .select({ id: lmsSubmissions.id, score: lmsSubmissions.score })
      .from(lmsSubmissions)
      .where(
        and(
          eq(lmsSubmissions.assignmentId, assignmentId),
          eq(lmsSubmissions.groupId, myGroup.groupId),
        ),
      )
      .limit(1);
    if (groupRow && groupRow.score != null) {
      return { ok: false, error: "Already graded — the group's submission is locked." };
    }

    const now = new Date();
    const isLate =
      assignment.dueAt != null && now.getTime() > assignment.dueAt.getTime();
    let submissionId: number;
    if (groupRow) {
      await db
        .update(lmsSubmissions)
        .set({
          contentText: contentText || null,
          linkUrl: link.value,
          submittedAt: now,
          isLate,
          feedback: null,
          gradedAt: null,
          gradedByAccountId: null,
        })
        .where(eq(lmsSubmissions.id, groupRow.id));
      submissionId = groupRow.id;
    } else {
      const [created] = await db
        .insert(lmsSubmissions)
        .values({
          assignmentId,
          studentId: student.id,
          groupId: myGroup.groupId,
          contentText: contentText || null,
          linkUrl: link.value,
          submittedAt: now,
          isLate,
        })
        .returning({ id: lmsSubmissions.id });
      submissionId = created.id;
    }

    /* the group's one attachment set, replaced in place */
    const previous = await db
      .select({ key: lmsSubmissionFiles.objectKey })
      .from(lmsSubmissionFiles)
      .where(eq(lmsSubmissionFiles.submissionId, submissionId));
    if (previous.length > 0) {
      await db
        .delete(lmsSubmissionFiles)
        .where(eq(lmsSubmissionFiles.submissionId, submissionId));
      const keep = new Set(files.map((f) => f.key));
      const stale = previous.map((p) => p.key).filter((k) => !keep.has(k));
      for (const key of stale) {
        try {
          await getStorage().deleteObject(key);
        } catch {
          /* best-effort cleanup — the row is gone either way */
        }
      }
    }
    if (files.length > 0) {
      await db.insert(lmsSubmissionFiles).values(
        files.map((f) => ({
          submissionId,
          assignmentId,
          studentId: student.id,
          objectKey: f.key,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
      );
    }
    return { ok: true };
  }

  /* a student with no team cannot answer group work as an individual */
  const [anyGroup] = await db
    .select({ id: lmsAssignmentGroups.id })
    .from(lmsAssignmentGroups)
    .where(eq(lmsAssignmentGroups.assignmentId, assignmentId))
    .limit(1);
  if (anyGroup) {
    return {
      ok: false,
      error: "You are not in a group for this work yet — ask your teacher.",
    };
  }

  const [existing] = await db
    .select({ id: lmsSubmissions.id, score: lmsSubmissions.score })
    .from(lmsSubmissions)
    .where(
      and(
        eq(lmsSubmissions.assignmentId, assignmentId),
        eq(lmsSubmissions.studentId, student.id),
      ),
    )
    .limit(1);
  if (existing && existing.score != null) {
    return { ok: false, error: "Already graded — this submission is locked." };
  }

  const now = new Date();
  const isLate = assignment.dueAt != null && now.getTime() > assignment.dueAt.getTime();

  const [saved] = await db
    .insert(lmsSubmissions)
    .values({
      assignmentId,
      studentId: student.id,
      contentText: contentText || null,
      linkUrl: link.value,
      submittedAt: now,
      isLate,
    })
    .onConflictDoUpdate({
      target: [lmsSubmissions.assignmentId, lmsSubmissions.studentId],
      set: {
        contentText: contentText || null,
        linkUrl: link.value,
        submittedAt: now,
        isLate,
        // a re-submit clears any stale feedback but never the teacher's score
        feedback: null,
        gradedAt: null,
        gradedByAccountId: null,
      },
    })
    .returning({ id: lmsSubmissions.id });

  /* v2.8.43.0 — a submit/re-submit REPLACES the attachment set: old rows
     and their stored bytes are dropped, the new refs are pinned to the
     submission row. */
  if (saved) {
    const previous = await db
      .select({ key: lmsSubmissionFiles.objectKey })
      .from(lmsSubmissionFiles)
      .where(
        and(
          eq(lmsSubmissionFiles.assignmentId, assignmentId),
          eq(lmsSubmissionFiles.studentId, student.id),
        ),
      );
    if (previous.length > 0) {
      await db
        .delete(lmsSubmissionFiles)
        .where(
          and(
            eq(lmsSubmissionFiles.assignmentId, assignmentId),
            eq(lmsSubmissionFiles.studentId, student.id),
          ),
        );
      const keep = new Set(files.map((f) => f.key));
      const stale = previous.map((p) => p.key).filter((k) => !keep.has(k));
      for (const key of stale) {
        try {
          await getStorage().deleteObject(key);
        } catch {
          /* best-effort cleanup — the row is gone either way */
        }
      }
    }
    if (files.length > 0) {
      await db.insert(lmsSubmissionFiles).values(
        files.map((f) => ({
          submissionId: saved.id,
          assignmentId,
          studentId: student.id,
          objectKey: f.key,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
      );
    }
  }

  return { ok: true };
}

/** Kept for API completeness — count of open (unsubmitted) items for badges. */
export async function countOpenStudentAssignments(accountId: number): Promise<number> {
  const items = await getStudentHomework(accountId);
  return items.filter((i) => i.status === "pending").length;
}

/** Guard helper shared by the API routes — ensures an ungraded submission exists. */
export async function submissionExistsForGrading(
  assignmentId: number,
  studentId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: lmsSubmissions.id })
    .from(lmsSubmissions)
    .where(
      and(
        eq(lmsSubmissions.assignmentId, assignmentId),
        eq(lmsSubmissions.studentId, studentId),
        isNull(lmsSubmissions.score),
      ),
    )
    .limit(1);
  return Boolean(row);
}
