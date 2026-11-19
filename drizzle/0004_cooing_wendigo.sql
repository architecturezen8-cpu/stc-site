CREATE TABLE "admin_access_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(160) NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "auth_provider" varchar(20) DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_collections" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;