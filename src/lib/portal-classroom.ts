import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { ledByFilter } from "@/lib/portal-class-teacher";
import { ensureLmsPerson } from "@/lib/lms-identity";
import {
  lmsAssessments,
  lmsAssignmentFiles,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsMarks,
  lmsMaterialFiles,
  lmsMaterials,
  lmsNoticeFiles,
  lmsNotices,
  lmsStudents,
  lmsSubjects,
  lmsSubmissionFiles,
  lmsTeachers,
} from "@/db/schema-lms";
import { getStorage } from "@/lib/storage";
import {
  MAX_FILES_PER_GROUP,
  sanitizeFileRefs,
  sanitizeLinkUrl,
  type AssignmentFileRef,
} from "@/lib/portal-assignments";

/**
 * PHASE 3.1-e — Marks, Materials & Notices posting (v2.8.45.0).
 *
 * The teacher-side authoring half of the classroom, on top of the tables
 * that have waited since Phase 3.1-a:
 *   · lms_assessments + lms_marks — create a Term assessment for one of
 *     your class×subjects, then enter the class register of marks
 *     (bulk upsert — re-saving a day simply corrects it, like attendance);
 *   · lms_materials (+ the new lms_material_files) — hand out notes,
 *     worksheets, videos: N files through the SAME storage pipeline the
 *     assignment attachments use, plus one reference link;
 *   · lms_notices — short class notices the dashboard panels already read.
 *
 * Ownership is re-checked at the SERVER boundary on every call: a teacher
 * only ever touches assessments / materials of their OWN class_subjects
 * and notices of classes they teach or lead. Every failure degrades to
 * { ok:false, error } — never an exception stack in a JSON response.
 */

const MAX_TITLE = 160;
const MAX_BODY = 2000;
const MAX_MARKS_PER_SAVE = 200;
const TERMS = ["Term 1", "Term 2", "Term 3"] as const;

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function shortDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
  }).format(date);
}

async function teacherFromAccount(accountId: number) {
  return (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
}

/* ── shared option lists ─────────────────────────────────────────────── */

export type TeacherNoticeClassOption = {
  classId: number;
  className: string;
  students: number;
};

/**
 * Classes a teacher may post NOTICES for: every class they teach any
 * subject in, plus classes they lead as class teacher (mirrors the
 * attendance register's reach).
 */
export async function getTeacherNoticeClassOptions(
  accountId: number,
): Promise<TeacherNoticeClassOption[]> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return [];

  const taught = await db
    .select({
      classId: lmsClassSubjects.classId,
      className: lmsClasses.name,
      leads: lmsClasses.classTeacherId,
    })
    .from(lmsClassSubjects)
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .where(eq(lmsClassSubjects.teacherId, teacher.id));

  const led = await db
    .select({ classId: lmsClasses.id, className: lmsClasses.name })
    .from(lmsClasses)
    .where(ledByFilter(teacher.id)); // v2.8.83.0 — class teacher OR assistant

  const byId = new Map<number, string>();
  for (const row of taught) byId.set(row.classId, row.className);
  for (const row of led) byId.set(row.classId, row.className);
  if (byId.size === 0) return [];

  const counts = await db
    .select({
      classId: lmsEnrollments.classId,
      count: sql<number>`count(*)::int`,
    })
    .from(lmsEnrollments)
    .where(
      and(
        inArray(lmsEnrollments.classId, [...byId.keys()]),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .groupBy(lmsEnrollments.classId);
  const byClass = new Map(counts.map((c) => [c.classId, c.count]));

  /* Year-end staleness guard: classes with no ACTIVE enrollment left (the
     rollover moved everyone on) are dropped — posting a notice to an empty
     old-year class reaches nobody. */
  return [...byId.entries()]
    .filter(([classId]) => (byClass.get(classId) ?? 0) > 0)
    .map(([classId, className]) => ({
      classId,
      className,
      students: byClass.get(classId) ?? 0,
    }))
    .sort((a, b) => a.className.localeCompare(b.className));
}

/** Resolves one of the teacher's OWN class_subject rows (ownership check). */
async function ownedClassSubject(teacherId: number, csId: number) {
  const [row] = await db
    .select({
      csId: lmsClassSubjects.id,
      classId: lmsClassSubjects.classId,
      className: lmsClasses.name,
      subjectName: lmsSubjects.name,
    })
    .from(lmsClassSubjects)
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
    .where(and(eq(lmsClassSubjects.id, csId), eq(lmsClassSubjects.teacherId, teacherId)))
    .limit(1);
  return row ?? null;
}

/* ── Assessments & marks ─────────────────────────────────────────────── */

export type TeacherAssessmentItem = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  term: string;
  maxScore: number;
  markedCount: number;
  totalCount: number;
  avgPct: number | null;
  createdLabel: string;
};

export async function getTeacherAssessments(
  accountId: number,
): Promise<TeacherAssessmentItem[]> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return [];

  const rows = await db
    .select({
      id: lmsAssessments.id,
      classSubjectId: lmsAssessments.classSubjectId,
      title: lmsAssessments.title,
      term: lmsAssessments.term,
      maxScore: lmsAssessments.maxScore,
      createdAt: lmsAssessments.createdAt,
      classId: lmsClassSubjects.classId,
      className: lmsClasses.name,
      subjectName: lmsSubjects.name,
    })
    .from(lmsAssessments)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsAssessments.classSubjectId, lmsClassSubjects.id),
    )
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
    .where(eq(lmsClassSubjects.teacherId, teacher.id))
    .orderBy(desc(lmsAssessments.createdAt))
    .limit(80);

  if (rows.length === 0) return [];

  /* active roll per class + marked counts / average per assessment */
  const classIds = [...new Set(rows.map((r) => r.classId))];
  const rollRows = await db
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
  const rollByClass = new Map(rollRows.map((r) => [r.classId, r.count]));

  const markStats = await db
    .select({
      assessmentId: lmsMarks.assessmentId,
      marked: sql<number>`count(${lmsMarks.score})::int`,
      avg: sql<number>`avg(${lmsMarks.score} * 100.0 / ${lmsAssessments.maxScore})`,
    })
    .from(lmsMarks)
    .innerJoin(lmsAssessments, eq(lmsMarks.assessmentId, lmsAssessments.id))
    .where(
      inArray(
        lmsMarks.assessmentId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(lmsMarks.assessmentId);
  const statsById = new Map(markStats.map((m) => [m.assessmentId, m]));

  return rows.map((r) => {
    const stats = statsById.get(r.id);
    return {
      id: r.id,
      classSubjectId: r.classSubjectId,
      className: r.className,
      subjectName: r.subjectName,
      title: r.title,
      term: r.term,
      maxScore: r.maxScore,
      markedCount: stats?.marked ?? 0,
      totalCount: rollByClass.get(r.classId) ?? 0,
      avgPct: stats?.avg != null ? Math.round(Number(stats.avg)) : null,
      createdLabel: shortDate(r.createdAt),
    };
  });
}

export type AssessmentMarkRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  score: number | null;
};

