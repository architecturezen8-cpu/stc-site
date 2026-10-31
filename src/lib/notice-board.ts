import "server-only";

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { notices, type Notice } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ── v2.8.85.0 — Public Notice Board ────────────────────────────────────
   One source of truth for every notices query. A notice is PUBLIC when it
   is published AND it has not expired (expiresAt is optional — a notice
   for one event day auto-hides the moment the clock passes it). Pinned
   notices float to the top of every listing, newest first after that. */

/** The where-condition every PUBLIC notices query must carry. */
function liveNoticesCondition() {
  return and(
    eq(notices.published, true),
    or(isNull(notices.expiresAt), gt(notices.expiresAt, new Date())),
  );
}

/** Public ordering — pinned first, then newest published. */
function noticeOrder() {
  return [desc(notices.pinned), desc(notices.publishedAt), desc(notices.id)];
}

/**
 * Published, unexpired notices for the public archive. Drafts and expired
 * notices never appear. `limit` trims the list (homepage strip uses the
 * dedicated helper below).
 */
export async function getPublishedNotices(limit?: number): Promise<Notice[]> {
  await ensureSchemaExtras();
  const base = db
    .select()
    .from(notices)
    .where(liveNoticesCondition())
    .orderBy(...noticeOrder());
  return limit ? base.limit(limit) : base;
}

/** The latest n published notices — the homepage strip's feed. */
export async function getLatestPublishedNotices(n: number): Promise<Notice[]> {
  return getPublishedNotices(n);
}

/** Admin list — everything, drafts and expired included. */
export async function getAllNotices(): Promise<Notice[]> {
  await ensureSchemaExtras();
  return db
    .select()
    .from(notices)
    .orderBy(desc(notices.pinned), desc(notices.updatedAt), desc(notices.id));
}

/* ── CRUD — the thin db layer the admin API routes call ───────────────── */

export type NoticeCreateInput = {
  title: string;
  body: string;
  category?: string;
  image?: string | null;
  pinned?: boolean;
  published?: boolean;
  expiresAt?: Date | null;
  createdBy?: number | null;
};

export async function createNotice(input: NoticeCreateInput): Promise<Notice> {
  const [created] = await db
    .insert(notices)
    .values({
      title: input.title,
      body: input.body,
      category: input.category?.trim() || "General",
      image: input.image ?? null,
      pinned: input.pinned ?? false,
      published: input.published ?? false,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return created;
}

export type NoticeUpdateInput = Partial<Omit<NoticeCreateInput, "createdBy">>;

export async function updateNotice(
  id: number,
  input: NoticeUpdateInput,
): Promise<Notice | undefined> {
  const [updated] = await db
    .update(notices)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(notices.id, id))
    .returning();
  return updated;
}

export async function deleteNotice(id: number): Promise<Notice | undefined> {
  const [removed] = await db
    .delete(notices)
    .where(eq(notices.id, id))
    .returning();
  return removed;
}
