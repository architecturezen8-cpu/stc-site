import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsAssignmentFiles,
  lmsAssignmentQuestions,
  lmsMaterialFiles,
  lmsMaterials,
  lmsNoticeFiles,
  lmsNotices,
  lmsPurgeRequests,
  lmsStudents,
  lmsSubmissionFiles,
  lmsPortalAccounts,
} from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ── v2.8.70.3 — STORAGE PURGE CONSENT ───────────────────────────────────
   The owner: "lms-admin storage clear karaddi delete option eka dammama
   adala acc ekata ekkanata massage ekak yanna one; eya eka accept karoth
   witharai lms-admin ta eka delete karanna puluwana." Every purge of
   somebody's file now opens a consent request that lands IN that person's
   portal (notifications panel + My Storage banner); ONLY after they press
   Accept does the purge route actually delete. */

export type PurgeKind = "submission" | "chat" | "assignment" | "material" | "notice";

export type PurgeTarget = {
  ownerAccountId: number;
  ownerRole: string;
  label: string;
  bytes: number;
  /** Present when the row carries the bucket key (used for sanity checks). */
  objectKey: string | null;
};

export function isPurgeKind(v: unknown): v is PurgeKind {
  return (
    v === "submission" || v === "chat" || v === "assignment" || v === "material" || v === "notice"
  );
}

/** Who owns this file, what is it called, how big is it. */
export async function resolvePurgeTarget(
  kind: PurgeKind,
  id: number,
): Promise<PurgeTarget | null> {
  await ensureSchemaExtras();

  if (kind === "submission") {
    const [row] = await db
      .select({
        objectKey: lmsSubmissionFiles.objectKey,
        fileName: lmsSubmissionFiles.fileName,
        sizeBytes: lmsSubmissionFiles.sizeBytes,
        accountId: lmsStudents.accountId,
      })
      .from(lmsSubmissionFiles)
      .leftJoin(lmsStudents, eq(lmsStudents.id, lmsSubmissionFiles.studentId))
      .where(eq(lmsSubmissionFiles.id, id))
      .limit(1);
    if (!row) return null;
    if (!row.accountId) return null;
    return { ownerAccountId: row.accountId, ownerRole: "student", label: row.fileName, bytes: row.sizeBytes, objectKey: row.objectKey };
  }

  if (kind === "chat") {
    const [row] = await db
      .select({
        objectKey: lmsAssignmentQuestions.objectKey,
        fileName: lmsAssignmentQuestions.fileName,
        sizeBytes: lmsAssignmentQuestions.sizeBytes,
        authorAccountId: lmsAssignmentQuestions.authorAccountId,
        studentId: lmsAssignmentQuestions.studentId,
      })
      .from(lmsAssignmentQuestions)
      .where(eq(lmsAssignmentQuestions.id, id))
      .limit(1);
    if (!row) return null;
    let accountId = row.authorAccountId ?? null;
    let role = row.authorAccountId ? "teacher-or-student" : "student";
    if (!accountId) {
      const [stu] = await db
        .select({ accountId: lmsStudents.accountId })
        .from(lmsStudents)
        .where(eq(lmsStudents.id, row.studentId))
        .limit(1);
      accountId = stu?.accountId ?? null;
      role = "student";
    }
    if (!accountId) return null;
    return { ownerAccountId: accountId, ownerRole: role, label: row.fileName ?? "chat attachment", bytes: row.sizeBytes ?? 0, objectKey: row.objectKey };
  }

  if (kind === "assignment") {
    const [row] = await db
      .select({
        objectKey: lmsAssignmentFiles.objectKey,
        fileName: lmsAssignmentFiles.fileName,
        sizeBytes: lmsAssignmentFiles.sizeBytes,
        accountId: lmsAssignmentFiles.uploadedByAccountId,
      })
      .from(lmsAssignmentFiles)
      .where(eq(lmsAssignmentFiles.id, id))
      .limit(1);
    if (!row || !row.accountId) return null;
    return { ownerAccountId: row.accountId, ownerRole: "teacher", label: row.fileName, bytes: row.sizeBytes, objectKey: row.objectKey };
  }

  if (kind === "material") {
    const [row] = await db
      .select({
        objectKey: lmsMaterialFiles.objectKey,
        fileName: lmsMaterialFiles.fileName,
        sizeBytes: lmsMaterialFiles.sizeBytes,
        accountId: lmsMaterials.createdByAccountId,
      })
      .from(lmsMaterialFiles)
      .leftJoin(lmsMaterials, eq(lmsMaterials.id, lmsMaterialFiles.materialId))
      .where(eq(lmsMaterialFiles.id, id))
      .limit(1);
    if (!row || !row.accountId) return null;
    return { ownerAccountId: row.accountId, ownerRole: "teacher", label: row.fileName, bytes: row.sizeBytes, objectKey: row.objectKey };
  }

  const [row] = await db
    .select({
      objectKey: lmsNoticeFiles.objectKey,
      fileName: lmsNoticeFiles.fileName,
      sizeBytes: lmsNoticeFiles.sizeBytes,
      accountId: lmsNotices.createdByAccountId,
    })
    .from(lmsNoticeFiles)
    .leftJoin(lmsNotices, eq(lmsNotices.id, lmsNoticeFiles.noticeId))
    .where(eq(lmsNoticeFiles.id, id))
    .limit(1);
  if (!row || !row.accountId) return null;
  return { ownerAccountId: row.accountId, ownerRole: "teacher", label: row.fileName, bytes: row.sizeBytes, objectKey: row.objectKey };
}