export type TeacherAssessmentDetail = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  term: string;
  maxScore: number;
  rows: AssessmentMarkRow[];
};

/**
 * The marks register for ONE assessment: every actively-enrolled student
 * LEFT JOIN their mark — nobody disappears just because they are unmarked.
 */
export async function getTeacherAssessmentDetail(
  accountId: number,
  assessmentId: number,
): Promise<TeacherAssessmentDetail | null> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return null;

  const [assessment] = await db
    .select({
      id: lmsAssessments.id,
      classSubjectId: lmsAssessments.classSubjectId,
      title: lmsAssessments.title,
      term: lmsAssessments.term,
      maxScore: lmsAssessments.maxScore,
    })
    .from(lmsAssessments)
    .where(eq(lmsAssessments.id, assessmentId))
    .limit(1);
  if (!assessment) return null;

  const cs = await ownedClassSubject(teacher.id, assessment.classSubjectId);
  if (!cs) return null;

  const roster = await db
    .select({
      studentId: lmsEnrollments.studentId,
      admissionNo: lmsStudents.admissionNo,
      fullName: lmsStudents.fullName,
      score: lmsMarks.score,
    })
    .from(lmsEnrollments)
    .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
    .leftJoin(
      lmsMarks,
      and(
        eq(lmsMarks.studentId, lmsEnrollments.studentId),
        eq(lmsMarks.assessmentId, assessmentId),
      ),
    )
    .where(
      and(
        eq(lmsEnrollments.classId, cs.classId),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .orderBy(lmsStudents.fullName);

  return {
    id: assessment.id,
    classSubjectId: assessment.classSubjectId,
    className: cs.className,
    subjectName: cs.subjectName,
    title: assessment.title,
    term: assessment.term,
    maxScore: assessment.maxScore,
    rows: roster.map((r) => ({
      studentId: r.studentId,
      admissionNo: r.admissionNo,
      fullName: r.fullName,
      score: r.score,
    })),
  };
}

export async function createAssessment(
  accountId: number,
  input: {
    classSubjectId?: unknown;
    title?: unknown;
    term?: unknown;
    maxScore?: unknown;
  },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "teacher_profile_missing" };

  const csId = Number(input.classSubjectId);
  if (!Number.isInteger(csId) || csId <= 0) {
    return { ok: false, error: "Pick a class and subject first." };
  }
  const cs = await ownedClassSubject(teacher.id, csId);
  if (!cs) return { ok: false, error: "That class is not yours to assess." };

  const title = cleanText(input.title, MAX_TITLE);
  if (title.length < 3) {
    return { ok: false, error: "Give the assessment a title (3+ letters)." };
  }

  const termRaw = cleanText(input.term, 10);
  const term = (TERMS as readonly string[]).includes(termRaw) ? termRaw : "Term 1";

  const maxScore = Number(input.maxScore);
  const finalMax =
    Number.isInteger(maxScore) && maxScore >= 1 && maxScore <= 1000 ? maxScore : 100;

  const [saved] = await db
    .insert(lmsAssessments)
    .values({
      classSubjectId: csId,
      title,
      term,
      maxScore: finalMax,
      createdByAccountId: accountId,
    })
    .returning({ id: lmsAssessments.id });

  return saved
    ? { ok: true, id: saved.id }
    : { ok: false, error: "Could not save the assessment." };
}

