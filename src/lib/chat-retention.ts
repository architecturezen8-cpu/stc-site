import "server-only";

import { and, count, eq, inArray, isNotNull, lt, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { lmsAssignmentQuestions, lmsChatSettings } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getStorage } from "@/lib/storage";

/* ── v2.8.70.1 — CHAT RETENTION (auto-clear) ─────────────────────────────
   The owner: "chat eka week eken auto clear option eka damuda… database
   eka aparade" + "file auto delete system ekatath duration eka choose
   karanna". The LMS admin picks how many days chat messages and chat
   attachments may live; a sweep deletes everything older. The sweep runs
   (a) lazily — throttled to at most once per 30 minutes, triggered by
   chat traffic — and (b) on demand from the studio's "Clean up now". */

export const RETENTION_CHOICES = [0, 7, 14, 30, 60, 90, 180, 365] as const;

export type ChatRetention = {
  chatRetentionDays: number;
  fileRetentionDays: number;
  lastChatCleanupAt: string | null;
  lastFileCleanupAt: string | null;
};

export async function getChatRetention(): Promise<ChatRetention> {
  await ensureSchemaExtras();
  const [row] = await db
    .select()
    .from(lmsChatSettings)
    .where(eq(lmsChatSettings.id, 1))
    .limit(1);
  if (!row) {
    return {
      chatRetentionDays: 0,
      fileRetentionDays: 0,
      lastChatCleanupAt: null,
      lastFileCleanupAt: null,
    };
  }
  return {
    chatRetentionDays: row.chatRetentionDays,
    fileRetentionDays: row.fileRetentionDays,
    lastChatCleanupAt: row.lastChatCleanupAt ? row.lastChatCleanupAt.toISOString() : null,
    lastFileCleanupAt: row.lastFileCleanupAt ? row.lastFileCleanupAt.toISOString() : null,
  };
}

export async function saveChatRetention(input: {
  chatRetentionDays: number;
  fileRetentionDays: number;
  adminAccountId: number;
}): Promise<void> {
  await ensureSchemaExtras();
  const chat = RETENTION_CHOICES.includes(input.chatRetentionDays as (typeof RETENTION_CHOICES)[number])
    ? input.chatRetentionDays
    : 0;
  const file = RETENTION_CHOICES.includes(input.fileRetentionDays as (typeof RETENTION_CHOICES)[number])
    ? input.fileRetentionDays
    : 0;
  await db
    .insert(lmsChatSettings)
    .values({
      id: 1,
      chatRetentionDays: chat,
      fileRetentionDays: file,
      updatedByAccountId: input.adminAccountId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: lmsChatSettings.id,
      set: {
        chatRetentionDays: chat,
        fileRetentionDays: file,
        updatedByAccountId: input.adminAccountId,
        updatedAt: new Date(),
      },
    });
}

export type RetentionStats = {
  /** The day-counts the numbers below were measured against. */
  chatRetentionDays: number;
  fileRetentionDays: number;
  /** Messages the chat sweep would remove right now (cutoff applied). */
  messagesOlderThan: number;
  /** Attachments the file sweep would clear right now. */
  attachmentsOlderThan: number;
  bytesOlderThan: number;
  /** v2.8.76.2 — the cutoff instants (ISO) behind the counts; null when off. */
  chatCutoffAt: string | null;
  fileCutoffAt: string | null;
};

/** Accept a day-choice from the wire; fall back to the saved value when invalid. */
function pickChoice(value: unknown, fallback: number): number {
  const n = Number(value);
  return RETENTION_CHOICES.includes(n as (typeof RETENTION_CHOICES)[number]) ? n : fallback;
}

/**
 * v2.8.76.2 — `overrides` lets the preview count against the durations the
 * admin has PICKED in the panel (not just the saved ones), so the numbers
 * always track what the screen shows.
 */
