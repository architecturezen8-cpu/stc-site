CREATE TABLE "logo_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"logo_key" varchar(120) NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"group" varchar(40) DEFAULT 'general' NOT NULL,
	"draft_src" text DEFAULT '' NOT NULL,
	"published_src" text DEFAULT '' NOT NULL,
	"draft_scale" integer DEFAULT 100 NOT NULL,
	"published_scale" integer DEFAULT 100 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "logo_assets_logo_key_unique" UNIQUE("logo_key")
);
--> statement-breakpoint
CREATE TABLE "online_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" varchar(80) DEFAULT 'General' NOT NULL,
	"url" text NOT NULL,
	"link_type" varchar(20) DEFAULT 'link' NOT NULL,
	"medium" varchar(20) DEFAULT 'All' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