export async function saveAssessmentMarks(
  accountId: number,
  assessmentId: number,
  marks: unknown,
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "teacher_profile_missing" };

  const [assessment] = await db
    .select({
      id: lmsAssessments.id,
      classSubjectId: lmsAssessments.classSubjectId,
      maxScore: lmsAssessments.maxScore,
    })
    .from(lmsAssessments)
    .where(eq(lmsAssessments.id, assessmentId))
    .limit(1);
  if (!assessment) return { ok: false, error: "not_found" };

  const cs = await ownedClassSubject(teacher.id, assessment.classSubjectId);
  if (!cs) return { ok: false, error: "not_found" };

  if (!Array.isArray(marks) || marks.length === 0) {
    return { ok: false, error: "Nothing to save yet." };
  }
  if (marks.length > MAX_MARKS_PER_SAVE) {
    return { ok: false, error: "Too many marks in one go." };
  }

  const clean = new Map<number, number | null>();
  for (const raw of marks) {
    if (typeof raw !== "object" || raw == null) {
      return { ok: false, error: "bad_request" };
    }
    const entry = raw as Record<string, unknown>;
    const studentId = Number(entry.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return { ok: false, error: "bad_request" };
    }
    if (clean.has(studentId)) return { ok: false, error: "bad_request" };
    if (entry.score == null || entry.score === "") {
      clean.set(studentId, null);
      continue;
    }
    const score = Number(entry.score);
    if (!Number.isInteger(score) || score < 0 || score > assessment.maxScore) {
      return {
        ok: false,
        error: `Scores must be whole numbers between 0 and ${assessment.maxScore}.`,
      };
    }
    clean.set(studentId, score);
  }

  /* every marked student must be actively enrolled in THIS class */
  const enrolled = await db
    .select({ studentId: lmsEnrollments.studentId })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.classId, cs.classId),
        eq(lmsEnrollments.status, "active"),
        inArray(lmsEnrollments.studentId, [...clean.keys()]),
      ),
    );
  if (enrolled.length !== clean.size) {
    return { ok: false, error: "not_enrolled" };
  }

  const rows = [...clean.entries()].map(([studentId, score]) => ({
    assessmentId,
    studentId,
    score,
    gradedByAccountId: accountId,
    updatedAt: new Date(),
  }));
  await db
    .insert(lmsMarks)
    .values(rows)
    .onConflictDoUpdate({
      target: [lmsMarks.assessmentId, lmsMarks.studentId],
      set: {
        score: sql`excluded.score`,
        gradedByAccountId: sql`excluded.graded_by_account_id`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  return { ok: true, saved: rows.length };
}

export async function deleteAssessment(
  accountId: number,
  assessmentId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "teacher_profile_missing" };

  const [assessment] = await db
    .select({ id: lmsAssessments.id, classSubjectId: lmsAssessments.classSubjectId })
    .from(lmsAssessments)
    .where(eq(lmsAssessments.id, assessmentId))
    .limit(1);
  if (!assessment) return { ok: false, error: "not_found" };

  const cs = await ownedClassSubject(teacher.id, assessment.classSubjectId);
  if (!cs) return { ok: false, error: "not_found" };

  await db.delete(lmsMarks).where(eq(lmsMarks.assessmentId, assessmentId));
  await db.delete(lmsAssessments).where(eq(lmsAssessments.id, assessmentId));
  return { ok: true };
}

/* ── Materials ───────────────────────────────────────────────────────── */

export type MaterialFileRef = AssignmentFileRef;

export type TeacherMaterialItem = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  linkUrl: string | null;
  fileCount: number;
  postedLabel: string;
  /* v2.8.77.0 — Phase 3.3 polish: the actual file refs, so the teacher's
     list can render the same chips the class sees (and re-download its
     own files) instead of a bare count. */
  files: MaterialFileRef[];
};

