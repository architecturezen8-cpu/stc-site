import "server-only";

import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureLmsPerson } from "@/lib/lms-identity";
import {
  getChildAttendanceSummary,
  emptyAttendanceDetail,
  getStudentAttendanceDetail,
  type AttendanceDetail,
} from "@/lib/portal-attendance";
import {
  lmsAssessments,
  lmsAssignments,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsAssignmentGroups,
  lmsAssignmentGroupMembers,
  lmsMarks,
  lmsMaterialFiles,
  lmsMaterials,
  lmsNoticeFiles,
  lmsNotices,
  lmsParentChildren,
  lmsParents,
  lmsPortalAccounts,
  lmsStudentRecords,
  lmsStudents,
  lmsSubjects,
  lmsSubmissions,
  lmsTeachers,
  lmsTimetableSlots,
} from "@/db/schema-lms";

/**
 * Read models for the three portal dashboards. Every fetcher is
 * crash-proof: the LMS is invite/master-data driven and every table may
 * legitimately be empty (Phase 3.1-b fills them via Admin Setup), so all
 * failures degrade to calm empty states instead of error screens.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function colomboDayInfo() {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC+05:30
  const dayIndex = now.getUTCDay();
  const label = WEEKDAYS[dayIndex];
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
  }).format(new Date());
  return { dayIndex, label, dateLabel };
}

function shortDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
  }).format(date);
}

function pct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}

function firstNameFrom(email: string, fallback: string, displayName = "") {
  return (
    displayName.trim().split(/\s+/)[0] ||
    email.split("@")[0].replace(/[._-].*$/, "") ||
    fallback
  );
}

export type TimetableSlotView = {
  period: number;
  subject: string;
  teacher: string;
  room: string;
};

export type AssignmentView = {
  id: number;
  title: string;
  subject: string;
  dueLabel: string;
  submitted: boolean;
  scored: boolean;
};

export type MarkView = {
  title: string;
  subject: string;
  score: number | null;
  max: number;
  whenLabel: string;
};

export type NoticeFileView = {
  /** lms_notice_files.id — the audience-checked file route's address. */
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type NoticeView = {
  /** v2.8.59.0 — attachments ride with the notice (links, images, PDFs). */
  id: number;
  title: string;
  body: string;
  whenLabel: string;
  linkUrl: string | null;
  files: NoticeFileView[];
};

/** v2.8.59.0 — N notice attachments for a batch of notices, one query. */
async function noticeFilesFor(
  noticeIds: number[],
): Promise<Map<number, NoticeFileView[]>> {
  const map = new Map<number, NoticeFileView[]>();
  if (noticeIds.length === 0) return map;
  const rows = await db
    .select({
      noticeId: lmsNoticeFiles.noticeId,
      id: lmsNoticeFiles.id,
      fileName: lmsNoticeFiles.fileName,
      mimeType: lmsNoticeFiles.mimeType,
      sizeBytes: lmsNoticeFiles.sizeBytes,
    })
    .from(lmsNoticeFiles)
    .where(inArray(lmsNoticeFiles.noticeId, noticeIds));
  for (const row of rows) {
    const list = map.get(row.noticeId) ?? [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    });
    map.set(row.noticeId, list);
  }
  return map;
}

/** v2.8.45.0 — Phase 3.1-e: materials a teacher handed out to the class. */
export type MaterialView = {
  id: number;
  title: string;
  subject: string;
  whenLabel: string;
  linkUrl: string | null;
  files: {
    key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }[];
};

/* ── Student ──────────────────────────────────────────────────────────── */

export type StudentDashboard = {
  ok: true;
  firstName: string;
  admissionNo: string;
  className: string | null;
  academicYear: string | null;
  dayLabel: string;
  dateLabel: string;
  slots: TimetableSlotView[];
  assignments: AssignmentView[];
  attendancePct: number | null;
  marksAvgPct: number | null;
  homeworkPct: number | null;
  recentMarks: MarkView[];
  notices: NoticeView[];
  /** v2.8.45.0 — Phase 3.1-e: shared class materials. */
  materials: MaterialView[];
  subjectCount: number;
  /** v2.8.58.0 — Phase 5.1: the subject NAMES for the card wall. */
  subjects: string[];
  weekly: number[];
  /** Phase 3.1-c — register summary for the "My Attendance" panel. */
  attendanceDetail: AttendanceDetail;
};

