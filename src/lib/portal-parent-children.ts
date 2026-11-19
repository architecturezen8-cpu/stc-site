import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsAssignmentFiles,
  lmsAssignmentGroupMembers,
  lmsAssignmentGroups,
  lmsAssignments,
  lmsAssessments,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsMarks,
  lmsParentChildren,
  lmsParents,
  lmsStudents,
  lmsSubjects,
  lmsSubmissionFiles,
  lmsSubmissions,
} from "@/db/schema-lms";
import { dueLabelFor, type AssignmentFileRef } from "@/lib/portal-assignments";

/**
 * PHASE 3.2 — Parent portal depth (v2.8.46.0): homework visibility +
 * marks detail for the children linked to a parent account.
 *
 * Linkage chain: lms_portal_accounts → lms_parents (account_id) →
 * lms_parent_children → lms_students → active lms_enrollments → class.
 *
 * Every reader here re-verifies the parent→child link at the SERVER
 * boundary — a parent can only ever read homework and marks of students
 * that appear in THEIR OWN lms_parent_children rows. Everything is
 * strictly read-only: parents never submit, grade or mutate anything.
 * Any failure degrades to an empty/null result — never an exception
 * stack in a page.
 */

export type ParentChildRef = {
  studentId: number;
  fullName: string;
  admissionNo: string;
  className: string | null;
};

/* ── Linked children ─────────────────────────────────────────────────── */

async function activeClassNames(studentIds: number[]): Promise<Map<number, string>> {
  if (studentIds.length === 0) return new Map();
  const rows = await db
    .select({ studentId: lmsEnrollments.studentId, name: lmsClasses.name })
    .from(lmsEnrollments)
    .innerJoin(lmsClasses, eq(lmsEnrollments.classId, lmsClasses.id))
    .where(
      and(
        inArray(lmsEnrollments.studentId, studentIds),
        eq(lmsEnrollments.status, "active"),
      ),
    );
  const map = new Map<number, string>();
  for (const r of rows) if (!map.has(r.studentId)) map.set(r.studentId, r.name);
  return map;
}