export async function getTeacherMaterials(
  accountId: number,
): Promise<TeacherMaterialItem[]> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return [];

  const rows = await db
    .select({
      id: lmsMaterials.id,
      classSubjectId: lmsMaterials.classSubjectId,
      title: lmsMaterials.title,
      linkUrl: lmsMaterials.externalUrl,
      createdAt: lmsMaterials.createdAt,
      className: lmsClasses.name,
      subjectName: lmsSubjects.name,
    })
    .from(lmsMaterials)
    .innerJoin(
      lmsClassSubjects,
      eq(lmsMaterials.classSubjectId, lmsClassSubjects.id),
    )
    .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
    .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
    .where(eq(lmsClassSubjects.teacherId, teacher.id))
    .orderBy(desc(lmsMaterials.createdAt))
    .limit(80);

  if (rows.length === 0) return [];

  const fileRows = await db
    .select({
      materialId: lmsMaterialFiles.materialId,
      key: lmsMaterialFiles.objectKey,
      fileName: lmsMaterialFiles.fileName,
      mimeType: lmsMaterialFiles.mimeType,
      sizeBytes: lmsMaterialFiles.sizeBytes,
    })
    .from(lmsMaterialFiles)
    /* v2.8.85.0 — files trashed from My Storage leave the list too. */
    .where(
      and(
        inArray(
          lmsMaterialFiles.materialId,
          rows.map((r) => r.id),
        ),
        isNull(lmsMaterialFiles.deletedAt),
      ),
    )
    .orderBy(lmsMaterialFiles.id);
  const filesByMaterial = new Map<number, MaterialFileRef[]>();
  for (const f of fileRows) {
    const list = filesByMaterial.get(f.materialId) ?? [];
    list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
    filesByMaterial.set(f.materialId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    classSubjectId: r.classSubjectId,
    className: r.className,
    subjectName: r.subjectName,
    title: r.title,
    linkUrl: r.linkUrl,
    fileCount: filesByMaterial.get(r.id)?.length ?? 0,
    postedLabel: shortDate(r.createdAt),
    files: filesByMaterial.get(r.id) ?? [],
  }));
}

export async function createMaterial(
  accountId: number,
  input: {
    classSubjectId?: unknown;
    title?: unknown;
    linkUrl?: unknown;
    files?: unknown;
  },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "teacher_profile_missing" };

  const csId = Number(input.classSubjectId);
  if (!Number.isInteger(csId) || csId <= 0) {
    return { ok: false, error: "Pick a class and subject first." };
  }
  const cs = await ownedClassSubject(teacher.id, csId);
  if (!cs) return { ok: false, error: "That class is not yours." };

  const title = cleanText(input.title, MAX_TITLE);
  if (title.length < 3) {
    return { ok: false, error: "Give the material a title (3+ letters)." };
  }

  const link = sanitizeLinkUrl(input.linkUrl);
  if (!link.ok) {
    return { ok: false, error: "That link does not look right — use a http(s) or mailto link." };
  }

  const files = sanitizeFileRefs(input.files);
  if (files == null) return { ok: false, error: "The attachment list is malformed." };
  if (files.length === 0 && !link.value) {
    return {
      ok: false,
      error: "Attach at least one file or a link — students need something to open.",
    };
  }

  const [saved] = await db
    .insert(lmsMaterials)
    .values({
      classSubjectId: csId,
      title,
      externalUrl: link.value,
      createdByAccountId: accountId,
    })
    .returning({ id: lmsMaterials.id });
  if (!saved) return { ok: false, error: "Could not save the material." };

  if (files.length > 0) {
    await db.insert(lmsMaterialFiles).values(
      files.map((f) => ({
        materialId: saved.id,
        classSubjectId: csId,
        objectKey: f.key,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
      })),
    );
  }

  return { ok: true, id: saved.id };
}

/* ── v2.8.49.0 — Phase 1.2: editing a shared material ───────────────── */

export type TeacherMaterialDetail = {
  id: number;
  classSubjectId: number;
  title: string;
  linkUrl: string;
  files: AssignmentFileRef[];
};

/** The edit-dialog payload for ONE material — the posting teacher only. */
export async function getTeacherMaterialDetail(
  accountId: number,
  materialId: number,
): Promise<TeacherMaterialDetail | null> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return null;

  const [material] = await db
    .select({
      id: lmsMaterials.id,
      classSubjectId: lmsMaterials.classSubjectId,
      title: lmsMaterials.title,
      externalUrl: lmsMaterials.externalUrl,
    })
    .from(lmsMaterials)
    .where(eq(lmsMaterials.id, materialId))
    .limit(1);
  if (!material) return null;

  const cs = await ownedClassSubject(teacher.id, material.classSubjectId);
  if (!cs) return null;

  const files = await db
    .select({
      key: lmsMaterialFiles.objectKey,
      fileName: lmsMaterialFiles.fileName,
      mimeType: lmsMaterialFiles.mimeType,
      sizeBytes: lmsMaterialFiles.sizeBytes,
    })
    .from(lmsMaterialFiles)
    /* v2.8.85.0 — the material detail honours the trash as well. */
    .where(
      and(
        eq(lmsMaterialFiles.materialId, materialId),
        isNull(lmsMaterialFiles.deletedAt),
      ),
    )
    .orderBy(lmsMaterialFiles.id);

  return {
    id: material.id,
    classSubjectId: material.classSubjectId,
    title: material.title,
    linkUrl: material.externalUrl ?? "",
    files: files.map((f) => ({
      key: f.key,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    })),
  };
}