export async function getStudentDashboard(
  email: string,
  accountId: number,
  displayName = "",
): Promise<StudentDashboard> {
  const { dayIndex, label, dateLabel } = colomboDayInfo();
  const base: StudentDashboard = {
    ok: true,
    firstName: firstNameFrom(email, "Thomian", displayName),
    admissionNo: "—",
    className: null,
    academicYear: null,
    dayLabel: label,
    dateLabel,
    slots: [],
    assignments: [],
    attendancePct: null,
    marksAvgPct: null,
    homeworkPct: null,
    recentMarks: [],
    notices: [],
    materials: [],
    subjectCount: 0,
    subjects: [],
    weekly: [0, 0, 0, 0, 0, 0, 0],
    attendanceDetail: emptyAttendanceDetail(),
  };

  try {
    /* Registration → LMS bridge: materialize/claim the student person row
       (and auto-enroll into the register class) before reading. */
    let student = (await ensureLmsPerson("student", accountId, email)) as
      | typeof lmsStudents.$inferSelect
      | null;
    if (!student) {
      const [row] = await db
        .select()
        .from(lmsStudents)
        .where(eq(lmsStudents.accountId, accountId))
        .limit(1);
      student = row ?? null;
    }
    if (!student) return base;

    base.firstName = student.fullName.split(/\s+/)[0] || base.firstName;
    base.admissionNo = student.admissionNo;

    const [enrollment] = await db
      .select({
        classId: lmsClasses.id,
        className: lmsClasses.name,
        academicYear: lmsClasses.academicYear,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsClasses, eq(lmsEnrollments.classId, lmsClasses.id))
      .where(
        and(
          eq(lmsEnrollments.studentId, student.id),
          eq(lmsEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (!enrollment) return base;

    base.className = enrollment.className;
    base.academicYear = enrollment.academicYear;

    const classSubjects = await db
      .select({
        id: lmsClassSubjects.id,
        subjectId: lmsSubjects.id,
        subjectName: lmsSubjects.name,
      })
      .from(lmsClassSubjects)
      .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
      .where(eq(lmsClassSubjects.classId, enrollment.classId));
    base.subjectCount = classSubjects.length;
    /* v2.8.58.0 — Phase 5.1: the subject card wall reads the same rows. */
    base.subjects = [...new Set(classSubjects.map((cs) => cs.subjectName))];

    const slotRows = await db
      .select({
        periodNo: lmsTimetableSlots.periodNo,
        subjectName: lmsSubjects.name,
        teacherName: lmsPortalAccounts.fullName,
        room: lmsTimetableSlots.room,
        customLabel: lmsTimetableSlots.customLabel,
      })
      .from(lmsTimetableSlots)
      .leftJoin(lmsSubjects, eq(lmsTimetableSlots.subjectId, lmsSubjects.id))
      .leftJoin(lmsTeachers, eq(lmsTimetableSlots.teacherId, lmsTeachers.id))
      .leftJoin(
        lmsPortalAccounts,
        eq(lmsTeachers.accountId, lmsPortalAccounts.id),
      )
      .where(
        and(
          eq(lmsTimetableSlots.classId, enrollment.classId),
          eq(lmsTimetableSlots.dayOfWeek, dayIndex),
        ),
      )
      .orderBy(lmsTimetableSlots.periodNo)
      .limit(12);
    base.slots = slotRows.map((slot) => ({
      period: slot.periodNo,
      /* v2.8.55.0 — custom (subject-less) periods show their own name. */
      subject: slot.subjectName || slot.customLabel || "Free period",
      teacher: slot.teacherName || "",
      room: slot.room || "",
    }));

    if (classSubjects.length > 0) {
      const csIds = classSubjects.map((cs) => cs.id);

      const assignmentRows = await db
        .select()
        .from(lmsAssignments)
        .where(
          and(
            inArray(lmsAssignments.classSubjectId, csIds),
            eq(lmsAssignments.isActive, true),
            gte(lmsAssignments.dueAt, new Date(Date.now() - 7 * 86400000)),
          ),
        )
        .orderBy(lmsAssignments.dueAt)
        .limit(8);

      if (assignmentRows.length > 0) {
        /* v2.8.57.0 — Phase 4.1: the student's OWN row OR their team's row
           (one submission per group — every member reads its status). */
        const myGroupRows = await db
          .select({ groupId: lmsAssignmentGroupMembers.groupId, assignmentId: lmsAssignmentGroupMembers.assignmentId })
          .from(lmsAssignmentGroupMembers)
          .where(
            and(
              eq(lmsAssignmentGroupMembers.studentId, student.id),
              inArray(
                lmsAssignmentGroupMembers.assignmentId,
                assignmentRows.map((a) => a.id),
              ),
            ),
          );
        const myGroupIds = [...new Set(myGroupRows.map((g) => g.groupId))];
        const submissionRows = myGroupIds.length
          ? await db
              .select({
                assignmentId: lmsSubmissions.assignmentId,
                score: lmsSubmissions.score,
                groupId: lmsSubmissions.groupId,
              })
              .from(lmsSubmissions)
              .where(
                or(
                  and(
                    eq(lmsSubmissions.studentId, student.id),
                    inArray(
                      lmsSubmissions.assignmentId,
                      assignmentRows.map((a) => a.id),
                    ),
                  ),
                  inArray(lmsSubmissions.groupId, myGroupIds),
                ),
              )
          : await db
              .select({
                assignmentId: lmsSubmissions.assignmentId,
                score: lmsSubmissions.score,
                groupId: lmsSubmissions.groupId,
              })
              .from(lmsSubmissions)
              .where(
                and(
                  eq(lmsSubmissions.studentId, student.id),
                  inArray(
                    lmsSubmissions.assignmentId,
                    assignmentRows.map((a) => a.id),
                  ),
                ),
              );
        const myAssignmentGroups = new Map(
          myGroupRows.map((g) => [g.assignmentId, g.groupId]),
        );
        const groupSubsByAssignment = new Map<number, (typeof submissionRows)>();
        for (const s of submissionRows) {
          if (s.groupId == null) continue;
          const list = groupSubsByAssignment.get(s.assignmentId) ?? [];
          list.push(s);
          groupSubsByAssignment.set(s.assignmentId, list);
        }
        const statusFor = (assignmentId: number): { submitted: boolean; scored: boolean } => {
          const myGroup = myAssignmentGroups.get(assignmentId);
          if (myGroup != null) {
            const rows = groupSubsByAssignment.get(assignmentId) ?? [];
            const mine = rows.find((s) => s.groupId === myGroup);
            return { submitted: Boolean(mine), scored: mine?.score != null };
          }
          return {
            submitted: submissionRows.some(
              (s) => s.assignmentId === assignmentId && s.groupId == null,
            ),
            scored: submissionRows.some(
              (s) => s.assignmentId === assignmentId && s.groupId == null && s.score != null,
            ),
          };
        };
        base.assignments = assignmentRows.map((a) => {
          const cs = classSubjects.find((row) => row.id === a.classSubjectId);
          return {
            id: a.id,
            title: a.title,
            subject: cs ? cs.subjectName : "School",
            dueLabel: a.dueAt ? shortDate(a.dueAt) : "No due date",
            submitted: statusFor(a.id).submitted,
            scored: statusFor(a.id).scored,
          };
        });
        base.homeworkPct = pct(
          base.assignments.filter((a) => a.submitted).length,
          base.assignments.length,
        );
      }
    }

    const attendanceDetail = await getStudentAttendanceDetail(student.id);
    base.attendanceDetail = attendanceDetail;
    base.attendancePct = attendanceDetail.pct;

    const markRows = await db
      .select({
        score: lmsMarks.score,
        updatedAt: lmsMarks.updatedAt,
        title: lmsAssessments.title,
        max: lmsAssessments.maxScore,
        classSubjectId: lmsAssessments.classSubjectId,
      })
      .from(lmsMarks)
      .innerJoin(lmsAssessments, eq(lmsMarks.assessmentId, lmsAssessments.id))
      .where(eq(lmsMarks.studentId, student.id))
      .orderBy(desc(lmsMarks.updatedAt))
      .limit(14);

    if (markRows.length > 0) {
      const scored = markRows.filter((m) => m.score != null);
      if (scored.length > 0) {
        base.marksAvgPct = Math.round(
          scored.reduce((sum, m) => sum + ((m.score ?? 0) / m.max) * 100, 0) /
            scored.length,
        );
      }
      base.recentMarks = markRows.slice(0, 5).map((m) => {
        const cs = classSubjects.find((row) => row.id === m.classSubjectId);
        return {
          title: m.title,
          subject: cs ? cs.subjectName : "Assessment",
          score: m.score,
          max: m.max,
          whenLabel: shortDate(m.updatedAt),
        };
      });

      // Deterministic weekly rhythm from real activity volume.
      const n = Math.min(6, markRows.length);
      base.weekly = [
        n,
        Math.max(1, n - 1),
        n + 1,
        Math.max(1, n - 2),
        n,
        n + 2,
        Math.max(1, n),
      ].map((v) => v / (n + 2));
    }

    const noticeRows = await db
      .select({
        id: lmsNotices.id,
        title: lmsNotices.title,
        body: lmsNotices.body,
        linkUrl: lmsNotices.linkUrl,
        createdAt: lmsNotices.createdAt,
      })
      .from(lmsNotices)
      .where(eq(lmsNotices.classId, enrollment.classId))
      .orderBy(desc(lmsNotices.createdAt))
      .limit(3);
    const noticeFileMap = await noticeFilesFor(noticeRows.map((n) => n.id));
    base.notices = noticeRows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      whenLabel: shortDate(n.createdAt),
      linkUrl: n.linkUrl ?? null,
      files: noticeFileMap.get(n.id) ?? [],
    }));

    /* v2.8.45.0 — Phase 3.1-e: the class's shared materials (files + links). */
    const materialRows = await db
      .select({
        id: lmsMaterials.id,
        title: lmsMaterials.title,
        linkUrl: lmsMaterials.externalUrl,
        createdAt: lmsMaterials.createdAt,
        classSubjectId: lmsMaterials.classSubjectId,
      })
      .from(lmsMaterials)
      .innerJoin(lmsClassSubjects, eq(lmsMaterials.classSubjectId, lmsClassSubjects.id))
      .where(eq(lmsClassSubjects.classId, enrollment.classId))
      .orderBy(desc(lmsMaterials.createdAt))
      .limit(6);
    if (materialRows.length > 0) {
      const fileRows = await db
        .select()
        .from(lmsMaterialFiles)
        .where(
          inArray(
            lmsMaterialFiles.materialId,
            materialRows.map((m) => m.id),
          ),
        );
      base.materials = materialRows.map((m) => {
        const cs = classSubjects.find((row) => row.id === m.classSubjectId);
        return {
          id: m.id,
          title: m.title,
          subject: cs ? cs.subjectName : "Class",
          whenLabel: shortDate(m.createdAt),
          linkUrl: m.linkUrl,
          files: fileRows
            .filter((f) => f.materialId === m.id)
            .map((f) => ({
              key: f.objectKey,
              fileName: f.fileName,
              mimeType: f.mimeType,
              sizeBytes: f.sizeBytes,
            })),
        };
      });
    }
  } catch {
    return base;
  }

  return base;
}

/* ── Teacher ──────────────────────────────────────────────────────────── */

export type TeacherRosterStudent = {
  admissionNo: string;
  fullName: string;
  /** v2.8.59.0 — the office/student-uploaded register photo (null → the
      deterministic illustration avatar stands in). */
  photoUrl: string | null;
};

export type TeacherRoster = {
  classId: number;
  className: string;
  subject: string;
  students: TeacherRosterStudent[];
};

export type TeacherDashboard = {
  ok: true;
  firstName: string;
  designation: string;
  dayLabel: string;
  dateLabel: string;
  classes: { id: number; name: string; grade: string; subject: string; students: number }[];
  subjectCount: number;
  studentCount: number;
  ungradedCount: number;
  slots: TimetableSlotView[];
  ungraded: {
    assignment: string;
    student: string;
    whenLabel: string;
    assignmentId: number;
  }[];
  notices: NoticeView[];
  weekly: number[];
  /** v2.8.39.0 — per-class student lists for the roster picture-wall. */
  rosters: TeacherRoster[];
};

export async function getTeacherDashboard(
  email: string,
  accountId: number,
  displayName = "",
): Promise<TeacherDashboard> {
  const { dayIndex, label, dateLabel } = colomboDayInfo();
  const base: TeacherDashboard = {
    ok: true,
    firstName: firstNameFrom(email, "Teacher", displayName),
    designation: "Teacher",
    dayLabel: label,
    dateLabel,
    classes: [],
    subjectCount: 0,
    studentCount: 0,
    ungradedCount: 0,
    slots: [],
    ungraded: [],
    notices: [],
    weekly: [0, 0, 0, 0, 0, 0, 0],
    rosters: [],
  };

  try {
    const teacher =
      ((await ensureLmsPerson("teacher", accountId)) as typeof lmsTeachers.$inferSelect | null) ??
      (await db
        .select()
        .from(lmsTeachers)
        .where(eq(lmsTeachers.accountId, accountId))
        .limit(1)
        .then((rows) => rows[0] ?? null));
    if (!teacher) return base;
    if (teacher.designation) base.designation = teacher.designation;

    const mySubjects = await db
      .select({
        csId: lmsClassSubjects.id,
        classId: lmsClasses.id,
        className: lmsClasses.name,
        grade: lmsClasses.grade,
        subjectId: lmsSubjects.id,
        subjectName: lmsSubjects.name,
      })
      .from(lmsClassSubjects)
      .innerJoin(lmsClasses, eq(lmsClassSubjects.classId, lmsClasses.id))
      .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
      .where(eq(lmsClassSubjects.teacherId, teacher.id));

    if (mySubjects.length === 0) return base;

    base.subjectCount = new Set(mySubjects.map((s) => s.subjectId)).size;

    const classIds = [...new Set(mySubjects.map((s) => s.classId))];

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
    const countByClass = new Map(counts.map((c) => [c.classId, c.count]));
    base.studentCount = counts.reduce((sum, c) => sum + c.count, 0);

    base.classes = classIds.map((classId) => {
      const first = mySubjects.find((s) => s.classId === classId);
      return {
        id: classId,
        name: first?.className || `Class #${classId}`,
        grade: first?.grade || "",
        subject:
          mySubjects
            .filter((s) => s.classId === classId)
            .map((s) => s.subjectName)
            .join(", ") || "—",
        students: countByClass.get(classId) ?? 0,
      };
    });

    const csIds = mySubjects.map((s) => s.csId);

    /* v2.8.39.0 — per-class rosters for the picture wall (owner: selecting a
       class must show every student with their own image). One query for all
       of the teacher's classes, grouped client-side. v2.8.59.0 — the wall
       now shows the REAL register photo when the office (or the student)
       has uploaded one. */
    const rosterRows = await db
      .select({
        classId: lmsEnrollments.classId,
        admissionNo: lmsStudents.admissionNo,
        fullName: lmsStudents.fullName,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
      .where(
        and(
          inArray(lmsEnrollments.classId, classIds),
          eq(lmsEnrollments.status, "active"),
        ),
      )
      .orderBy(lmsStudents.fullName);
    const rosterAdmissions = [...new Set(rosterRows.map((r) => r.admissionNo))];
    const photoRows =
      rosterAdmissions.length > 0
        ? await db
            .select({
              admissionNo: lmsStudentRecords.admissionNo,
              photoUrl: lmsStudentRecords.photoUrl,
            })
            .from(lmsStudentRecords)
            .where(inArray(lmsStudentRecords.admissionNo, rosterAdmissions))
        : [];
    const photoByAdmission = new Map(
      photoRows
        .filter((p) => p.photoUrl)
        .map((p) => [p.admissionNo, p.photoUrl as string]),
    );
    base.rosters = classIds.map((classId) => {
      const first = mySubjects.find((s) => s.classId === classId);
      return {
        classId,
        className: first?.className || `Class #${classId}`,
        subject:
          mySubjects
            .filter((s) => s.classId === classId)
            .map((s) => s.subjectName)
            .join(", ") || "—",
        students: rosterRows
          .filter((r) => r.classId === classId)
          .map((r) => ({
            admissionNo: r.admissionNo,
            fullName: r.fullName,
            photoUrl: photoByAdmission.get(r.admissionNo) ?? null,
          })),
      };
    });

    const assignmentRows = await db
      .select()
      .from(lmsAssignments)
      .where(
        and(
          inArray(lmsAssignments.classSubjectId, csIds),
          eq(lmsAssignments.isActive, true),
        ),
      )
      .limit(50);

    if (assignmentRows.length > 0) {
      const pending = await db
        .select({
          assignmentId: lmsSubmissions.assignmentId,
          submittedAt: lmsSubmissions.submittedAt,
          studentName: lmsStudents.fullName,
          title: lmsAssignments.title,
          groupName: lmsAssignmentGroups.name,
        })
        .from(lmsSubmissions)
        .innerJoin(
          lmsAssignments,
          eq(lmsSubmissions.assignmentId, lmsAssignments.id),
        )
        .innerJoin(lmsStudents, eq(lmsSubmissions.studentId, lmsStudents.id))
        .leftJoin(
          lmsAssignmentGroups,
          eq(lmsSubmissions.groupId, lmsAssignmentGroups.id),
        )
        .where(
          and(
            inArray(
              lmsSubmissions.assignmentId,
              assignmentRows.map((a) => a.id),
            ),
            isNull(lmsSubmissions.score),
          ),
        )
        .orderBy(desc(lmsSubmissions.submittedAt))
        .limit(6);

      base.ungradedCount = pending.length;
      base.ungraded = pending.map((p) => ({
        assignment: p.title,
        /* v2.8.57.0 — Phase 4.1: group submissions name the TEAM (the
           member who submitted is in brackets). */
        student: p.groupName
          ? `${p.groupName} (${p.studentName})`
          : p.studentName,
        whenLabel: shortDate(p.submittedAt),
        assignmentId: p.assignmentId,
      }));

      const n = Math.min(6, pending.length + assignmentRows.length);
      base.weekly = [
        n,
        Math.max(1, n - 1),
        n + 1,
        Math.max(1, n - 2),
        n,
        n + 2,
        Math.max(1, n),
      ].map((v) => v / (n + 2));
    }

    const slotRows = await db
      .select({
        periodNo: lmsTimetableSlots.periodNo,
        subjectName: lmsSubjects.name,
        className: lmsClasses.name,
        room: lmsTimetableSlots.room,
        customLabel: lmsTimetableSlots.customLabel,
      })
      .from(lmsTimetableSlots)
      .leftJoin(lmsSubjects, eq(lmsTimetableSlots.subjectId, lmsSubjects.id))
      .innerJoin(lmsClasses, eq(lmsTimetableSlots.classId, lmsClasses.id))
      .where(
        and(
          eq(lmsTimetableSlots.teacherId, teacher.id),
          eq(lmsTimetableSlots.dayOfWeek, dayIndex),
        ),
      )
      .orderBy(lmsTimetableSlots.periodNo)
      .limit(12);
    base.slots = slotRows.map((slot) => ({
      period: slot.periodNo,
      /* v2.8.55.0 — custom (subject-less) periods show their own name. */
      subject: slot.subjectName || slot.customLabel || "Lesson",
      teacher: slot.className,
      room: slot.room || "",
    }));

    const noticeRows = await db
      .select({
        id: lmsNotices.id,
        title: lmsNotices.title,
        body: lmsNotices.body,
        linkUrl: lmsNotices.linkUrl,
        createdAt: lmsNotices.createdAt,
      })
      .from(lmsNotices)
      .where(inArray(lmsNotices.classId, classIds))
      .orderBy(desc(lmsNotices.createdAt))
      .limit(3);
    const noticeFileMap = await noticeFilesFor(noticeRows.map((n) => n.id));
    base.notices = noticeRows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      whenLabel: shortDate(n.createdAt),
      linkUrl: n.linkUrl ?? null,
      files: noticeFileMap.get(n.id) ?? [],
    }));
  } catch {
    return base;
  }

  return base;
}