/** Every child linked to THIS parent account, with their active class. */
export async function getLinkedChildren(accountId: number): Promise<ParentChildRef[]> {
  try {
    const rows = await db
      .select({
        studentId: lmsStudents.id,
        fullName: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
      })
      .from(lmsParents)
      .innerJoin(lmsParentChildren, eq(lmsParentChildren.parentId, lmsParents.id))
      .innerJoin(lmsStudents, eq(lmsParentChildren.studentId, lmsStudents.id))
      .where(eq(lmsParents.accountId, accountId))
      .orderBy(lmsStudents.fullName);
    const classNames = await activeClassNames(rows.map((r) => r.studentId));
    return rows.map((r) => ({
      ...r,
      className: classNames.get(r.studentId) ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * THE ownership guard: returns the child only when that student really is
 * linked to this parent account. Every child-scoped reader calls this.
 */
export async function getLinkedChild(
  accountId: number,
  childStudentId: number,
): Promise<ParentChildRef | null> {
  if (!Number.isInteger(childStudentId) || childStudentId <= 0) return null;
  const children = await getLinkedChildren(accountId);
  return children.find((c) => c.studentId === childStudentId) ?? null;
}

/* ── Homework (read-only mirror of the student view) ─────────────────── */

export type ParentHomeworkItem = {
  id: number;
  title: string;
  instructions: string;
  subject: string;
  className: string;
  dueLabel: string;
  duePassed: boolean;
  status: "pending" | "submitted" | "graded";
  isLate: boolean;
  childText: string;
  submittedLabel: string;
  score: number | null;
  /* v2.8.56.0 — Phase 3.2: the scale the score is out of (grade letters
     A/B/C/S/W derive from score ÷ maxScore on the parent mirror too). */
  maxScore: number;
  feedback: string;
  teacherFiles: AssignmentFileRef[];
  linkUrl: string;
  childFiles: AssignmentFileRef[];
  childLinkUrl: string;
  /* v2.8.57.0 — Phase 4.1: group work fields. */
  isGroup: boolean;
  groupName: string | null;
  groupMembers: { studentId: number; fullName: string; admissionNo: string }[];
  myAdjustment: number | null;
  /** the child's final mark: group score + own adjustment, clamped */
  finalScore: number | null;
};

function colomboDay(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
  }).format(date);
}

function colomboClock(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

async function childHomeworkRows(
  studentId: number,
  assignmentId?: number,
): Promise<
  {
    id: number;
    title: string;
    instructions: string | null;
    dueAt: Date | null;
    linkUrl: string | null;
    subjectName: string;
    className: string;
    contentText: string | null;
    childLinkUrl: string | null;
    submittedAt: Date | null;
    isLate: boolean | null;
    score: number | null;
    maxScore: number;
    feedback: string | null;
    /* v2.8.57.0 — Phase 4.1 group fields (merged below when the child's
       team owns the answer). */
    groupSubmissionId: number | null;
    isGroup: boolean;
    groupName: string | null;
    myAdjustment: number | null;
    finalScore: number | null;
    groupMembers: { studentId: number; fullName: string; admissionNo: string }[];
  }[]
> {
  const enrollments = await db
    .select({ classId: lmsEnrollments.classId })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.studentId, studentId),
        eq(lmsEnrollments.status, "active"),
      ),
    );
  if (enrollments.length === 0) return [];
  const classIds = enrollments.map((e) => e.classId);

  const conds = [
    inArray(lmsClassSubjects.classId, classIds),
    eq(lmsAssignments.isActive, true),
  ];
  if (assignmentId != null) conds.push(eq(lmsAssignments.id, assignmentId));

  const rows = await db
    .select({
      id: lmsAssignments.id,
      title: lmsAssignments.title,
      instructions: lmsAssignments.instructions,
      dueAt: lmsAssignments.dueAt,
      linkUrl: lmsAssignments.linkUrl,
      subjectName: lmsSubjects.name,
      className: lmsClasses.name,
      contentText: lmsSubmissions.contentText,
      childLinkUrl: lmsSubmissions.linkUrl,
      submittedAt: lmsSubmissions.submittedAt,
      isLate: lmsSubmissions.isLate,
      score: lmsSubmissions.score,
      maxScore: lmsAssignments.maxScore,
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
        eq(lmsSubmissions.studentId, studentId),
      ),
    )
    .where(and(...conds))
    .orderBy(desc(lmsAssignments.createdAt))
    .limit(assignmentId != null ? 1 : 50);

  /* v2.8.57.0 — Phase 4.1: when the child's TEAM owns the answer, the
     group's ONE submission replaces the individual fields on that row. */
  if (rows.length === 0) return [];
  const merged: {
    id: number;
    title: string;
    instructions: string | null;
    dueAt: Date | null;
    linkUrl: string | null;
    subjectName: string;
    className: string;
    contentText: string | null;
    childLinkUrl: string | null;
    submittedAt: Date | null;
    isLate: boolean | null;
    score: number | null;
    maxScore: number;
    feedback: string | null;
    groupSubmissionId: number | null;
    isGroup: boolean;
    groupName: string | null;
    myAdjustment: number | null;
    finalScore: number | null;
    groupMembers: { studentId: number; fullName: string; admissionNo: string }[];
  }[] = rows.map((r) => ({
    ...r,
    groupSubmissionId: null,
    isGroup: false,
    groupName: null,
    myAdjustment: null,
    finalScore: null,
    groupMembers: [],
  }));
  const ids = rows.map((r) => r.id);
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
        eq(lmsAssignmentGroupMembers.studentId, studentId),
        inArray(lmsAssignmentGroupMembers.assignmentId, ids),
      ),
    );
  if (myMemberRows.length > 0) {
    const groupIds = [...new Set(myMemberRows.map((m) => m.groupId))];
    const groupSubs = await db
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
      .where(inArray(lmsSubmissions.groupId, groupIds));
    const subByGroup = new Map(groupSubs.map((s) => [s.groupId ?? -1, s]));

    const teamNameRows = await db
      .select({
        groupId: lmsAssignmentGroupMembers.groupId,
        studentId: lmsStudents.id,
        admissionNo: lmsStudents.admissionNo,
        fullName: lmsStudents.fullName,
      })
      .from(lmsAssignmentGroupMembers)
      .innerJoin(lmsStudents, eq(lmsAssignmentGroupMembers.studentId, lmsStudents.id))
      .where(inArray(lmsAssignmentGroupMembers.groupId, groupIds))
      .orderBy(lmsStudents.fullName);
    const teamByGroup = new Map<
      number,
      { studentId: number; fullName: string; admissionNo: string }[]
    >();
    for (const t of teamNameRows) {
      const list = teamByGroup.get(t.groupId) ?? [];
      list.push({ studentId: t.studentId, fullName: t.fullName, admissionNo: t.admissionNo });
      teamByGroup.set(t.groupId, list);
    }

    const memberByAssignment = new Map(
      myMemberRows.map((m) => [m.assignmentId, m]),
    );
    for (const row of merged) {
      const m = memberByAssignment.get(row.id);
      if (!m) continue;
      const sub = subByGroup.get(m.groupId) ?? null;
      row.isGroup = true;
      row.groupName = m.groupName;
      row.myAdjustment = m.adjustment;
      row.groupMembers = teamByGroup.get(m.groupId) ?? [];
      row.finalScore =
        sub?.score != null
          ? Math.max(0, Math.min(row.maxScore, sub.score + (m.adjustment ?? 0)))
          : null;
      row.groupSubmissionId = sub?.id ?? null;
      row.contentText = sub?.contentText ?? null;
      row.childLinkUrl = sub?.linkUrl ?? null;
      row.submittedAt = sub?.submittedAt ?? null;
      row.isLate = sub?.isLate ?? false;
      row.score = sub?.score ?? null;
      row.feedback = sub?.feedback ?? null;
    }
  }
  return merged;
}