export async function getRetentionStats(overrides?: {
  chatDays?: unknown;
  fileDays?: unknown;
}): Promise<RetentionStats> {
  await ensureSchemaExtras();
  const settings = await getChatRetention();
  const chatRetentionDays = pickChoice(overrides?.chatDays, settings.chatRetentionDays);
  const fileRetentionDays = pickChoice(overrides?.fileDays, settings.fileRetentionDays);
  const now = Date.now();

  let messagesOlderThan = 0;
  let chatCutoffAt: string | null = null;
  if (chatRetentionDays > 0) {
    const cutoff = new Date(now - chatRetentionDays * 86_400_000);
    chatCutoffAt = cutoff.toISOString();
    const [row] = await db
      .select({ n: count() })
      .from(lmsAssignmentQuestions)
      .where(lt(lmsAssignmentQuestions.createdAt, cutoff));
    messagesOlderThan = Number(row?.n ?? 0);
  }

  let attachmentsOlderThan = 0;
  let bytesOlderThan = 0;
  let fileCutoffAt: string | null = null;
  if (fileRetentionDays > 0) {
    const cutoff = new Date(now - fileRetentionDays * 86_400_000);
    fileCutoffAt = cutoff.toISOString();
    const [row] = await db
      .select({ n: count(), bytes: sum(lmsAssignmentQuestions.sizeBytes) })
      .from(lmsAssignmentQuestions)
      .where(
        and(
          isNotNull(lmsAssignmentQuestions.objectKey),
          lt(lmsAssignmentQuestions.createdAt, cutoff),
        ),
      );
    attachmentsOlderThan = Number(row?.n ?? 0);
    bytesOlderThan = Number(row?.bytes ?? 0);
  }

  return {
    chatRetentionDays,
    fileRetentionDays,
    messagesOlderThan,
    attachmentsOlderThan,
    bytesOlderThan,
    chatCutoffAt,
    fileCutoffAt,
  };
}

export type RetentionRunResult = {
  messagesDeleted: number;
  attachmentsCleared: number;
  bytesReclaimed: number;
  /** v2.8.76.2 — the settings the sweep actually ran with. */
  chatRetentionDays: number;
  fileRetentionDays: number;
  /** What STILL exceeds the cutoff after this pass (the per-run cap can leave more). */
  remainingMessages: number;
  remainingAttachments: number;
};

/** Per-run safety cap so one sweep can never become a huge transaction. */
const SWEEP_CAP = 400;

async function deleteObject(objectKey: string): Promise<void> {
  await getStorage()
    .deleteObject(objectKey)
    .catch(() => undefined);
}

/**
 * The actual sweep — used by both the lazy trigger and "Clean up now".
 *
 * v2.8.76.2 — `apply` ("Clean up now" only) persists the durations the admin
 * has on screen BEFORE sweeping, so the run always matches what the panel
 * shows — no more "I picked 7 days but it swept with the old saved 0".
 */