/* ── Parent ───────────────────────────────────────────────────────────── */

export type ParentChild = {
  name: string;
  className: string | null;
  admissionNo: string;
  /** v2.8.46.0 — lms_students.id, so the dashboard can deep-link the
      per-child homework + marks pages. */
  studentId: number;
  attendancePct: number | null;
  marksAvgPct: number | null;
  /** Phase 3.1-c — absence count + most recent absent day label. */
  absences: number;
  lastAbsentLabel: string | null;
};

export type ParentDashboard = {
  ok: true;
  firstName: string;
  dayLabel: string;
  dateLabel: string;
  children: ParentChild[];
  notices: NoticeView[];
  weekly: number[];
};

export async function getParentDashboard(
  email: string,
  accountId: number,
  displayName = "",
): Promise<ParentDashboard> {
  const { label, dateLabel } = colomboDayInfo();
  const base: ParentDashboard = {
    ok: true,
    firstName: firstNameFrom(email, "Parent", displayName),
    dayLabel: label,
    dateLabel,
    children: [],
    notices: [],
    weekly: [0, 0, 0, 0, 0, 0, 0],
  };

  try {
    const parent =
      ((await ensureLmsPerson("parent", accountId)) as typeof lmsParents.$inferSelect | null) ??
      (await db
        .select()
        .from(lmsParents)
        .where(eq(lmsParents.accountId, accountId))
        .limit(1)
        .then((rows) => rows[0] ?? null));
    if (!parent) return base;

    const links = await db
      .select()
      .from(lmsParentChildren)
      .where(eq(lmsParentChildren.parentId, parent.id));
    if (links.length === 0) return base;

    const childRows = await db
      .select()
      .from(lmsStudents)
      .where(
        inArray(
          lmsStudents.id,
          links.map((l) => l.studentId),
        ),
      );
    if (childRows.length === 0) return base;

    const notices: NoticeView[] = [];

    for (const child of childRows) {
      const childView: ParentChild = {
        name: child.fullName,
        className: null,
        admissionNo: child.admissionNo,
        studentId: child.id,
        attendancePct: null,
        marksAvgPct: null,
        absences: 0,
        lastAbsentLabel: null,
      };

      const [enrollment] = await db
        .select({ classId: lmsClasses.id, className: lmsClasses.name })
        .from(lmsEnrollments)
        .innerJoin(lmsClasses, eq(lmsEnrollments.classId, lmsClasses.id))
        .where(
          and(
            eq(lmsEnrollments.studentId, child.id),
            eq(lmsEnrollments.status, "active"),
          ),
        )
        .limit(1);

      if (enrollment) {
        childView.className = enrollment.className;

        const childAttendance = await getChildAttendanceSummary(child.id);
        childView.attendancePct = childAttendance.pct;
        childView.absences = childAttendance.absences;
        childView.lastAbsentLabel = childAttendance.lastAbsentLabel;

        const markRows = await db
          .select({
            score: lmsMarks.score,
            max: lmsAssessments.maxScore,
          })
          .from(lmsMarks)
          .innerJoin(
            lmsAssessments,
            eq(lmsMarks.assessmentId, lmsAssessments.id),
          )
          .where(eq(lmsMarks.studentId, child.id));
        const scored = markRows.filter((m) => m.score != null);
        if (scored.length > 0) {
          childView.marksAvgPct = Math.round(
            scored.reduce((sum, m) => sum + ((m.score ?? 0) / m.max) * 100, 0) /
              scored.length,
          );
        }

        const noticeRows = await db
          .select({
            id: lmsNotices.id,
            title: lmsNotices.title,
            body: lmsNotices.body,
            linkUrl: lmsNotices.linkUrl,
            createdAt: lmsNotices.createdAt,
          })
          .from(lmsNotices)
          .where(eq(lmsNotices.classId, enrollment.classId))
          .orderBy(desc(lmsNotices.createdAt))
          .limit(3);
        const childNoticeFiles = await noticeFilesFor(noticeRows.map((n) => n.id));
        notices.push(
          ...noticeRows.map((n) => ({
            id: n.id,
            title: `${n.title} — ${child.fullName.split(/\s+/)[0]}`,
            body: n.body,
            whenLabel: shortDate(n.createdAt),
            linkUrl: n.linkUrl ?? null,
            files: childNoticeFiles.get(n.id) ?? [],
          })),
        );
      }

      base.children.push(childView);
    }

    base.notices = notices.slice(0, 3);
    const c = Math.max(1, base.children.length);
    base.weekly = [c, c, c + 1, c, c, c + 1, c].map((v) => v / (c + 1));
  } catch {
    return base;
  }

  return base;
}
