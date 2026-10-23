import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Learning Management System schema (Phase 3.1).
 *
 * Regenerated 2026-10-17 from the LIVE Supabase DDL
 * (scripts/dump-lms-ddl.mjs) after the workspace rollback — every table
 * matches information_schema exactly, so drizzle queries never drift from
 * what Postgres already serves.
 *
 * Identity model:
 * - lms_portal_accounts holds portal logins. The composite unique
 *   (email, role) lets one Google identity hold several roles
 *   (e.g. teacher + student + parent) — each role is a separate row.
 * - lms_students / lms_teachers / lms_parents are the person records that
 *   link to their login row through account_id.
 */

export const lmsClasses = pgTable("lms_classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  grade: varchar("grade", { length: 10 }).notNull(),
  section: varchar("section", { length: 10 }),
  academicYear: varchar("academic_year", { length: 9 }).notNull(),
  classTeacherId: integer("class_teacher_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsSubjects = pgTable("lms_subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: varchar("code", { length: 30 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsClassSubjects = pgTable(
  "lms_class_subjects",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id").notNull(),
    subjectId: integer("subject_id").notNull(),
    teacherId: integer("teacher_id"),
  },
  (t) => [uniqueIndex("lms_class_subjects_unique").on(t.classId, t.subjectId)],
);

export const lmsStudents = pgTable("lms_students", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id"),
  admissionNo: varchar("admission_no", { length: 40 }).notNull().unique(),
  fullName: text("full_name").notNull(),
  gender: varchar("gender", { length: 10 }),
  dateOfBirth: varchar("date_of_birth", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsTeachers = pgTable("lms_teachers", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().unique(),
  staffCode: varchar("staff_code", { length: 40 }),
  designation: text("designation"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsParents = pgTable("lms_parents", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().unique(),
  relationship: varchar("relationship", { length: 20 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsEnrollments = pgTable(
  "lms_enrollments",
  {
    id: serial("id").primaryKey(),
    studentId: integer("student_id").notNull(),
    classId: integer("class_id").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lms_enrollments_unique").on(t.studentId, t.classId)],
);

export const lmsAssignments = pgTable("lms_assignments", {
  id: serial("id").primaryKey(),
  classSubjectId: integer("class_subject_id").notNull(),
  title: text("title").notNull(),
  instructions: text("instructions"),
  dueAt: timestamp("due_at"),
  attachmentAssetId: integer("attachment_asset_id"),
  /* v2.8.43.0 — teacher attachments: an optional reference link (Drive,
     YouTube, mailto…) plus N files stored through the media pipeline
     (lms_assignment_files). attachment_asset_id stays for legacy rows. */
  linkUrl: text("link_url"),
  /* v2.8.56.0 — Phase 3.2: the mark ceiling for this piece of work.
     Grade letters (A/B/C/S/W) derive from score ÷ max_score, so every
     assignment must know its own scale. 100 for every legacy row. */
  maxScore: integer("max_score").notNull().default(100),
  createdByAccountId: integer("created_by_account_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** v2.8.43.0 — files a teacher attaches to an assignment (multi-file). */
export const lmsAssignmentFiles = pgTable(
  "lms_assignment_files",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    uploadedByAccountId: integer("uploaded_by_account_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lms_assignment_files_key_unique").on(t.objectKey),
    index("lms_assignment_files_assignment_idx").on(t.assignmentId),
  ],
);

export const lmsSubmissions = pgTable(
  "lms_submissions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull(),
    studentId: integer("student_id").notNull(),
    contentText: text("content_text"),
    attachmentAssetId: integer("attachment_asset_id"),
    /* v2.8.43.0 — student answer link (Drive/YouTube/mailto…) complementing
       the files in lms_submission_files. */
    linkUrl: text("link_url"),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    isLate: boolean("is_late").notNull().default(false),
    score: integer("score"),
    feedback: text("feedback"),
    gradedAt: timestamp("graded_at"),
    gradedByAccountId: integer("graded_by_account_id"),
    /* v2.8.57.0 — Phase 4.1: for GROUP assignments the row belongs to the
       whole team — one submission per (assignment, group); student_id keeps
       the member who created it. NULL on the classic individual rows. */
    groupId: integer("group_id"),
  },
  (t) => [uniqueIndex("lms_submissions_unique").on(t.assignmentId, t.studentId)],
);

/**
 * v2.8.57.0 — PHASE 4.1 (Option B, the owner's approved design):
 * teacher-created groups for group assignments. Group mode is DERIVED —
 * an assignment is group work exactly when it has groups here, so there
 * is no extra mode column to keep in step.
 */
export const lmsAssignmentGroups = pgTable(
  "lms_assignment_groups",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("lms_assignment_groups_assignment_idx").on(t.assignmentId)],
);

/** Members of one group; adjustment = the optional per-student delta
 *  (e.g. −10 / +5) applied on top of the group's score for the final mark. */
export const lmsAssignmentGroupMembers = pgTable(
  "lms_assignment_group_members",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull(),
    groupId: integer("group_id").notNull(),
    studentId: integer("student_id").notNull(),
    adjustment: integer("adjustment"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lms_assignment_group_members_unique").on(t.groupId, t.studentId),
    /* one group per student per assignment — DB-level */
    uniqueIndex("lms_assignment_group_members_student_unique").on(
      t.assignmentId,
      t.studentId,
    ),
  ],
);

/** v2.8.43.0 — files a student submits with one answer (multi-file). */
export const lmsSubmissionFiles = pgTable(
  "lms_submission_files",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull(),
    assignmentId: integer("assignment_id").notNull(),
    studentId: integer("student_id").notNull(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lms_submission_files_key_unique").on(t.objectKey),
    index("lms_submission_files_assignment_student_idx").on(t.assignmentId, t.studentId),
  ],
);

/**
 * v2.8.50.0 — Phase 2.1: the private Q&A thread on ONE assignment for ONE
 * student ("Ask the teacher"). A thread is the (assignment_id, student_id)
 * pair; author_role flips between 'student' (the question) and 'teacher'
 * (the answer). Privacy contract: a thread is readable ONLY by that student
 * and the teachers who teach the assignment's class×subject — enforced in
 * every reader/writer, never by the client. Plain-text rows, very small.
 *
 * v2.8.51.0 — chat polish: read_at records the moment the RECIPIENT of a
 * message first loaded its thread (drives the ✓✓ "seen" tick and the
 * unread badges across the new Chat hub); deleted_at is the WhatsApp-style
 * soft delete — the body stays in the row but every reader returns an
 * empty body and the UI shows the "message deleted" stub.
 */
export const lmsAssignmentQuestions = pgTable(
  "lms_assignment_questions",
  {
    id: serial("id").primaryKey(),
    assignmentId: integer("assignment_id").notNull(),
    /** The thread owner — the student asking. */
    studentId: integer("student_id").notNull(),
    /** 'student' | 'teacher' */
    authorRole: varchar("author_role", { length: 10 }).notNull(),
    /** The portal account that wrote this message. */
    authorAccountId: integer("author_account_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** When the message's RECIPIENT first read it (null = still unread). */
    readAt: timestamp("read_at"),
    /**
     * v2.8.52.0 — when the message reached the recipient's app (their chat
     * hub fetched it): drives the WhatsApp ✓✓-gray "delivered" tick, one
     * step before read_at's ✓✓-accent "seen" tick.
     */
    deliveredAt: timestamp("delivered_at"),
    /**
     * v2.8.53.0 — ONE optional file per message (the owner's WhatsApp-clone
     * ask). Bytes live in the provider-neutral storage layer under the
     * lms-chat/ prefix; readers fetch them ONLY through the
     * permission-checked /api/portal/chat/file/[messageId] route. Cleared
     * (and the blob deleted) when the author soft-deletes the message.
     */
    objectKey: text("object_key"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    /** Soft delete — set by the AUTHOR only; body is withheld from readers. */
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("lms_assignment_questions_thread_idx").on(t.assignmentId, t.studentId),
    index("lms_assignment_questions_assignment_idx").on(t.assignmentId),
  ],
);

export const lmsAttendance = pgTable(
  "lms_attendance",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id").notNull(),
    studentId: integer("student_id").notNull(),
    /** Local ISO date (YYYY-MM-DD) of the school day being marked. */
    day: varchar("day", { length: 10 }).notNull(),
    /** present | absent | late | excused */
    status: varchar("status", { length: 10 }).notNull(),
    markedByAccountId: integer("marked_by_account_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lms_attendance_unique").on(t.classId, t.studentId, t.day),
  ],
);

export const lmsAssessments = pgTable("lms_assessments", {
  id: serial("id").primaryKey(),
  classSubjectId: integer("class_subject_id").notNull(),
  title: text("title").notNull(),
  /** Term 1 | Term 2 | Term 3 */
  term: varchar("term", { length: 10 }).notNull(),
  maxScore: integer("max_score").notNull().default(100),
  createdByAccountId: integer("created_by_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsMarks = pgTable(
  "lms_marks",
  {
    id: serial("id").primaryKey(),
    assessmentId: integer("assessment_id").notNull(),
    studentId: integer("student_id").notNull(),
    score: integer("score"),
    gradedByAccountId: integer("graded_by_account_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lms_marks_unique").on(t.assessmentId, t.studentId)],
);

export const lmsTimetableSlots = pgTable("lms_timetable_slots", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  /** 0 = Sunday … 6 = Saturday (matches JS getDay()). */
  dayOfWeek: integer("day_of_week").notNull(),
  periodNo: integer("period_no").notNull(),
  subjectId: integer("subject_id"),
  teacherId: integer("teacher_id"),
  room: text("room"),
  /** v2.8.55.0 — free-text period name when there is NO subject (outside
      activities, assemblies…). NULL for ordinary subject lessons. */
  customLabel: text("custom_label"),
});

export const lmsMaterials = pgTable("lms_materials", {
  id: serial("id").primaryKey(),
  classSubjectId: integer("class_subject_id").notNull(),
  title: text("title").notNull(),
  attachmentAssetId: integer("attachment_asset_id"),
  externalUrl: text("external_url"),
  createdByAccountId: integer("created_by_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** v2.8.45.0 — Phase 3.1-e: files a teacher attaches to a class material. */
export const lmsMaterialFiles = pgTable(
  "lms_material_files",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id").notNull(),
    classSubjectId: integer("class_subject_id").notNull(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lms_material_files_key_unique").on(t.objectKey),
    index("lms_material_files_material_idx").on(t.materialId),
  ],
);

export const lmsNotices = pgTable("lms_notices", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /* v2.8.59.0 — the owner: "notice daddi links, images, pdf danna option
     ekath danna wei ne" — one reference link (Drive/YouTube/mailto…)
     beside the text, mirroring assignments & materials. */
  linkUrl: text("link_url"),
  createdByAccountId: integer("created_by_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** v2.8.59.0 — files a teacher attaches to a notice (images, PDFs, docs…).
 *  Bytes live in the shared storage layer under lms-notice/; readers fetch
 *  them ONLY through the audience-checked
 *  /api/portal/notices/[id]/file/[fileId] route. */
export const lmsNoticeFiles = pgTable(
  "lms_notice_files",
  {
    id: serial("id").primaryKey(),
    noticeId: integer("notice_id").notNull(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lms_notice_files_key_unique").on(t.objectKey),
    index("lms_notice_files_notice_idx").on(t.noticeId),
  ],
);

export const lmsPortalAccounts = pgTable(
  "lms_portal_accounts",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 180 }).notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    fullName: text("full_name").notNull(),
    avatarUrl: text("avatar_url"),
    supabaseUserId: text("supabase_user_id"),
    active: boolean("active").notNull().default(true),
    invitedBy: integer("invited_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at"),
    /** NULL = Google-only sign-in. Format: scrypt$salt$key (or scrypt:salt:key). */
    passwordHash: text("password_hash"),
    /** active = verified/live; pending = awaiting office approval; rejected = refused. */
    status: varchar("status", { length: 20 }).notNull().default("active"),
    /** JSON snapshot of the verification details submitted at registration. */
    verification: text("verification"),
  },
  (t) => [
    uniqueIndex("lms_portal_accounts_email_role_unique").on(t.email, t.role),
  ],
);

/**
 * OFFICE REGISTERS — the verification source of truth for self-registration
 * (v2.8.33.0). The office imports who is ENTITLED to an account:
 *
 * - lms_student_records: one row per student on the admission register.
 *   A self-registration must match admission no + class + register no + the
 *   father/mother names before it is auto-approved; anything else lands in
 *   the office approval queue.
 * - lms_teacher_records: one row per teacher on the staff register (~170).
 *   A self-registration must match teacher ID + name (+ email when held).
 *
 * These are deliberately separate from the LMS person tables (lms_students /
 * lms_teachers) — those get linked when accounts are approved.
 */
export const lmsStudentRecords = pgTable("lms_student_records", {
  id: serial("id").primaryKey(),
  admissionNo: varchar("admission_no", { length: 40 }).notNull().unique(),
  registerNo: varchar("register_no", { length: 40 }),
  fullName: text("full_name").notNull(),
  className: varchar("class_name", { length: 40 }).notNull(),
  fatherName: text("father_name").notNull(),
  motherName: text("mother_name").notNull(),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 180 }),
  /* v2.8.59.0 — the profile photo hangs on the REGISTER row (the office's
     source of truth), so it exists before the student ever makes an account
     and shows in the teacher's roster wall through the admission-no join.
     photo_key is the storage key; photo_url the display URL. */
  photoKey: text("photo_key"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsTeacherRecords = pgTable("lms_teacher_records", {
  id: serial("id").primaryKey(),
  teacherId: varchar("teacher_id", { length: 40 }).notNull().unique(),
  fullName: text("full_name").notNull(),
  email: varchar("email", { length: 180 }),
  phone: varchar("phone", { length: 30 }),
  designation: text("designation"),
  /* v2.8.59.0 — staff photo (same register-row pattern as students). */
  photoKey: text("photo_key"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsPortalSessions = pgTable("lms_portal_sessions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * One-time tokens for the multi-role chooser step after Google sign-in.
 * Stored in the DATABASE (not memory) so the chooser survives dev-server
 * reloads and sandbox restarts mid-flow. Only the SHA-256 hash is kept.
 */
export const lmsOauthChoices = pgTable("lms_oauth_choices", {
  id: serial("id").primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 180 }).notNull(),
  /** Comma-joined portal roles, e.g. "student,parent". */
  roles: varchar("roles", { length: 80 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lmsParentChildren = pgTable(
  "lms_parent_children",
  {
    id: serial("id").primaryKey(),
    parentId: integer("parent_id").notNull(),
    studentId: integer("student_id").notNull(),
  },
  (t) => [uniqueIndex("lms_parent_children_unique").on(t.parentId, t.studentId)],
);

export type LmsPortalAccount = typeof lmsPortalAccounts.$inferSelect;
export type LmsPortalRole = "student" | "teacher" | "parent";