export async function runChatRetentionNow(apply?: {
  chatRetentionDays: number;
  fileRetentionDays: number;
  adminAccountId: number;
}): Promise<RetentionRunResult> {
  await ensureSchemaExtras();
  if (apply) {
    await saveChatRetention(apply);
  }
  const settings = await getChatRetention();
  const now = Date.now();
  let messagesDeleted = 0;
  let attachmentsCleared = 0;
  let bytesReclaimed = 0;

  // 1) FILE retention — clear attachments older than the file cutoff.
  if (settings.fileRetentionDays > 0) {
    const cutoff = new Date(now - settings.fileRetentionDays * 86_400_000);
    const rows = await db
      .select({
        id: lmsAssignmentQuestions.id,
        objectKey: lmsAssignmentQuestions.objectKey,
        sizeBytes: lmsAssignmentQuestions.sizeBytes,
      })
      .from(lmsAssignmentQuestions)
      .where(
        and(
          isNotNull(lmsAssignmentQuestions.objectKey),
          lt(lmsAssignmentQuestions.createdAt, cutoff),
        ),
      )
      .limit(SWEEP_CAP);
    for (const row of rows) {
      if (row.objectKey) await deleteObject(row.objectKey);
      await db
        .update(lmsAssignmentQuestions)
        .set({ objectKey: null, fileName: null, mimeType: null, sizeBytes: null })
        .where(eq(lmsAssignmentQuestions.id, row.id));
      attachmentsCleared += 1;
      bytesReclaimed += row.sizeBytes ?? 0;
    }
  }

  // 2) CHAT retention — delete whole messages older than the chat cutoff
  //    (their attachments ride along to the bucket).
  if (settings.chatRetentionDays > 0) {
    const cutoff = new Date(now - settings.chatRetentionDays * 86_400_000);
    const rows = await db
      .select({
        id: lmsAssignmentQuestions.id,
        objectKey: lmsAssignmentQuestions.objectKey,
        sizeBytes: lmsAssignmentQuestions.sizeBytes,
      })
      .from(lmsAssignmentQuestions)
      .where(lt(lmsAssignmentQuestions.createdAt, cutoff))
      .limit(SWEEP_CAP);
    if (rows.length > 0) {
      for (const row of rows) {
        if (row.objectKey) {
          await deleteObject(row.objectKey);
          bytesReclaimed += row.sizeBytes ?? 0;
        }
      }
      await db.delete(lmsAssignmentQuestions).where(
        sql`${lmsAssignmentQuestions.id} in (${sql.join(
          rows.map((r) => sql`${r.id}`),
          sql`, `,
        )})`,
      );
      messagesDeleted = rows.length;
    }
  }

  await db
    .insert(lmsChatSettings)
    .values({ id: 1, chatRetentionDays: settings.chatRetentionDays, fileRetentionDays: settings.fileRetentionDays })
    .onConflictDoUpdate({
      target: lmsChatSettings.id,
      set: {
        ...(messagesDeleted > 0 ? { lastChatCleanupAt: new Date() } : {}),
        ...(attachmentsCleared > 0 ? { lastFileCleanupAt: new Date() } : {}),
        updatedAt: new Date(),
      },
    });

  /* v2.8.76.2 — what still exceeds the cutoff after this pass, so the
     panel can say "press again to continue" instead of looking broken. */
  let remainingMessages = 0;
  if (settings.chatRetentionDays > 0) {
    const cutoff = new Date(now - settings.chatRetentionDays * 86_400_000);
    const [row] = await db
      .select({ n: count() })
      .from(lmsAssignmentQuestions)
      .where(lt(lmsAssignmentQuestions.createdAt, cutoff));
    remainingMessages = Number(row?.n ?? 0);
  }
  let remainingAttachments = 0;
  if (settings.fileRetentionDays > 0) {
    const cutoff = new Date(now - settings.fileRetentionDays * 86_400_000);
    const [row] = await db
      .select({ n: count() })
      .from(lmsAssignmentQuestions)
      .where(
        and(
          isNotNull(lmsAssignmentQuestions.objectKey),
          lt(lmsAssignmentQuestions.createdAt, cutoff),
        ),
      );
    remainingAttachments = Number(row?.n ?? 0);
  }

  return {
    messagesDeleted,
    attachmentsCleared,
    bytesReclaimed,
    chatRetentionDays: settings.chatRetentionDays,
    fileRetentionDays: settings.fileRetentionDays,
    remainingMessages,
    remainingAttachments,
  };
}

/* ── v2.8.76.3 — LIVE CHAT TRACKING + FULL WIPE ──────────────────────────
   The owner: "danata chat wala kochara messages thiyanawada, ewagen
   storage eke kochara use karanawada wage tracking system ekak" — COUNTS
   ONLY, never content (privacy). And "clean now kiyana eka click karama
   database eke danata thiyana okkoma chat clear wenna one" — so "Clean up
   now" is a FULL wipe of every chat message + attachment in the database,
   while the duration dials keep running the automatic older-than-N sweep. */

export type ChatTotals = {
  /** Distinct (assignment, student) threads with at least one message. */
  totalChats: number;
  /** Every message row still in the database (both sides, incl. soft-deleted). */
  totalMessages: number;
  /** Messages that still carry a file in the storage bucket. */
  totalAttachments: number;
  /** Bytes those attachments occupy in the storage bucket. */
  totalBytes: number;
  lastChatCleanupAt: string | null;
  lastFileCleanupAt: string | null;
};

/** Numbers only — this exists so the admin can VERIFY tracking without ever
 *  seeing a word of student/teacher content. */
export async function getChatTotals(): Promise<ChatTotals> {
  await ensureSchemaExtras();
  const [row] = await db
    .select({
      chats: sql<string | number>`count(distinct (${lmsAssignmentQuestions.assignmentId}, ${lmsAssignmentQuestions.studentId}))`,
      messages: count(),
      attachments: sum(
        sql`case when ${lmsAssignmentQuestions.objectKey} is null then 0 else 1 end`,
      ),
      bytes: sum(lmsAssignmentQuestions.sizeBytes),
    })
    .from(lmsAssignmentQuestions);
  const settings = await getChatRetention();
  return {
    totalChats: Number(row?.chats ?? 0),
    totalMessages: Number(row?.messages ?? 0),
    totalAttachments: Number(row?.attachments ?? 0),
    totalBytes: Number(row?.bytes ?? 0),
    lastChatCleanupAt: settings.lastChatCleanupAt,
    lastFileCleanupAt: settings.lastFileCleanupAt,
  };
}