/**
 * v2.8.49.0 — Phase 1.2: the teacher EDITS a shared material.
 * Materials have no submission lifecycle, so everything stays freely
 * editable — including moving the class×subject (the file rows follow).
 * undefined always means "keep what is there"; attachments reconcile in
 * place exactly like assignment edits (kept keys reuse stored rows,
 * removed keys lose their rows AND bytes, new keys must be fresh uploads).
 */
export async function updateMaterial(
  accountId: number,
  materialId: number,
  input: {
    classSubjectId?: unknown;
    title?: unknown;
    linkUrl?: unknown;
    files?: unknown;
  },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "teacher_profile_missing" };

  if (!Number.isInteger(materialId) || materialId <= 0) {
    return { ok: false, error: "Bad request." };
  }
  const [material] = await db
    .select({
      id: lmsMaterials.id,
      classSubjectId: lmsMaterials.classSubjectId,
      title: lmsMaterials.title,
      externalUrl: lmsMaterials.externalUrl,
    })
    .from(lmsMaterials)
    .where(eq(lmsMaterials.id, materialId))
    .limit(1);
  if (!material) return { ok: false, error: "not_found" };
  const cs = await ownedClassSubject(teacher.id, material.classSubjectId);
  if (!cs) return { ok: false, error: "not_found" };

  /* class move — always allowed for materials */
  let classSubjectId = material.classSubjectId;
  if (input.classSubjectId !== undefined) {
    const next = Number(input.classSubjectId);
    if (!Number.isInteger(next) || next <= 0) {
      return { ok: false, error: "Pick a class and subject first." };
    }
    if (next !== material.classSubjectId) {
      const target = await ownedClassSubject(teacher.id, next);
      if (!target) return { ok: false, error: "That class is not yours." };
      classSubjectId = next;
    }
  }

  let title = material.title;
  if (input.title !== undefined) {
    title = cleanText(input.title, MAX_TITLE);
    if (title.length < 3) {
      return { ok: false, error: "Give the material a title (3+ letters)." };
    }
  }

  let externalUrl = material.externalUrl;
  if (input.linkUrl !== undefined) {
    const link = sanitizeLinkUrl(input.linkUrl);
    if (!link.ok) {
      return {
        ok: false,
        error: "That link does not look right — use a http(s) or mailto link.",
      };
    }
    externalUrl = link.value;
  }

  /* a material must keep at least one file or a link */
  if (input.files !== undefined) {
    const incoming = sanitizeFileRefs(input.files);
    if (incoming == null) {
      return { ok: false, error: "The attachment list is malformed." };
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
      return { ok: false, error: `Up to ${MAX_FILES_PER_GROUP} files per material.` };
    }
    if (wanted.length === 0 && !externalUrl) {
      return {
        ok: false,
        error: "Attach at least one file or a link — students need something to open.",
      };
    }

    const existingRows = await db
      .select({ id: lmsMaterialFiles.id, key: lmsMaterialFiles.objectKey })
      .from(lmsMaterialFiles)
      .where(eq(lmsMaterialFiles.materialId, materialId));
    const existingByKey = new Map(existingRows.map((r) => [r.key, r]));

    const fresh = wanted.filter((f) => !existingByKey.has(f.key));
    if (fresh.length > 0) {
      const freshKeys = fresh.map((f) => f.key);
      const [elsewhere, submissions, otherMaterials] = await Promise.all([
        db
          .select({ key: lmsAssignmentFiles.objectKey })
          .from(lmsAssignmentFiles)
          .where(inArray(lmsAssignmentFiles.objectKey, freshKeys))
          .limit(1),
        db
          .select({ key: lmsSubmissionFiles.objectKey })
          .from(lmsSubmissionFiles)
          .where(inArray(lmsSubmissionFiles.objectKey, freshKeys))
          .limit(1),
        db
          .select({ key: lmsMaterialFiles.objectKey })
          .from(lmsMaterialFiles)
          .where(inArray(lmsMaterialFiles.objectKey, freshKeys))
          .limit(1),
      ]);
      if (submissions.length > 0) {
        return {
          ok: false,
          error: "One of the files is already attached to a student's submission.",
        };
      }
      if (elsewhere.length > 0 || otherMaterials.length > 0) {
        return { ok: false, error: "One of the files is already attached to another post." };
      }
    }

    const removeRows = existingRows.filter((r) => !seen.has(r.key));
    if (removeRows.length > 0) {
      await db
        .delete(lmsMaterialFiles)
        .where(
          inArray(
            lmsMaterialFiles.id,
            removeRows.map((r) => r.id),
          ),
        );
      const storage = getStorage();
      await Promise.allSettled(
        removeRows.map((r) => storage.deleteObject(r.key).catch(() => undefined)),
      );
    }
    if (fresh.length > 0) {
      await db.insert(lmsMaterialFiles).values(
        fresh.map((f) => ({
          materialId,
          classSubjectId,
          objectKey: f.key,
          fileName: f.fileName,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
      );
    }
  }

  await db
    .update(lmsMaterials)
    .set({ classSubjectId, title, externalUrl })
    .where(eq(lmsMaterials.id, materialId));

  /* moving the class drags the anchored file rows with it */
  if (classSubjectId !== material.classSubjectId) {
    await db
      .update(lmsMaterialFiles)
      .set({ classSubjectId })
      .where(eq(lmsMaterialFiles.materialId, materialId));
  }

  return { ok: true, id: materialId };
}

export async function deleteMaterial(
  accountId: number,
  materialId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "teacher_profile_missing" };

  const [material] = await db
    .select({ id: lmsMaterials.id, classSubjectId: lmsMaterials.classSubjectId })
    .from(lmsMaterials)
    .where(eq(lmsMaterials.id, materialId))
    .limit(1);
  if (!material) return { ok: false, error: "not_found" };

  const cs = await ownedClassSubject(teacher.id, material.classSubjectId);
  if (!cs) return { ok: false, error: "not_found" };

  const fileRows = await db
    .select({ key: lmsMaterialFiles.objectKey })
    .from(lmsMaterialFiles)
    .where(eq(lmsMaterialFiles.materialId, materialId));
  await db.delete(lmsMaterialFiles).where(eq(lmsMaterialFiles.materialId, materialId));
  await db.delete(lmsMaterials).where(eq(lmsMaterials.id, materialId));

  if (fileRows.length > 0) {
    const storage = getStorage();
    await Promise.allSettled(
      fileRows.map((f) => storage.deleteObject(f.key).catch(() => undefined)),
    );
  }
  return { ok: true };
}

/* ── Notices ─────────────────────────────────────────────────────────── */

export type TeacherNoticeItem = {
  id: number;
  classId: number;
  className: string;
  title: string;
  body: string;
  /* v2.8.59.0 — the owner: "notice daddi links, images, pdf danna option
     ekath danna wei ne." Notices now carry one reference link + N files
     (images, PDFs, docs) uploaded through the SAME storage pipeline the
     assignments use. Each file rides its lms_notice_files.id so the board
     can open them through the audience-checked route. */
  linkUrl: string | null;
  files: (AssignmentFileRef & { id: number })[];
  mine: boolean;
  postedLabel: string;
};

/** N files for a batch of notices, one query, grouped client-side. */
async function filesForNotices(
  noticeIds: number[],
): Promise<Map<number, (AssignmentFileRef & { id: number })[]>> {
  const map = new Map<number, (AssignmentFileRef & { id: number })[]>();
  if (noticeIds.length === 0) return map;
  const rows = await db
    .select({
      noticeId: lmsNoticeFiles.noticeId,
      id: lmsNoticeFiles.id,
      objectKey: lmsNoticeFiles.objectKey,
      fileName: lmsNoticeFiles.fileName,
      mimeType: lmsNoticeFiles.mimeType,
      sizeBytes: lmsNoticeFiles.sizeBytes,
    })
    .from(lmsNoticeFiles)
    /* v2.8.85.0 — trashed notice files leave the listing. */
    .where(
      and(
        inArray(lmsNoticeFiles.noticeId, noticeIds),
        isNull(lmsNoticeFiles.deletedAt),
      ),
    );
  for (const row of rows) {
    const list = map.get(row.noticeId) ?? [];
    list.push({
      id: row.id,
      key: row.objectKey,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    });
    map.set(row.noticeId, list);
  }
  return map;
}

/** lms-notice/ file ids are the audience route's addresses. */
export type NoticeFileRow = { id: number; fileName: string };

export async function getNoticeFiles(
  noticeId: number,
): Promise<NoticeFileRow[]> {
  const rows = await db
    .select({
      id: lmsNoticeFiles.id,
      fileName: lmsNoticeFiles.fileName,
      objectKey: lmsNoticeFiles.objectKey,
      mimeType: lmsNoticeFiles.mimeType,
    })
    .from(lmsNoticeFiles)
    /* v2.8.85.0 — the audience file list honours the trash as well. */
    .where(
      and(
        eq(lmsNoticeFiles.noticeId, noticeId),
        isNull(lmsNoticeFiles.deletedAt),
      ),
    );
  return rows.map((r) => ({ id: r.id, fileName: r.fileName }));
}

/** One notice's file row — used by the audience-checked file route. */
export async function getNoticeFileRow(noticeFileId: number) {
  const [row] = await db
    .select({
      id: lmsNoticeFiles.id,
      noticeId: lmsNoticeFiles.noticeId,
      objectKey: lmsNoticeFiles.objectKey,
      fileName: lmsNoticeFiles.fileName,
      mimeType: lmsNoticeFiles.mimeType,
      classId: lmsNotices.classId,
      createdBy: lmsNotices.createdByAccountId,
    })
    .from(lmsNoticeFiles)
    .innerJoin(lmsNotices, eq(lmsNoticeFiles.noticeId, lmsNotices.id))
    .where(eq(lmsNoticeFiles.id, noticeFileId))
    .limit(1);
  return row ?? null;
}

export async function getTeacherNotices(
  accountId: number,
): Promise<TeacherNoticeItem[]> {
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return [];

  const classOptions = await getTeacherNoticeClassOptions(accountId);
  if (classOptions.length === 0) return [];

  const rows = await db
    .select({
      id: lmsNotices.id,
      classId: lmsNotices.classId,
      title: lmsNotices.title,
      body: lmsNotices.body,
      linkUrl: lmsNotices.linkUrl,
      createdBy: lmsNotices.createdByAccountId,
      createdAt: lmsNotices.createdAt,
      className: lmsClasses.name,
    })
    .from(lmsNotices)
    .innerJoin(lmsClasses, eq(lmsNotices.classId, lmsClasses.id))
    .where(
      inArray(
        lmsNotices.classId,
        classOptions.map((c) => c.classId),
      ),
    )
    .orderBy(desc(lmsNotices.createdAt))
    .limit(60);

  const fileMap = await filesForNotices(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    classId: r.classId,
    className: r.className,
    title: r.title,
    body: r.body,
    linkUrl: r.linkUrl ?? null,
    files: fileMap.get(r.id) ?? [],
    mine: r.createdBy === accountId,
    postedLabel: shortDate(r.createdAt),
  }));
}

