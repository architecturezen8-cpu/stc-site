import "server-only";

import { and, count, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsBroadcastReads,
  lmsBroadcasts,
  type LmsPortalRole,
} from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ── v2.8.70.0 — SCHOOL BROADCASTS ───────────────────────────────────────
   The school-wide notification system the owner asked for (item 1): until
   now the portal only had CLASS notices, so nobody could tell the whole
   school "the site will be down for maintenance tonight". The MAIN admin
   and the LMS admin both post here; the audience switch picks who sees it
   (everyone / teachers / students / parents); the read side keeps one row
   per (broadcast, account) so portals can filter All / Unread / Read. */

export const BROADCAST_KINDS = [
  "general",
  "maintenance",
  "event",
  "urgent",
] as const;
export type BroadcastKind = (typeof BROADCAST_KINDS)[number];

export const BROADCAST_AUDIENCES = [
  "all",
  "teachers",
  "students",
  "parents",
] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

/** Who each audience reaches. Staff = teachers + principal. */
export const AUDIENCE_ROLES: Record<BroadcastAudience, readonly LmsPortalRole[]> = {
  all: ["student", "teacher", "parent", "principal"],
  teachers: ["teacher", "principal"],
  students: ["student"],
  parents: ["parent"],
};

export type BroadcastView = {
  id: number;
  title: string;
  body: string;
  kind: string;
  audience: string;
  authorVia: string;
  authorName: string | null;
  linkUrl: string | null;
  createdAt: string;
  readAt: string | null;
  /* v2.8.89.0 — scheduled auto-publish (ISO or null; future = office-only). */
  scheduledAt: string | null;
};

export function isBroadcastKind(v: unknown): v is BroadcastKind {
  return typeof v === "string" && (BROADCAST_KINDS as readonly string[]).includes(v);
}

export function isBroadcastAudience(v: unknown): v is BroadcastAudience {
  return typeof v === "string" && (BROADCAST_AUDIENCES as readonly string[]).includes(v);
}

export type CreateBroadcastInput = {
  title: string;
  body: string;
  kind: BroadcastKind;
  audience: BroadcastAudience;
  authorVia: "site_admin" | "lms_admin";
  authorId: number | null;
  authorName: string | null;
  linkUrl?: string | null;
  /* v2.8.89.0 — full ISO instant or null (the composer converts the Sri
     Lanka wall-time input before sending). */
  scheduledAt?: string | null;
};

/** v2.8.89.0 — live = no schedule OR the scheduled moment has arrived. */
function liveBroadcastCondition() {
  return or(
    isNull(lmsBroadcasts.scheduledAt),
    lte(lmsBroadcasts.scheduledAt, new Date()),
  );
}

export async function createBroadcast(input: CreateBroadcastInput) {
  await ensureSchemaExtras();
  const [row] = await db
    .insert(lmsBroadcasts)
    .values({
      title: input.title,
      body: input.body,
      kind: input.kind,
      audience: input.audience,
      authorVia: input.authorVia,
      authorId: input.authorId,
      authorName: input.authorName,
      linkUrl: input.linkUrl?.trim() ? input.linkUrl.trim() : null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    })
    .returning({ id: lmsBroadcasts.id, createdAt: lmsBroadcasts.createdAt });
  return row;
}

/**
 * The list one portal account sees, with its per-row read stamp and the
 * unread total. `filter` powers the owner's All / Unread / Read tabs.
 * Expired broadcasts silently drop out of the list.
 */