export type ChatWipeResult = {
  messagesDeleted: number;
  attachmentsCleared: number;
  bytesReclaimed: number;
};

/** Batches per pass so one click never builds a giant transaction. */
const WIPE_BATCH = 400;

/**
 * The FULL wipe behind "Clean up now": EVERY chat message in the database
 * goes, together with every attachment blob in the bucket. The duration
 * dials do NOT apply here — this is the owner's "okkoma chat clear" button.
 */
export async function wipeAllChats(): Promise<ChatWipeResult> {
  await ensureSchemaExtras();
  let messagesDeleted = 0;
  let attachmentsCleared = 0;
  let bytesReclaimed = 0;

  // 1) Attachment-bearing messages first, batch by batch: blob → bucket,
  //    then the row itself. Loop until no attachment rows remain.
  for (;;) {
    const rows = await db
      .select({
        id: lmsAssignmentQuestions.id,
        objectKey: lmsAssignmentQuestions.objectKey,
        sizeBytes: lmsAssignmentQuestions.sizeBytes,
      })
      .from(lmsAssignmentQuestions)
      .where(isNotNull(lmsAssignmentQuestions.objectKey))
      .limit(WIPE_BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      if (row.objectKey) {
        await deleteObject(row.objectKey);
        bytesReclaimed += row.sizeBytes ?? 0;
        attachmentsCleared += 1;
      }
    }
    await db.delete(lmsAssignmentQuestions).where(
      inArray(
        lmsAssignmentQuestions.id,
        rows.map((r) => r.id),
      ),
    );
    messagesDeleted += rows.length;
  }

  // 2) Whatever is left (text-only messages) in a single statement.
  const [rest] = await db.select({ n: count() }).from(lmsAssignmentQuestions);
  const restCount = Number(rest?.n ?? 0);
  if (restCount > 0) {
    await db.delete(lmsAssignmentQuestions);
    messagesDeleted += restCount;
  }

  // 3) Stamp both cleanup clocks — a full wipe cleans files AND messages.
  await db
    .insert(lmsChatSettings)
    .values({ id: 1 })
    .onConflictDoUpdate({
      target: lmsChatSettings.id,
      set: {
        lastChatCleanupAt: new Date(),
        lastFileCleanupAt: new Date(),
        updatedAt: new Date(),
      },
    });

  return { messagesDeleted, attachmentsCleared, bytesReclaimed };
}

/* ── Lazy trigger: at most one sweep attempt per 30 minutes ────────────── */
const LAZY_INTERVAL_MS = 30 * 60 * 1000;
const lazyState = globalThis as typeof globalThis & {
  __chatRetentionLastRun?: number;
  __chatRetentionInFlight?: Promise<void> | null;
};

/**
 * Fire-and-forget sweep used by the chat endpoints — never awaits, never
 * throws. Keeps the DB from filling up without a cron service.
 *
 * v2.8.76.4 — `force` bypasses the 30-minute throttle: the settings PUT
 * uses it so a freshly saved duration applies at once instead of waiting
 * for a possibly-just-ran throttle window.
 */
export function maybeRunChatRetentionLazy(force = false): void {
  const now = Date.now();
  if (
    lazyState.__chatRetentionInFlight ||
    (!force &&
      lazyState.__chatRetentionLastRun &&
      now - lazyState.__chatRetentionLastRun < LAZY_INTERVAL_MS)
  ) {
    return;
  }
  lazyState.__chatRetentionLastRun = now;
  lazyState.__chatRetentionInFlight = (async () => {
    try {
      const settings = await getChatRetention();
      if (settings.chatRetentionDays === 0 && settings.fileRetentionDays === 0) return;
      await runChatRetentionNow();
    } catch {
      /* retention must never break a chat request */
    } finally {
      lazyState.__chatRetentionInFlight = null;
    }
  })();
}