async function filesFor(
  assignmentIds: number[],
  studentId: number,
  groupSubmissionIds: number[] = [],
): Promise<{
  teacherFilesById: Map<number, AssignmentFileRef[]>;
  childFilesById: Map<number, AssignmentFileRef[]>;
}> {
  const teacherFilesById = new Map<number, AssignmentFileRef[]>();
  const childFilesById = new Map<number, AssignmentFileRef[]>();
  if (assignmentIds.length === 0) {
    return { teacherFilesById, childFilesById };
  }

  const teacherRows = await db
    .select({
      assignmentId: lmsAssignmentFiles.assignmentId,
      key: lmsAssignmentFiles.objectKey,
      fileName: lmsAssignmentFiles.fileName,
      mimeType: lmsAssignmentFiles.mimeType,
      sizeBytes: lmsAssignmentFiles.sizeBytes,
    })
    .from(lmsAssignmentFiles)
    /* v2.8.85.0 — trashed files leave the parent mirror too. */
    .where(
      and(
        inArray(lmsAssignmentFiles.assignmentId, assignmentIds),
        isNull(lmsAssignmentFiles.deletedAt),
      ),
    )
    .orderBy(lmsAssignmentFiles.id);
  for (const f of teacherRows) {
    const list = teacherFilesById.get(f.assignmentId) ?? [];
    list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
    teacherFilesById.set(f.assignmentId, list);
  }

  const childRows = await db
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
        inArray(lmsSubmissionFiles.assignmentId, assignmentIds),
        eq(lmsSubmissionFiles.studentId, studentId),
        isNull(lmsSubmissionFiles.deletedAt),
      ),
    )
    .orderBy(lmsSubmissionFiles.id);
  for (const f of childRows) {
    const list = childFilesById.get(f.assignmentId) ?? [];
    list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
    childFilesById.set(f.assignmentId, list);
  }

  /* v2.8.57.0 — Phase 4.1: the TEAM's files — whoever uploaded them, the
     whole group's submission set shows on the parent's mirror. */
  if (groupSubmissionIds.length > 0) {
    const teamRows = await db
      .select({
        assignmentId: lmsSubmissionFiles.assignmentId,
        key: lmsSubmissionFiles.objectKey,
        fileName: lmsSubmissionFiles.fileName,
        mimeType: lmsSubmissionFiles.mimeType,
        sizeBytes: lmsSubmissionFiles.sizeBytes,
      })
      .from(lmsSubmissionFiles)
      /* v2.8.85.0 — trashed team files stay hidden as well. */
      .where(
        and(
          inArray(lmsSubmissionFiles.submissionId, groupSubmissionIds),
          isNull(lmsSubmissionFiles.deletedAt),
        ),
      )
      .orderBy(lmsSubmissionFiles.id);
    for (const f of teamRows) {
      const list = childFilesById.get(f.assignmentId) ?? [];
      if (list.some((x) => x.key === f.key)) continue;
      list.push({ key: f.key, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
      childFilesById.set(f.assignmentId, list);
    }
  }

  return { teacherFilesById, childFilesById };
}

function mapHomeworkRows(
  rows: Awaited<ReturnType<typeof childHomeworkRows>>,
  files: Awaited<ReturnType<typeof filesFor>>,
): ParentHomeworkItem[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    instructions: r.instructions ?? "",
    subject: r.subjectName,
    className: r.className,
    dueLabel: dueLabelFor(r.dueAt),
    /* computed on the server — client islands must not call Date.now()
       during render (the React compiler lint). */
    duePassed: r.dueAt != null ? r.dueAt.getTime() < Date.now() : false,
    status:
      r.submittedAt == null
        ? ("pending" as const)
        : r.score != null
          ? ("graded" as const)
          : ("submitted" as const),
    isLate: Boolean(r.isLate),
    childText: r.contentText ?? "",
    submittedLabel:
      r.submittedAt != null
        ? `${colomboDay(r.submittedAt)} · ${colomboClock(r.submittedAt)}`
        : "",
    score: r.score,
    maxScore: r.maxScore,
    feedback: r.feedback ?? "",
    teacherFiles: files.teacherFilesById.get(r.id) ?? [],
    linkUrl: r.linkUrl ?? "",
    childFiles: files.childFilesById.get(r.id) ?? [],
    childLinkUrl: r.childLinkUrl ?? "",
    /* v2.8.57.0 — Phase 4.1 */
    isGroup: r.isGroup,
    groupName: r.groupName,
    groupMembers: r.groupMembers,
    myAdjustment: r.myAdjustment,
    finalScore: r.finalScore,
  }));
}

