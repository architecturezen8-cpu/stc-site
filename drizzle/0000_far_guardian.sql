CREATE TABLE "admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(80) NOT NULL,
	"entity" varchar(80) NOT NULL,
	"entity_id" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(30) DEFAULT 'super_admin' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "admission_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"programme" varchar(20) NOT NULL,
	"student_name" text NOT NULL,
	"dob" varchar(20) NOT NULL,
	"gender" varchar(10) NOT NULL,
	"guardian_name" text NOT NULL,
	"relationship" varchar(30) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"email" text NOT NULL,
	"address" text NOT NULL,
	"current_school" text NOT NULL,
	"current_grade" varchar(20),
	"stream" varchar(40),
	"ol_year" varchar(10),
	"ol_results" text,
	"ol_index" varchar(20),
	"medium" varchar(20) DEFAULT 'Sinhala' NOT NULL,
	"sibling_name" text,
	"father_old_thomian" varchar(10),
	"father_years" varchar(20),
	"house_preference" varchar(20),
	"message" text,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" varchar(30) NOT NULL,
	"department" varchar(80) NOT NULL,
	"visit_date" varchar(20) NOT NULL,
	"visit_time" varchar(20) NOT NULL,
	"purpose" text NOT NULL,
	"visitors" varchar(20) DEFAULT '1' NOT NULL,
	"notes" text,
	"status" varchar(20) DEFAULT 'requested' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"updated_by" integer,
	"published_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cms_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_slug" varchar(80) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"action" varchar(30) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_slug" varchar(80) NOT NULL,
	"section_key" varchar(80) NOT NULL,
	"label" text NOT NULL,
	"section_type" varchar(40) NOT NULL,
	"draft_data" jsonb NOT NULL,
	"published_data" jsonb NOT NULL,
	"draft_hidden" boolean DEFAULT false NOT NULL,
	"published_hidden" boolean DEFAULT false NOT NULL,
	"draft_order" integer DEFAULT 0 NOT NULL,
	"published_order" integer DEFAULT 0 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" varchar(40) NOT NULL,
	"starts_at" timestamp NOT NULL,
	"time_label" varchar(60) NOT NULL,
	"location" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" varchar(40) NOT NULL,
	"image" text NOT NULL,
	"caption" text NOT NULL,
	"year" varchar(10) DEFAULT '2026' NOT NULL,
	"location" text DEFAULT 'Colombo Campus' NOT NULL,
	"aspect" varchar(20) DEFAULT 'landscape' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" varchar(30) NOT NULL,
	"inquiry_type" varchar(50) NOT NULL,
	"grade" varchar(30),
	"message" text NOT NULL,
	"status" varchar(20) DEFAULT 'unread' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"caption" text,
	"folder" varchar(120) DEFAULT 'site-assets' NOT NULL,
	"category" varchar(80) DEFAULT 'Uncategorised' NOT NULL,
	"provider" varchar(20) DEFAULT 'local' NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" varchar(80) NOT NULL,
	"width" integer,
	"height" integer,
	"original_size" integer DEFAULT 0 NOT NULL,
	"dominant_color" varchar(20),
	"blur_data_url" text,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'processing' NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "media_assets_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "media_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" text,
	"field_name" varchar(80),
	"page_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"variant_name" varchar(30) NOT NULL,
	"format" varchar(20) DEFAULT 'webp' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"object_key" text NOT NULL,
	"file_size" integer NOT NULL,
	"public_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_variants_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(180) NOT NULL,
	"title" text NOT NULL,
	"excerpt" text NOT NULL,
	"body" text NOT NULL,
	"category" varchar(40) NOT NULL,
	"image" text NOT NULL,
	"location" text NOT NULL,
	"author" text NOT NULL,
	"read_minutes" integer DEFAULT 4 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published_at" timestamp NOT NULL,
	CONSTRAINT "posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"draft_value" jsonb NOT NULL,
	"published_value" jsonb NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"department" varchar(60) NOT NULL,
	"qualification" text NOT NULL,
	"image" text,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_gallery_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_slug" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"image" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"aspect" varchar(20) DEFAULT 'landscape' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_path" varchar(240) NOT NULL,
	"block_type" varchar(40) NOT NULL,
	"draft_data" jsonb NOT NULL,
	"published_data" jsonb NOT NULL,
	"draft_hidden" boolean DEFAULT false NOT NULL,
	"published_hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_patch_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_path" varchar(240) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_patches" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_path" varchar(240) NOT NULL,
	"selector" text NOT NULL,
	"label" text NOT NULL,
	"element_type" varchar(30) NOT NULL,
	"draft_data" jsonb NOT NULL,
	"published_data" jsonb NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