export async function getBroadcastsFor(
  accountId: number,
  role: LmsPortalRole,
  filter: "all" | "unread" | "read" = "all",
): Promise<{ items: BroadcastView[]; unread: number }> {
  await ensureSchemaExtras();

  const audiences = (Object.keys(AUDIENCE_ROLES) as BroadcastAudience[]).filter(
    (a) => AUDIENCE_ROLES[a].includes(role),
  );

  const rows = await db
    .select({
      id: lmsBroadcasts.id,
      title: lmsBroadcasts.title,
      body: lmsBroadcasts.body,
      kind: lmsBroadcasts.kind,
      audience: lmsBroadcasts.audience,
      authorVia: lmsBroadcasts.authorVia,
      authorName: lmsBroadcasts.authorName,
      linkUrl: lmsBroadcasts.linkUrl,
      createdAt: lmsBroadcasts.createdAt,
      scheduledAt: lmsBroadcasts.scheduledAt,
      readAt: lmsBroadcastReads.readAt,
    })
    .from(lmsBroadcasts)
    .leftJoin(
      lmsBroadcastReads,
      and(
        eq(lmsBroadcastReads.broadcastId, lmsBroadcasts.id),
        eq(lmsBroadcastReads.accountId, accountId),
      ),
    )
    .where(
      and(
        inArray(lmsBroadcasts.audience, audiences),
        or(isNull(lmsBroadcasts.expiresAt), gt(lmsBroadcasts.expiresAt, new Date())),
        /* v2.8.89.0 — a scheduled broadcast reaches portals only at its
           go-live moment (the sent list keeps it office-visible). */
        liveBroadcastCondition(),
        filter === "unread"
          ? isNull(lmsBroadcastReads.id)
          : filter === "read"
            ? sql`${lmsBroadcastReads.id} is not null`
            : undefined,
      ),
    )
    .orderBy(desc(lmsBroadcasts.createdAt))
    .limit(100);

  const items: BroadcastView[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    kind: r.kind,
    audience: r.audience,
    authorVia: r.authorVia,
    authorName: r.authorName,
    linkUrl: r.linkUrl,
    createdAt: r.createdAt.toISOString(),
    readAt: r.readAt ? r.readAt.toISOString() : null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
  }));

  const unread = items.filter((i) => !i.readAt).length;
  return { items, unread };
}

/** Cheap COUNT for the dashboard nav badge. */
export async function getBroadcastUnreadCount(
  accountId: number,
  role: LmsPortalRole,
): Promise<number> {
  await ensureSchemaExtras();
  const audiences = (Object.keys(AUDIENCE_ROLES) as BroadcastAudience[]).filter(
    (a) => AUDIENCE_ROLES[a].includes(role),
  );
  const [row] = await db
    .select({ n: count() })
    .from(lmsBroadcasts)
    .leftJoin(
      lmsBroadcastReads,
      and(
        eq(lmsBroadcastReads.broadcastId, lmsBroadcasts.id),
        eq(lmsBroadcastReads.accountId, accountId),
      ),
    )
    .where(
      and(
        inArray(lmsBroadcasts.audience, audiences),
        or(isNull(lmsBroadcasts.expiresAt), gt(lmsBroadcasts.expiresAt, new Date())),
        /* v2.8.89.0 — a pending schedule must not ring the unread badge. */
        liveBroadcastCondition(),
        isNull(lmsBroadcastReads.id),
      ),
    );
  return row?.n ?? 0;
}

/** Mark ONE broadcast read (idempotent — the unique index absorbs doubles). */
export async function markBroadcastRead(
  accountId: number,
  role: LmsPortalRole,
  broadcastId: number,
) {
  await ensureSchemaExtras();
  await db
    .insert(lmsBroadcastReads)
    .values({ broadcastId, accountId, role })
    .onConflictDoNothing();
}

/** "Mark all read" — one insert per unseen broadcast the account can see. */
export async function markAllBroadcastsRead(accountId: number, role: LmsPortalRole) {
  await ensureSchemaExtras();
  const audiences = (Object.keys(AUDIENCE_ROLES) as BroadcastAudience[]).filter(
    (a) => AUDIENCE_ROLES[a].includes(role),
  );
  const visible = await db
    .select({ id: lmsBroadcasts.id })
    .from(lmsBroadcasts)
    .leftJoin(
      lmsBroadcastReads,
      and(
        eq(lmsBroadcastReads.broadcastId, lmsBroadcasts.id),
        eq(lmsBroadcastReads.accountId, accountId),
      ),
    )
    .where(
      and(
        inArray(lmsBroadcasts.audience, audiences),
        or(isNull(lmsBroadcasts.expiresAt), gt(lmsBroadcasts.expiresAt, new Date())),
        /* v2.8.89.0 — never pre-mark a broadcast that has not gone live. */
        liveBroadcastCondition(),
        isNull(lmsBroadcastReads.id),
      ),
    )
    .limit(200);
  if (visible.length === 0) return 0;
  await db
    .insert(lmsBroadcastReads)
    .values(visible.map((v) => ({ broadcastId: v.id, accountId, role })))
    .onConflictDoNothing();
  return visible.length;
}