/** Pin the composer's uploaded file refs as lms_notice_files rows. */
async function pinNoticeFiles(noticeId: number, files: AssignmentFileRef[]) {
  if (files.length === 0) return;
  await db.insert(lmsNoticeFiles).values(
    files.map((f) => ({
      noticeId,
      objectKey: f.key,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
    })),
  );
}

export async function createNotice(
  accountId: number,
  input: {
    classId?: unknown;
    title?: unknown;
    body?: unknown;
    linkUrl?: unknown;
    files?: unknown;
  },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const classId = Number(input.classId);
  if (!Number.isInteger(classId) || classId <= 0) {
    return { ok: false, error: "Pick a class first." };
  }

  const options = await getTeacherNoticeClassOptions(accountId);
  if (!options.some((o) => o.classId === classId)) {
    return { ok: false, error: "That class is not yours." };
  }

  const title = cleanText(input.title, MAX_TITLE);
  if (title.length < 3) {
    return { ok: false, error: "Give the notice a title (3+ letters)." };
  }
  const body = cleanText(input.body, MAX_BODY);
  if (body.length < 1) {
    return { ok: false, error: "Write the notice text." };
  }

  /* v2.8.59.0 — validate BOTH extras BEFORE any write: a bad link or a
     bad file list rejects the whole notice (all-or-nothing, like the
     batched group members). */
  const link = sanitizeLinkUrl(input.linkUrl);
  if (!link.ok) {
    return { ok: false, error: "That link doesn't look right (http(s) or mailto)." };
  }
  const files = sanitizeFileRefs(input.files);
  if (files == null) {
    return { ok: false, error: "The attached files look broken — remove and re-attach them." };
  }

  const [saved] = await db
    .insert(lmsNotices)
    .values({
      classId,
      title,
      body,
      linkUrl: link.value,
      createdByAccountId: accountId,
    })
    .returning({ id: lmsNotices.id });

  if (!saved) return { ok: false, error: "Could not save the notice." };
  await pinNoticeFiles(saved.id, files);
  return { ok: true, id: saved.id };
}

