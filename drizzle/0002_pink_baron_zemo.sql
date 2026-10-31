CREATE TABLE "cadet_intro_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"unit_slug" varchar(80) NOT NULL,
	"enabled" varchar(10) DEFAULT '' NOT NULL,
	"hold_ms" integer,
	"logo_src" text DEFAULT '' NOT NULL,
	"logo_scale" integer DEFAULT 100 NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cadet_intro_overrides_unit_slug_unique" UNIQUE("unit_slug")
);
--> statement-breakpoint
CREATE TABLE "live_streams" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"platform" varchar(20) DEFAULT 'youtube' NOT NULL,
	"url" text NOT NULL,
	"embed_url" text,
	"banner_url" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live_mode" boolean DEFAULT false NOT NULL,
	"scheduled_at" timestamp,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popups" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"kind" varchar(20) DEFAULT 'message' NOT NULL,
	"banner_url" text,
	"link_url" text,
	"link_label" varchar(60),
	"enabled" boolean DEFAULT true NOT NULL,
	"frequency" varchar(20) DEFAULT 'session' NOT NULL,
	"delay_ms" integer DEFAULT 1500 NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "avatar" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "image_scale" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "extra_images" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "videos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "photo_scale" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_gallery_items" ADD COLUMN "zoom" integer DEFAULT 100 NOT NULL;