/* ── Admin (main admin + LMS admin) side ───────────────────────────────── */

export type BroadcastAdminRow = BroadcastView & {
  reads: number;
};

export async function listBroadcastsForAdmin(
  options: { liveOnly?: boolean } = {},
): Promise<BroadcastAdminRow[]> {
  await ensureSchemaExtras();
  const rows = await db
    .select({
      id: lmsBroadcasts.id,
      title: lmsBroadcasts.title,
      body: lmsBroadcasts.body,
      kind: lmsBroadcasts.kind,
      audience: lmsBroadcasts.audience,
      authorVia: lmsBroadcasts.authorVia,
      authorName: lmsBroadcasts.authorName,
      linkUrl: lmsBroadcasts.linkUrl,
      createdAt: lmsBroadcasts.createdAt,
      scheduledAt: lmsBroadcasts.scheduledAt,
      reads: count(lmsBroadcastReads.id),
    })
    .from(lmsBroadcasts)
    .leftJoin(lmsBroadcastReads, eq(lmsBroadcastReads.broadcastId, lmsBroadcasts.id))
    /* v2.8.89.0 — liveOnly: the admin BELL renders this list as "what has
       reached me", so a pending schedule must not ring early; the sent
       list in the composer shows everything (Scheduled chip included). */
    .where(options.liveOnly ? liveBroadcastCondition() : undefined)
    .groupBy(lmsBroadcasts.id)
    .orderBy(desc(lmsBroadcasts.createdAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    kind: r.kind,
    audience: r.audience,
    authorVia: r.authorVia,
    authorName: r.authorName,
    linkUrl: r.linkUrl,
    createdAt: r.createdAt.toISOString(),
    readAt: null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    reads: Number(r.reads ?? 0),
  }));
}

export async function deleteBroadcastAdmin(id: number) {
  await ensureSchemaExtras();
  await db.delete(lmsBroadcastReads).where(eq(lmsBroadcastReads.broadcastId, id));
  await db.delete(lmsBroadcasts).where(eq(lmsBroadcasts.id, id));
}

/* ── v2.8.71.0 — EDIT a posted broadcast (owner item 4: "aya massage ekak
   dammama eka edit karanna option ekak danna. danata delete option eka
   witharane thiyenne") ────────────────────────────────────────────────────
   Full-field update: the composer re-submits everything it knows. Reads
   survive the edit (the audience may change — readers outside the new
   audience simply stop seeing it, their read rows stay harmless). */
export type UpdateBroadcastInput = {
  title: string;
  body: string;
  kind: BroadcastKind;
  audience: BroadcastAudience;
  linkUrl?: string | null;
  /* v2.8.89.0 — full ISO instant or null (undefined = untouched). */
  scheduledAt?: string | null;
};

export async function updateBroadcastAdmin(id: number, input: UpdateBroadcastInput) {
  await ensureSchemaExtras();
  const [row] = await db
    .update(lmsBroadcasts)
    .set({
      title: input.title,
      body: input.body,
      kind: input.kind,
      audience: input.audience,
      linkUrl: input.linkUrl?.trim() ? input.linkUrl.trim() : null,
      ...(input.scheduledAt !== undefined
        ? { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null }
        : {}),
    })
    .where(eq(lmsBroadcasts.id, id))
    .returning({ id: lmsBroadcasts.id });
  return row;
}