/** Create (or reuse) the pending consent request for one file. */
export async function createPurgeRequest(input: {
  kind: PurgeKind;
  fileId: number;
  adminId: number;
  adminName: string;
  reason?: string | null;
}): Promise<
  | { ok: true; requestId: number; ownerAccountId: number; ownerName: string; created: boolean }
  | { ok: false; error: string }
> {
  await ensureSchemaExtras();
  const target = await resolvePurgeTarget(input.kind, input.fileId);
  if (!target) return { ok: false, error: "File not found (or its owner has no portal account)." };

  const [owner] = await db
    .select({ fullName: lmsPortalAccounts.fullName })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, target.ownerAccountId))
    .limit(1);

  // An open request for the same file? Reuse it — no spam.
  const [existing] = await db
    .select({ id: lmsPurgeRequests.id })
    .from(lmsPurgeRequests)
    .where(
      and(
        eq(lmsPurgeRequests.accountId, target.ownerAccountId),
        eq(lmsPurgeRequests.status, "pending"),
        sql`${lmsPurgeRequests.items} like ${'%"kind":"' + input.kind + '","fileId":' + input.fileId + '%'}::text`,
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: true,
      requestId: existing.id,
      ownerAccountId: target.ownerAccountId,
      ownerName: owner?.fullName ?? "the owner",
      created: false,
    };
  }

  const items = [
    {
      kind: input.kind,
      fileId: input.fileId,
      label: target.label,
      bytes: target.bytes,
    },
  ];
  const [row] = await db
    .insert(lmsPurgeRequests)
    .values({
      accountId: target.ownerAccountId,
      role: target.ownerRole,
      items: JSON.stringify(items),
      totalBytes: target.bytes,
      reason: input.reason ?? null,
      requestedByAdminId: input.adminId,
      requestedByName: input.adminName,
    })
    .returning({ id: lmsPurgeRequests.id });

  return {
    ok: true,
    requestId: row.id,
    ownerAccountId: target.ownerAccountId,
    ownerName: owner?.fullName ?? "the owner",
    created: true,
  };
}

export type PurgeRequestView = {
  id: number;
  status: string;
  items: { kind: string; fileId: number; label: string; bytes: number }[];
  totalBytes: number;
  reason: string | null;
  requestedByName: string | null;
  createdAt: string;
};