export async function deleteNotice(
  accountId: number,
  noticeId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [notice] = await db
    .select({
      id: lmsNotices.id,
      classId: lmsNotices.classId,
      createdBy: lmsNotices.createdByAccountId,
    })
    .from(lmsNotices)
    .where(eq(lmsNotices.id, noticeId))
    .limit(1);
  if (!notice) return { ok: false, error: "not_found" };

  /* the poster may remove it; a class teacher may remove any notice on
     their own class board (office-seeded rows included) */
  let allowed = notice.createdBy === accountId;
  if (!allowed) {
    const teacher = await teacherFromAccount(accountId);
    if (teacher) {
      const [led] = await db
        .select({ id: lmsClasses.id })
        .from(lmsClasses)
        .where(
          and(
            eq(lmsClasses.id, notice.classId),
            // v2.8.83.0 — class teacher OR assistant
            ledByFilter(teacher.id),
          ),
        )
        .limit(1);
      allowed = Boolean(led);
    }
  }
  if (!allowed) return { ok: false, error: "not_found" };

  const fileRows = await db
    .select({ key: lmsNoticeFiles.objectKey })
    .from(lmsNoticeFiles)
    .where(eq(lmsNoticeFiles.noticeId, noticeId));
  await db.delete(lmsNoticeFiles).where(eq(lmsNoticeFiles.noticeId, noticeId));
  await db.delete(lmsNotices).where(eq(lmsNotices.id, noticeId));

  if (fileRows.length > 0) {
    const storage = getStorage();
    await Promise.allSettled(
      fileRows.map((f) => storage.deleteObject(f.key).catch(() => undefined)),
    );
  }
  return { ok: true };
}