/**
 * The linked child's homework list with their FULL submission state —
 * the read-only parent mirror of getStudentHomework. Guarded: the child
 * must be linked to this parent account.
 */
export async function getParentChildHomework(
  accountId: number,
  childStudentId: number,
): Promise<ParentHomeworkItem[]> {
  try {
    const child = await getLinkedChild(accountId, childStudentId);
    if (!child) return [];
    const rows = await childHomeworkRows(child.studentId);
    if (rows.length === 0) return [];
    const files = await filesFor(
      rows.map((r) => r.id),
      child.studentId,
      rows.map((r) => r.groupSubmissionId).filter((x): x is number => x != null),
    );
    return mapHomeworkRows(rows, files);
  } catch {
    return [];
  }
}

/** ONE assignment for the read-only parent detail page (guarded). */
export async function getParentChildHomeworkItem(
  accountId: number,
  childStudentId: number,
  assignmentId: number,
): Promise<ParentHomeworkItem | null> {
  try {
    const child = await getLinkedChild(accountId, childStudentId);
    if (!child) return null;
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) return null;
    const rows = await childHomeworkRows(child.studentId, assignmentId);
    if (rows.length === 0) return null;
    const files = await filesFor(
      [assignmentId],
      child.studentId,
      rows.map((r) => r.groupSubmissionId).filter((x): x is number => x != null),
    );
    return mapHomeworkRows(rows, files)[0] ?? null;
  } catch {
    return null;
  }
}

