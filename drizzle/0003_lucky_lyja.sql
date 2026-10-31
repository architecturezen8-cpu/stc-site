CREATE TABLE "old_thomians" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text NOT NULL,
	"field" varchar(60) NOT NULL,
	"image" text NOT NULL,
	"staff_id" integer,
	"is_new" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"stream_slug" varchar(60) NOT NULL,
	"code" varchar(20) NOT NULL,
	"grade" varchar(40) NOT NULL,
	"strength" varchar(40) NOT NULL,
	"class_teacher" text NOT NULL,
	"room" varchar(60) NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_teachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"stream_slug" varchar(60) NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"subject" text NOT NULL,
	"qualification" text NOT NULL,
	"image" text NOT NULL,
	"staff_id" integer,
	"is_new" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_new" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "popups" ADD COLUMN "event_at" timestamp;--> statement-breakpoint
ALTER TABLE "popups" ADD COLUMN "platform" varchar(20);--> statement-breakpoint
ALTER TABLE "popups" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "is_new" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "is_new" boolean DEFAULT false NOT NULL;