/**
 * v2.8.49.0 — Phase 1.2: edit a class notice.
 * Only the teacher who POSTED the notice may edit it (a class teacher who
 * didn't write it can still remove it — that stays deleteNotice's job).
 * undefined means "keep what is there"; the board can be moved to any
 * class the teacher teaches or leads. v2.8.59.0 — linkUrl/files follow the
 * same rule; a REPLACED file list deletes the dropped blobs.
 */
export async function updateNotice(
  accountId: number,
  noticeId: number,
  input: {
    classId?: unknown;
    title?: unknown;
    body?: unknown;
    linkUrl?: unknown;
    files?: unknown;
  },
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    return { ok: false, error: "Bad request." };
  }
  const [notice] = await db
    .select({
      id: lmsNotices.id,
      classId: lmsNotices.classId,
      title: lmsNotices.title,
      body: lmsNotices.body,
      createdBy: lmsNotices.createdByAccountId,
    })
    .from(lmsNotices)
    .where(eq(lmsNotices.id, noticeId))
    .limit(1);
  if (!notice || notice.createdBy !== accountId) {
    return { ok: false, error: "Only the teacher who posted this notice can edit it." };
  }

  let classId = notice.classId;
  if (input.classId !== undefined) {
    const next = Number(input.classId);
    if (!Number.isInteger(next) || next <= 0) {
      return { ok: false, error: "Pick a class first." };
    }
    if (next !== notice.classId) {
      const options = await getTeacherNoticeClassOptions(accountId);
      if (!options.some((o) => o.classId === next)) {
        return { ok: false, error: "That class is not yours." };
      }
      classId = next;
    }
  }

  let title = notice.title;
  if (input.title !== undefined) {
    title = cleanText(input.title, MAX_TITLE);
    if (title.length < 3) {
      return { ok: false, error: "Give the notice a title (3+ letters)." };
    }
  }

  let body = notice.body;
  if (input.body !== undefined) {
    body = cleanText(input.body, MAX_BODY);
    if (body.length < 1) {
      return { ok: false, error: "Write the notice text." };
    }
  }

  let linkUrl: string | null | undefined;
  if (input.linkUrl !== undefined) {
    const link = sanitizeLinkUrl(input.linkUrl);
    if (!link.ok) {
      return { ok: false, error: "That link doesn't look right (http(s) or mailto)." };
    }
    linkUrl = link.value;
  }

  let nextFiles: AssignmentFileRef[] | null = null;
  if (input.files !== undefined) {
    const files = sanitizeFileRefs(input.files);
    if (files == null) {
      return { ok: false, error: "The attached files look broken — remove and re-attach them." };
    }
    nextFiles = files;
  }

  await db
    .update(lmsNotices)
    .set({
      classId,
      title,
      body,
      ...(linkUrl !== undefined ? { linkUrl } : {}),
    })
    .where(eq(lmsNotices.id, noticeId));

  if (nextFiles != null) {
    const existing = await db
      .select({ key: lmsNoticeFiles.objectKey })
      .from(lmsNoticeFiles)
      .where(eq(lmsNoticeFiles.noticeId, noticeId));
    await db.delete(lmsNoticeFiles).where(eq(lmsNoticeFiles.noticeId, noticeId));
    await pinNoticeFiles(noticeId, nextFiles);
    const keep = new Set(nextFiles.map((f) => f.key));
    const dropped = existing.filter((f) => !keep.has(f.key));
    if (dropped.length > 0) {
      const storage = getStorage();
      await Promise.allSettled(
        dropped.map((f) => storage.deleteObject(f.key).catch(() => undefined)),
      );
    }
  }

  return { ok: true, id: noticeId };
}