/* ── Marks detail ────────────────────────────────────────────────────── */

export type ParentMarkRow = {
  id: number;
  title: string;
  subject: string;
  term: string;
  score: number;
  max: number;
  pct: number;
  whenLabel: string;
};

export type ParentTermGroup = {
  term: string;
  avgPct: number | null;
  rows: ParentMarkRow[];
};

export type ParentSubjectAverage = {
  subject: string;
  avgPct: number;
  count: number;
};

export type ParentChildMarks = {
  child: ParentChildRef;
  overallPct: number | null;
  count: number;
  terms: ParentTermGroup[];
  subjects: ParentSubjectAverage[];
};

const TERM_ORDER = ["Term 1", "Term 2", "Term 3"];

/**
 * Full marks sheet for one linked child: every scored mark joined to its
 * assessment (title, term, max) and class×subject, grouped by term with
 * per-term + per-subject + overall averages. Guarded like the homework
 * readers. Unmarked rows (score IS NULL) are excluded — parents see
 * published scores only.
 */
export async function getParentChildMarks(
  accountId: number,
  childStudentId: number,
): Promise<ParentChildMarks | null> {
  try {
    const child = await getLinkedChild(accountId, childStudentId);
    if (!child) return null;

    const rows = await db
      .select({
        id: lmsMarks.id,
        score: lmsMarks.score,
        updatedAt: lmsMarks.updatedAt,
        title: lmsAssessments.title,
        term: lmsAssessments.term,
        max: lmsAssessments.maxScore,
        subject: lmsSubjects.name,
      })
      .from(lmsMarks)
      .innerJoin(lmsAssessments, eq(lmsMarks.assessmentId, lmsAssessments.id))
      .innerJoin(
        lmsClassSubjects,
        eq(lmsAssessments.classSubjectId, lmsClassSubjects.id),
      )
      .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
      .where(
        and(
          eq(lmsMarks.studentId, child.studentId),
          isNotNull(lmsMarks.score),
        ),
      )
      .orderBy(desc(lmsMarks.updatedAt))
      .limit(200);

    const markRows: ParentMarkRow[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      term: r.term,
      score: r.score ?? 0,
      max: r.max,
      pct: r.max > 0 ? Math.round(((r.score ?? 0) / r.max) * 100) : 0,
      whenLabel: colomboDay(r.updatedAt),
    }));

    const overallPct =
      markRows.length > 0
        ? Math.round(
            markRows.reduce((sum, m) => sum + m.pct, 0) / markRows.length,
          )
        : null;

    /* term groups in the canonical Term 1 → 3 order, then anything else */
    const byTerm = new Map<string, ParentMarkRow[]>();
    for (const row of markRows) {
      const list = byTerm.get(row.term) ?? [];
      list.push(row);
      byTerm.set(row.term, list);
    }
    const termKeys = [
      ...TERM_ORDER.filter((t) => byTerm.has(t)),
      ...[...byTerm.keys()].filter((t) => !TERM_ORDER.includes(t)),
    ];
    const terms: ParentTermGroup[] = termKeys.map((term) => {
      const list = byTerm.get(term) ?? [];
      return {
        term,
        avgPct:
          list.length > 0
            ? Math.round(list.reduce((s, m) => s + m.pct, 0) / list.length)
            : null,
        rows: list,
      };
    });

    /* subject averages over every scored mark */
    const subj = new Map<string, { sum: number; count: number }>();
    for (const row of markRows) {
      const cur = subj.get(row.subject) ?? { sum: 0, count: 0 };
      cur.sum += row.pct;
      cur.count += 1;
      subj.set(row.subject, cur);
    }
    const subjects: ParentSubjectAverage[] = [...subj.entries()]
      .map(([subject, v]) => ({
        subject,
        avgPct: Math.round(v.sum / v.count),
        count: v.count,
      }))
      .sort((a, b) => b.avgPct - a.avgPct);

    return {
      child,
      overallPct,
      count: markRows.length,
      terms,
      subjects,
    };
  } catch {
    return null;
  }
}
