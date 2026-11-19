/* 0005_media_blobs — v2.8.41.0 database storage driver (see src/lib/storage/database.ts) */
CREATE TABLE IF NOT EXISTS "media_blobs" (
	"key" text PRIMARY KEY,
	"bytes" bytea NOT NULL,
	"content_type" varchar(80) DEFAULT 'application/octet-stream' NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
