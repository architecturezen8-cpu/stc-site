import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";

/* ── Runtime schema guard for later column additions ────────────────────
   The sandbox database is provisioned by scripts/db-setup.mjs from the
   generated migrations. Databases created before these columns existed get
   them added idempotently on first use — no manual migration step. */
let ready: Promise<void> | null = null;

async function run() {
  await db.execute(sql`
    ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "photo_scale" integer DEFAULT 100 NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "image_scale" integer DEFAULT 100 NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "extra_images" jsonb DEFAULT '[]'::jsonb NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "links" jsonb DEFAULT '[]'::jsonb NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "videos" jsonb DEFAULT '[]'::jsonb NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "unit_gallery_items" ADD COLUMN IF NOT EXISTS "zoom" integer DEFAULT 100 NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "avatar" text
  `);
  await db.execute(sql`
    ALTER TABLE "admin_users"
      ADD COLUMN IF NOT EXISTS "auth_provider" varchar(20) DEFAULT 'password' NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "media_blobs"
      ADD COLUMN IF NOT EXISTS "s3_migrated_at" timestamptz
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "cadet_intro_overrides" (
      "id" serial PRIMARY KEY,
      "unit_slug" varchar(80) NOT NULL UNIQUE,
      "enabled" varchar(10) DEFAULT '' NOT NULL,
      "hold_ms" integer,
      "logo_src" text DEFAULT '' NOT NULL,
      "logo_scale" integer DEFAULT 100 NOT NULL,
      "tagline" text DEFAULT '' NOT NULL,
      "updated_by" integer,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "is_new" boolean DEFAULT false NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_new" boolean DEFAULT false NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "is_new" boolean DEFAULT false NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "popups" ADD COLUMN IF NOT EXISTS "event_at" timestamp
  `);
  await db.execute(sql`
    ALTER TABLE "popups" ADD COLUMN IF NOT EXISTS "platform" varchar(20)
  `);
  await db.execute(sql`
    ALTER TABLE "popups" ADD COLUMN IF NOT EXISTS "links" jsonb DEFAULT '[]'::jsonb NOT NULL
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "stream_teachers" (
      "id" serial PRIMARY KEY,
      "stream_slug" varchar(60) NOT NULL,
      "name" text NOT NULL,
      "role" text NOT NULL,
      "subject" text NOT NULL,
      "qualification" text NOT NULL,
      "image" text NOT NULL,
      "staff_id" integer,
      "is_new" boolean DEFAULT false NOT NULL,
      "sort_order" integer DEFAULT 100 NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "stream_classes" (
      "id" serial PRIMARY KEY,
      "stream_slug" varchar(60) NOT NULL,
      "code" varchar(20) NOT NULL,
      "grade" varchar(40) NOT NULL,
      "strength" varchar(40) NOT NULL,
      "class_teacher" text NOT NULL,
      "room" varchar(60) NOT NULL,
      "sort_order" integer DEFAULT 100 NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "old_thomians" (
      "id" serial PRIMARY KEY,
      "name" text NOT NULL,
      "note" text NOT NULL,
      "field" varchar(60) NOT NULL,
      "image" text NOT NULL,
      "staff_id" integer,
      "is_new" boolean DEFAULT false NOT NULL,
      "sort_order" integer DEFAULT 100 NOT NULL
    )
  `);
  await db.execute(sql`
    ALTER TABLE "content_collections" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "admin_access_requests" (
      "id" serial PRIMARY KEY,
      "name" varchar(120) NOT NULL,
      "email" varchar(160) NOT NULL,
      "reason" text,
      "status" varchar(20) DEFAULT 'pending' NOT NULL,
      "reviewed_by" integer,
      "reviewed_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  /* ── Phase 3.1 LMS core self-provisioning (fresh-DB safe) ────────────
     The LMS tables live in schema-lms.ts but are NOT part of the drizzle
     migrations (they were provisioned directly on live Supabase). This
     block recreates every LMS table with CREATE TABLE IF NOT EXISTS so a
     fresh/rollback environment bootstraps itself at request time. Column
     definitions mirror schema-lms.ts exactly. */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_classes" (
      "id" serial PRIMARY KEY,
      "name" text NOT NULL,
      "grade" varchar(10) NOT NULL,
      "section" varchar(10),
      "academic_year" varchar(9) NOT NULL,
      "class_teacher_id" integer,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_subjects" (
      "id" serial PRIMARY KEY,
      "name" text NOT NULL,
      "code" varchar(30),
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_class_subjects" (
      "id" serial PRIMARY KEY,
      "class_id" integer NOT NULL,
      "subject_id" integer NOT NULL,
      "teacher_id" integer
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_students" (
      "id" serial PRIMARY KEY,
      "account_id" integer,
      "admission_no" varchar(40) NOT NULL UNIQUE,
      "full_name" text NOT NULL,
      "gender" varchar(10),
      "date_of_birth" varchar(20),
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_teachers" (
      "id" serial PRIMARY KEY,
      "account_id" integer NOT NULL UNIQUE,
      "staff_code" varchar(40),
      "designation" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_parents" (
      "id" serial PRIMARY KEY,
      "account_id" integer NOT NULL UNIQUE,
      "relationship" varchar(20),
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_enrollments" (
      "id" serial PRIMARY KEY,
      "student_id" integer NOT NULL,
      "class_id" integer NOT NULL,
      "status" varchar(20) DEFAULT 'active' NOT NULL,
      "enrolled_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_assignments" (
      "id" serial PRIMARY KEY,
      "class_subject_id" integer NOT NULL,
      "title" text NOT NULL,
      "instructions" text,
      "due_at" timestamp,
      "attachment_asset_id" integer,
      "max_score" integer DEFAULT 100 NOT NULL,
      "created_by_account_id" integer,
      "is_active" boolean DEFAULT true NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  /* v2.8.56.0 — Phase 3.2: the mark ceiling per assignment. Grade letters
     (A 75+ / B 65–74 / C 55–64 / S 35–54 / W <35) are score ÷ max_score,
     so each assignment carries its own scale; legacy rows get 100. */
  await db.execute(sql`
    ALTER TABLE "lms_assignments"
      ADD COLUMN IF NOT EXISTS "max_score" integer DEFAULT 100 NOT NULL
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_submissions" (
      "id" serial PRIMARY KEY,
      "assignment_id" integer NOT NULL,
      "student_id" integer NOT NULL,
      "content_text" text,
      "attachment_asset_id" integer,
      "submitted_at" timestamp DEFAULT now() NOT NULL,
      "is_late" boolean DEFAULT false NOT NULL,
      "score" integer,
      "feedback" text,
      "graded_at" timestamp,
      "graded_by_account_id" integer,
      "group_id" integer
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_submissions_unique"
      ON "lms_submissions" ("assignment_id", "student_id")
  `);
  /* v2.8.57.0 — Phase 4.1: ONE submission per (assignment, group); the
     student_id column keeps the member who created it. */
  await db.execute(sql`
    ALTER TABLE "lms_submissions" ADD COLUMN IF NOT EXISTS "group_id" integer
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_submissions_group_unique"
      ON "lms_submissions" ("assignment_id", "group_id")
      WHERE "group_id" IS NOT NULL
  `);
  /* v2.8.57.0 — PHASE 4.1 (Option B): teacher-created groups. Group mode is
     DERIVED — an assignment is group work exactly when it has groups here —
     and the optional member adjustment is the per-student delta applied on
     top of the group's score for the final mark. */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_assignment_groups" (
      "id" serial PRIMARY KEY,
      "assignment_id" integer NOT NULL,
      "name" varchar(80) NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_assignment_group_members" (
      "id" serial PRIMARY KEY,
      "assignment_id" integer NOT NULL,
      "group_id" integer NOT NULL,
      "student_id" integer NOT NULL,
      "adjustment" integer,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_assignment_group_members_unique"
      ON "lms_assignment_group_members" ("group_id", "student_id")
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_assignment_group_members_student_unique"
      ON "lms_assignment_group_members" ("assignment_id", "student_id")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "lms_assignment_groups_assignment_idx"
      ON "lms_assignment_groups" ("assignment_id")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_attendance" (
      "id" serial PRIMARY KEY,
      "class_id" integer NOT NULL,
      "student_id" integer NOT NULL,
      "day" varchar(10) NOT NULL,
      "status" varchar(10) NOT NULL,
      "marked_by_account_id" integer,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_attendance_unique"
      ON "lms_attendance" ("class_id", "student_id", "day")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_assessments" (
      "id" serial PRIMARY KEY,
      "class_subject_id" integer NOT NULL,
      "title" text NOT NULL,
      "term" varchar(10) NOT NULL,
      "max_score" integer DEFAULT 100 NOT NULL,
      "created_by_account_id" integer,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_marks" (
      "id" serial PRIMARY KEY,
      "assessment_id" integer NOT NULL,
      "student_id" integer NOT NULL,
      "score" integer,
      "graded_by_account_id" integer,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_marks_unique"
      ON "lms_marks" ("assessment_id", "student_id")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_timetable_slots" (
      "id" serial PRIMARY KEY,
      "class_id" integer NOT NULL,
      "day_of_week" integer NOT NULL,
      "period_no" integer NOT NULL,
      "subject_id" integer,
      "teacher_id" integer,
      "room" text
    )
  `);
  /* v2.8.54.0 — Phase 3.1: ONE lesson per class × day × period. The editor
     upserts on this key, so duplicates must be impossible at the DB level. */
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_timetable_slot_unique"
      ON "lms_timetable_slots" ("class_id", "day_of_week", "period_no")
  `);
  /* v2.8.55.0 — Phase 3.1 round 2: periods WITHOUT a subject (the owner:
     "samahara welawata subjects nathuwa outside activities ehema
     thiyanawa"). custom_label carries the free-text name — subject_id
     stays NULL on those rows. Idempotent, matching every extra here. */
  await db.execute(sql`
    ALTER TABLE "lms_timetable_slots"
      ADD COLUMN IF NOT EXISTS "custom_label" text
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_materials" (
      "id" serial PRIMARY KEY,
      "class_subject_id" integer NOT NULL,
      "title" text NOT NULL,
      "attachment_asset_id" integer,
      "external_url" text,
      "created_by_account_id" integer,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_notices" (
      "id" serial PRIMARY KEY,
      "class_id" integer NOT NULL,
      "title" text NOT NULL,
      "body" text NOT NULL,
      "created_by_account_id" integer,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  /* v2.8.45.0 — Phase 3.1-e: materials carry N files through the same
     storage pipeline as assignment attachments (lms-work/ keys). */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_material_files" (
      "id" serial PRIMARY KEY,
      "material_id" integer NOT NULL,
      "class_subject_id" integer NOT NULL,
      "object_key" text NOT NULL,
      "file_name" text NOT NULL,
      "mime_type" varchar(120) DEFAULT 'application/octet-stream' NOT NULL,
      "size_bytes" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "lms_material_files_key_unique" ON "lms_material_files" ("object_key")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "lms_material_files_material_idx" ON "lms_material_files" ("material_id")`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_portal_accounts" (
      "id" serial PRIMARY KEY,
      "email" varchar(180) NOT NULL,
      "role" varchar(20) NOT NULL,
      "full_name" text NOT NULL,
      "avatar_url" text,
      "supabase_user_id" text,
      "active" boolean DEFAULT true NOT NULL,
      "invited_by" integer,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "last_login_at" timestamp,
      "password_hash" text,
      "status" varchar(20) DEFAULT 'active' NOT NULL,
      "verification" text
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_parent_children" (
      "id" serial PRIMARY KEY,
      "parent_id" integer NOT NULL,
      "student_id" integer NOT NULL
    )
  `);
  /* ── Phase 3.1 LMS guard ─────────────────────────────────────────────
     The email-constraint drop enforces the (email, role) composite model —
     one Google identity may hold several portal roles. Safe on both fresh
     and live databases (table now guaranteed to exist above). */
  await db.execute(sql`
    ALTER TABLE "lms_portal_accounts" DROP CONSTRAINT IF EXISTS "lms_portal_accounts_email_key"
  `);
  await db.execute(sql`
    ALTER TABLE "lms_portal_accounts" ADD COLUMN IF NOT EXISTS "password_hash" text
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_portal_accounts_email_role_unique"
      ON "lms_portal_accounts" ("email", "role")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_portal_sessions" (
      "id" serial PRIMARY KEY,
      "account_id" integer NOT NULL,
      "token_hash" varchar(64) NOT NULL UNIQUE,
      "expires_at" timestamp NOT NULL,
      "user_agent" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_oauth_choices" (
      "id" serial PRIMARY KEY,
      "token_hash" varchar(64) NOT NULL UNIQUE,
      "email" varchar(180) NOT NULL,
      "roles" varchar(80) NOT NULL,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    DELETE FROM "lms_oauth_choices" WHERE "expires_at" <= now()
  `);
  /* ── v2.8.33.0 registration verification ──────────────────────────────
     Office registers (verification source of truth) + account status.
     Every self-registration is matched against these registers; anything
     that does not fully match waits in the office approval queue. */
  await db.execute(sql`
    ALTER TABLE "lms_portal_accounts"
      ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL
  `);
  await db.execute(sql`
    ALTER TABLE "lms_portal_accounts" ADD COLUMN IF NOT EXISTS "verification" text
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_student_records" (
      "id" serial PRIMARY KEY,
      "admission_no" varchar(40) NOT NULL UNIQUE,
      "register_no" varchar(40),
      "full_name" text NOT NULL,
      "class_name" varchar(40) NOT NULL,
      "father_name" text NOT NULL,
      "mother_name" text NOT NULL,
      "phone" varchar(30),
      "email" varchar(180),
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_teacher_records" (
      "id" serial PRIMARY KEY,
      "teacher_id" varchar(40) NOT NULL UNIQUE,
      "full_name" text NOT NULL,
      "email" varchar(180),
      "phone" varchar(30),
      "designation" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  /* ── v2.8.34.0 LMS setup bridge ──────────────────────────────────────
     Staff master data (lms_teachers) now exists INDEPENDENT of accounts:
     the office/seeds create rows from the staff register with account_id
     NULL; when a teacher registers, the bridge claims the row instead of
     duplicating it. DROP NOT NULL is idempotent in Postgres. */
  await db.execute(sql`
    ALTER TABLE "lms_teachers" ALTER COLUMN "account_id" DROP NOT NULL
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_enrollments_unique"
      ON "lms_enrollments" ("student_id", "class_id")
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_class_subjects_unique"
      ON "lms_class_subjects" ("class_id", "subject_id")
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_parent_children_unique"
      ON "lms_parent_children" ("parent_id", "student_id")
  `);
  /* ── v2.8.43.0 assignment attachments ─────────────────────────────────
     Multi-file support for the classroom loop: teachers attach PDFs /
     videos / sheets to their work, students answer with images, documents
     and everything else. Bytes live in media_blobs through the shared
     storage layer; these tables hold the metadata + authorization anchors.
     link_url is the "Drive / YouTube / mailto" escape hatch for types that
     are better handed over as a link. */
  await db.execute(sql`
    ALTER TABLE "lms_assignments" ADD COLUMN IF NOT EXISTS "link_url" text
  `);
  await db.execute(sql`
    ALTER TABLE "lms_submissions" ADD COLUMN IF NOT EXISTS "link_url" text
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_assignment_files" (
      "id" serial PRIMARY KEY,
      "assignment_id" integer NOT NULL,
      "object_key" text NOT NULL UNIQUE,
      "file_name" text NOT NULL,
      "mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
      "size_bytes" integer DEFAULT 0 NOT NULL,
      "uploaded_by_account_id" integer,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_submission_files" (
      "id" serial PRIMARY KEY,
      "submission_id" integer NOT NULL,
      "assignment_id" integer NOT NULL,
      "student_id" integer NOT NULL,
      "object_key" text NOT NULL UNIQUE,
      "file_name" text NOT NULL,
      "mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
      "size_bytes" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "lms_assignment_files_assignment_idx"
      ON "lms_assignment_files" ("assignment_id")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "lms_submission_files_assignment_student_idx"
      ON "lms_submission_files" ("assignment_id", "student_id")
  `);
  /* ── v2.8.50.0 Phase 2.1 — assignment Q&A ("Ask the teacher") ─────────
     One private thread per (assignment, student). author_role flips
     'student'/'teacher'; readers/writers enforce that only that student
     and the class's teachers ever touch the rows. Plain text, tiny rows. */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_assignment_questions" (
      "id" serial PRIMARY KEY,
      "assignment_id" integer NOT NULL,
      "student_id" integer NOT NULL,
      "author_role" varchar(10) NOT NULL,
      "author_account_id" integer,
      "body" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "lms_assignment_questions_thread_idx"
      ON "lms_assignment_questions" ("assignment_id", "student_id")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "lms_assignment_questions_assignment_idx"
      ON "lms_assignment_questions" ("assignment_id")
  `);
  /* ── v2.8.51.0 — chat polish on the Q&A threads ─────────────────────────
     read_at  = the moment the message's RECIPIENT first loaded the thread
                (drives the ✓✓ tick + every unread badge);
     deleted_at = WhatsApp-style soft delete by the AUTHOR (body withheld
                from every reader, the UI shows the deleted stub). */
  await db.execute(sql`
    ALTER TABLE "lms_assignment_questions"
      ADD COLUMN IF NOT EXISTS "read_at" timestamp
  `);
  await db.execute(sql`
    ALTER TABLE "lms_assignment_questions"
      ADD COLUMN IF NOT EXISTS "deleted_at" timestamp
  `);
  /* ── v2.8.52.0 — WhatsApp delivered tick ─────────────────────────────────
     delivered_at = the moment the message reached the RECIPIENT'S app (their
     chat hub fetched its thread list) — one step before read_at (opened). */
  await db.execute(sql`
    ALTER TABLE "lms_assignment_questions"
      ADD COLUMN IF NOT EXISTS "delivered_at" timestamp
  `);
  /* ── v2.8.53.0 — chat file attachments (the owner: "files attach karanna
     bari eka witharai") ─────────────────────────────────────────────────
     ONE optional file per message, stored through the SAME provider-neutral
     storage layer as every other LMS file. object_key is the storage key;
     the bytes are served ONLY through the permission-checked
     /api/portal/chat/file/[messageId] route. author soft-delete clears
     these columns AND the blob, so deleted chats reclaim storage. */
  await db.execute(sql`
    ALTER TABLE "lms_assignment_questions"
      ADD COLUMN IF NOT EXISTS "object_key" text
  `);
  await db.execute(sql`
    ALTER TABLE "lms_assignment_questions"
      ADD COLUMN IF NOT EXISTS "file_name" text
  `);
  await db.execute(sql`
    ALTER TABLE "lms_assignment_questions"
      ADD COLUMN IF NOT EXISTS "mime_type" text
  `);
  await db.execute(sql`
    ALTER TABLE "lms_assignment_questions"
      ADD COLUMN IF NOT EXISTS "size_bytes" integer
  `);
  /* ── v2.8.59.0 — profile photos on the office registers ───────────────
     The photo hangs on the REGISTER row (the source of truth), so it
     exists before the person ever makes an account and follows every
     admission-no join (roster wall, portal profile). photo_key is the
     storage key; photo_url the display URL served through the
     session-gated /api/portal/person-photo route. */
  await db.execute(sql`
    ALTER TABLE "lms_student_records"
      ADD COLUMN IF NOT EXISTS "photo_key" text
  `);
  await db.execute(sql`
    ALTER TABLE "lms_student_records"
      ADD COLUMN IF NOT EXISTS "photo_url" text
  `);
  await db.execute(sql`
    ALTER TABLE "lms_teacher_records"
      ADD COLUMN IF NOT EXISTS "photo_key" text
  `);
  await db.execute(sql`
    ALTER TABLE "lms_teacher_records"
      ADD COLUMN IF NOT EXISTS "photo_url" text
  `);
  /* ── v2.8.59.0 — notice attachments (links, images, PDFs) ──────────────
     link_url mirrors the assignments/materials escape hatch; notice files
     ride the SAME provider-neutral storage pipeline (lms-notice/ prefix),
     served only through the audience-checked notices file route. */
  await db.execute(sql`
    ALTER TABLE "lms_notices" ADD COLUMN IF NOT EXISTS "link_url" text
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_notice_files" (
      "id" serial PRIMARY KEY,
      "notice_id" integer NOT NULL,
      "object_key" text NOT NULL UNIQUE,
      "file_name" text NOT NULL,
      "mime_type" text DEFAULT 'application/octet-stream' NOT NULL,
      "size_bytes" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "lms_notice_files_notice_idx" ON "lms_notice_files" ("notice_id")`,
  );

  /* ── v2.8.62.0 — DIGITAL TERMINAL REPORT CARD ─────────────────────────
     One sheet per student per year; marks grid + per-term remarks.
     Summary rows are computed at read time from the class's PUBLISHED
     sheets, so only the two leaf tables + the card header are stored. */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_report_cards" (
      "id" serial PRIMARY KEY,
      "student_id" integer NOT NULL,
      "class_id" integer NOT NULL,
      "year" varchar(9) NOT NULL,
      "grade" varchar(10) NOT NULL,
      "status" varchar(10) DEFAULT 'draft' NOT NULL,
      "created_by_account_id" integer,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "lms_report_cards_unique" ON "lms_report_cards" ("student_id", "year")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "lms_report_cards_class_idx" ON "lms_report_cards" ("class_id", "year")`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_report_marks" (
      "id" serial PRIMARY KEY,
      "card_id" integer NOT NULL,
      "subject" text NOT NULL,
      "position" integer DEFAULT 0 NOT NULL,
      "m1" integer,
      "m2" integer,
      "m3" integer
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "lms_report_marks_unique" ON "lms_report_marks" ("card_id", "subject")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "lms_report_marks_card_idx" ON "lms_report_marks" ("card_id")`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_report_terms" (
      "id" serial PRIMARY KEY,
      "card_id" integer NOT NULL,
      "term" integer NOT NULL,
      "studies" text DEFAULT '' NOT NULL,
      "conduct" text DEFAULT '' NOT NULL,
      "attendance" varchar(30) DEFAULT '' NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "lms_report_terms_unique" ON "lms_report_terms" ("card_id", "term")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "lms_report_terms_card_idx" ON "lms_report_terms" ("card_id")`,
  );

  /* ── v2.8.63.0 — PRINCIPAL CERTIFICATION (owner-approved policy) ────────
     A sheet becomes visible to students & parents ONLY after the Principal
     certifies it. Lifecycle: draft → submitted → certified (a return goes
     back to draft with the Principal's note). The pre-63 "published" state
     folds into "certified" so legacy sheets keep their visibility. */
  await db.execute(
    sql`ALTER TABLE "lms_report_cards" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp`,
  );
  await db.execute(
    sql`ALTER TABLE "lms_report_cards" ADD COLUMN IF NOT EXISTS "certified_at" timestamp`,
  );
  await db.execute(
    sql`ALTER TABLE "lms_report_cards" ADD COLUMN IF NOT EXISTS "certified_by_account_id" integer`,
  );
  await db.execute(
    sql`ALTER TABLE "lms_report_cards" ADD COLUMN IF NOT EXISTS "certified_by_name" varchar(120)`,
  );
  await db.execute(
    sql`ALTER TABLE "lms_report_cards" ADD COLUMN IF NOT EXISTS "principal_note" text`,
  );
  await db.execute(
    sql`ALTER TABLE "lms_report_cards" ADD COLUMN IF NOT EXISTS "returned_at" timestamp`,
  );
  await db.execute(sql`
    UPDATE "lms_report_cards" SET "status" = 'certified' WHERE "status" = 'published'
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_signatures" (
      "id" serial PRIMARY KEY,
      "account_id" integer NOT NULL,
      "kind" varchar(10) NOT NULL,
      "mime" varchar(40) DEFAULT 'image/png' NOT NULL,
      "data" text NOT NULL,
      "bytes" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "lms_signatures_account_kind_unique"
      ON "lms_signatures" ("account_id", "kind")
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "lms_report_card_events" (
      "id" serial PRIMARY KEY,
      "card_id" integer NOT NULL,
      "actor_account_id" integer NOT NULL,
      "action" varchar(20) NOT NULL,
      "note" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "lms_report_card_events_card_idx" ON "lms_report_card_events" ("card_id")`,
  );
}

export function ensureSchemaExtras() {
  if (!ready) {
    ready = run().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