function parseItems(raw: string): PurgeRequestView["items"] {
  try {
    const parsed = JSON.parse(raw) as PurgeRequestView["items"];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The pending requests one portal account must answer. */
export async function listPurgeRequestsFor(
  accountId: number,
): Promise<PurgeRequestView[]> {
  await ensureSchemaExtras();
  const rows = await db
    .select()
    .from(lmsPurgeRequests)
    .where(
      and(
        eq(lmsPurgeRequests.accountId, accountId),
        sql`${lmsPurgeRequests.status} in ('pending', 'declined')`,
      ),
    )
    .orderBy(desc(lmsPurgeRequests.id))
    .limit(20);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    items: parseItems(r.items),
    totalBytes: Number(r.totalBytes ?? 0),
    reason: r.reason,
    requestedByName: r.requestedByName,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** The owner presses Accept or Decline. */
export async function respondPurgeRequest(
  requestId: number,
  accountId: number,
  accept: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({ id: lmsPurgeRequests.id, status: lmsPurgeRequests.status })
    .from(lmsPurgeRequests)
    .where(and(eq(lmsPurgeRequests.id, requestId), eq(lmsPurgeRequests.accountId, accountId)))
    .limit(1);
  if (!row) return { ok: false, error: "Request not found." };
  if (row.status !== "pending") return { ok: false, error: "This request was already answered." };
  await db
    .update(lmsPurgeRequests)
    .set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
    .where(eq(lmsPurgeRequests.id, requestId));
  return { ok: true };
}

/** The purge route's gate: an ACCEPTED request covering this exact file. */
export async function findAcceptedRequestFor(
  kind: PurgeKind,
  fileId: number,
): Promise<number | null> {
  await ensureSchemaExtras();
  const rows = await db
    .select({ id: lmsPurgeRequests.id, items: lmsPurgeRequests.items })
    .from(lmsPurgeRequests)
    .where(and(eq(lmsPurgeRequests.status, "accepted"), sql`${lmsPurgeRequests.items} like ${'%"kind":"' + kind + '","fileId":' + fileId + '%'}::text`))
    .orderBy(desc(lmsPurgeRequests.id))
    .limit(5);
  for (const row of rows) {
    const items = parseItems(row.items);
    if (items.some((i) => i.kind === kind && Number(i.fileId) === fileId)) return row.id;
  }
  return null;
}

/** Is there still an open (pending) request for this file? */
export async function findPendingRequestFor(
  kind: PurgeKind,
  fileId: number,
): Promise<number | null> {
  await ensureSchemaExtras();
  const rows = await db
    .select({ id: lmsPurgeRequests.id, items: lmsPurgeRequests.items })
    .from(lmsPurgeRequests)
    .where(and(eq(lmsPurgeRequests.status, "pending"), sql`${lmsPurgeRequests.items} like ${'%"kind":"' + kind + '","fileId":' + fileId + '%'}::text`))
    .orderBy(desc(lmsPurgeRequests.id))
    .limit(5);
  for (const row of rows) {
    const items = parseItems(row.items);
    if (items.some((i) => i.kind === kind && Number(i.fileId) === fileId)) return row.id;
  }
  return null;
}

/** The owner said NO — the admin must not be able to re-ask. */
export async function findDeclinedRequestFor(
  kind: PurgeKind,
  fileId: number,
): Promise<number | null> {
  await ensureSchemaExtras();
  const rows = await db
    .select({ id: lmsPurgeRequests.id, items: lmsPurgeRequests.items })
    .from(lmsPurgeRequests)
    .where(and(eq(lmsPurgeRequests.status, "declined"), sql`${lmsPurgeRequests.items} like ${'%"kind":"' + kind + '","fileId":' + fileId + '%'}::text`))
    .orderBy(desc(lmsPurgeRequests.id))
    .limit(5);
  for (const row of rows) {
    const items = parseItems(row.items);
    if (items.some((i) => i.kind === kind && Number(i.fileId) === fileId)) return row.id;
  }
  return null;
}

/** After a successful purge, close its request. */
export async function completePurgeRequest(requestId: number): Promise<void> {
  await ensureSchemaExtras();
  await db
    .update(lmsPurgeRequests)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(lmsPurgeRequests.id, requestId));
}
