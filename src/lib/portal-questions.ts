import "server-only";

import { randomBytes } from "node:crypto";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { MAX_CHAT_FILE_BYTES as MAX_CHAT_FILE_BYTES_LIMIT, MAX_CHAT_TEXT_LENGTH } from "@/lib/chat-limits";
import { ALLOWED_FILE_EXTS, extensionFor, mimeForExtension } from "@/lib/file-types";
import { getStorage } from "@/lib/storage";
import {
  lmsAssignmentQuestions,
  lmsAssignments,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsPortalAccounts,
  lmsStudents,
  lmsSubjects,
  lmsTeachers,
} from "@/db/schema-lms";

/**
 * PHASE 2.1 (v2.8.50.0) — Assignment Q&A: the private "Ask the teacher"
 * thread on ONE assignment for ONE student.
 *
 * PHASE 2.1-b (v2.8.51.0) — chat polish, the owner's round:
 *   · READ RECEIPTS — read_at records the moment a message's RECIPIENT
 *     first loads its thread (student thread loads mark the teacher's
 *     messages read, an opened teacher thread marks the student's). This
 *     drives the ✓✓ tick and every unread badge.
 *   · SOFT DELETE — the author can delete their own message (WhatsApp
 *     style): deleted_at is set, every reader gets an empty body and the
 *     UI shows the "message deleted" stub.
 *   · CHAT HUB — every thread the viewer may touch as one summary row
 *     (last message preview, time, unread count, waiting-for-reply flag)
 *     so nobody has to walk into the assignment to discover a message.
 *
 * Privacy contract (enforced HERE, never on the client):
 *   · a thread is the (assignment_id, student_id) pair;
 *   · the STUDENT side only ever reads/writes its OWN thread, and only for
 *     work set for a class the student is actively enrolled in;
 *   · the TEACHER side only ever reads/writes threads of assignments whose
 *     class×subject they teach, and only replies into the threads of
 *     students actively enrolled in that class;
 *   · nobody else (other students, other teachers, parents) gets anything.
 *
 * A thread "needs a reply" while its last NON-DELETED message came from
 * the student.
 *
 * v2.8.53.0 — FILE ATTACHMENTS (the owner: "files attach karanna bari eka
 * witharai"): ONE optional file per message (WhatsApp style — the text is
 * the caption), stored through the SAME provider-neutral storage layer as
 * every LMS file and served ONLY through the permission-checked
 * /api/portal/chat/file/[messageId] route. The 5 MB cap keeps the free
 * tier safe (the bytes share the 500 MB region database with everything
 * else); deleting a message deletes its blob too, so storage is reclaimed.
 */

export const MAX_QUESTION_LENGTH = MAX_CHAT_TEXT_LENGTH;
/** Chat files ride the same storage as submissions — but tighter: 5 MB. */
export const MAX_CHAT_FILE_BYTES = MAX_CHAT_FILE_BYTES_LIMIT;

/** The attachment a CLIENT sees — never the storage key (that stays server-side). */
export type ChatAttachment = {
  name: string;
  mime: string;
  size: number;
};

/**
 * v2.8.53.0 — the file a client hands to the send path. The bytes ride the
 * request body (multipart); the key/name/mime/size come back from OUR
 * validators, never from the client.
 */
export type ChatFileUpload = {
  name: unknown;
  bytes: Buffer;
};

type StoredChatFile = { key: string; name: string; mime: string; size: number };

type FileVerdict = { ok: true; stored: StoredChatFile } | { ok: false; error: string };

/**
 * Validate + store ONE chat attachment under the lms-chat/ prefix through
 * the SAME provider-neutral storage layer every LMS file rides. The MIME
 * always comes from OUR extension table (a client-declared content-type is
 * never trusted), the key carries no user input at all.
 */
async function storeChatFile(file: ChatFileUpload): Promise<FileVerdict> {
  const original = typeof file?.name === "string" ? file.name.trim().slice(0, 120) : "";
  if (!original) return { ok: false, error: "The file has no name." };
  const ext = extensionFor(original);
  if (!ext || !ALLOWED_FILE_EXTS.has(ext)) {
    return { ok: false, error: "That file type isn't allowed in chat." };
  }
  if (!Buffer.isBuffer(file.bytes) || file.bytes.length === 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (file.bytes.length > MAX_CHAT_FILE_BYTES_LIMIT) {
    return { ok: false, error: "Chat files are limited to 5 MB." };
  }
  const key = `lms-chat/${Date.now().toString(36)}-${randomBytes(12).toString("hex")}`;
  const mime = mimeForExtension(ext) ?? "application/octet-stream";
  try {
    await getStorage().putObject({
      key,
      body: file.bytes,
      contentType: mime,
      cacheControl: "private, max-age=31536000",
    });
  } catch {
    return { ok: false, error: "Could not store the file. Try again." };
  }
  return { ok: true, stored: { key, name: original, mime, size: file.bytes.length } };
}

/** Drop a just-stored blob when its message row failed to save. */
async function discardChatFile(stored: StoredChatFile | null): Promise<void> {
  if (!stored) return;
  await getStorage().deleteObject(stored.key).catch(() => undefined);
}

export type QuestionMessage = {
  id: number;
  /** 'student' asked · 'teacher' answered */
  authorRole: "student" | "teacher";
  /** Display name — the student themselves, or the teacher's portal name. */
  authorName: string;
  /** Empty string for soft-deleted messages — the body is withheld. */
  body: string;
  /** "24 Oct · 5:00 PM" (Asia/Colombo) — formatted server-side. */
  atLabel: string;
  /** v2.8.51.0 — WhatsApp-style soft delete by the author. */
  deleted: boolean;
  /** v2.8.51.0 — the message's RECIPIENT has read it (drives ✓✓). */
  read: boolean;
  /**
   * v2.8.52.0 — the message reached the recipient's app (their chat hub
   * fetched it): drives the ✓✓-gray "delivered" step between sent and seen.
   */
  delivered: boolean;
  /** v2.8.53.0 — the optional file (the text is its caption). */
  attachment: ChatAttachment | null;
};

export type StudentThreadView = {
  messages: QuestionMessage[];
};

export type TeacherThreadView = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  /** true while the last non-deleted message is still the student's. */
  needsReply: boolean;
  messages: QuestionMessage[];
};

export type QuestionMutation = { ok: true } | { ok: false; error: string };

/* ── CHAT HUB (v2.8.51.0) ──────────────────────────────────────────────── */

/**
 * One summary row per thread the viewer may touch. The client island adds
 * the filters (unread / needs-reply / search); the server guarantees the
 * rows can only ever be the viewer's OWN conversations.
 */
export type ChatThreadSummary = {
  assignmentId: number;
  assignmentTitle: string;
  subject: string;
  className: string;
  /** teacher side only — whose thread this is */
  studentId?: number;
  studentName?: string;
  admissionNo?: string;
  /** non-deleted messages in the thread */
  messageCount: number;
  /** messages the viewer has NOT read yet (the other side wrote them) */
  unread: number;
  /** last non-deleted message is the student's — waiting on the teacher */
  needsReply: boolean;
  lastAuthorRole: "student" | "teacher" | null;
  /** short preview of the last message ("" when the thread is empty) */
  lastBody: string;
  lastAtLabel: string;
  /** raw instant for the client's newest-first sort */
  lastAt: string | null;
};

/* ── small shared formatters (mirror portal-assignments.ts) ───────────── */

function colomboStamp(date: Date | null): string {
  if (!date) return "";
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${day} · ${time}`;
}

function cleanBody(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_QUESTION_LENGTH) : "";
}

/** One-line preview for the hub rows — newlines collapse, ≤90 chars. */
function preview(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 90);
}

/** v2.8.53.0 — a file-only message previews as its paperclip + name. */
function rowPreview(body: string, fileName: string | null): string {
  const text = preview(body);
  if (text) return text;
  return fileName ? `📎 ${fileName.slice(0, 60)}` : "";
}

/* ── ownership helpers ─────────────────────────────────────────────────── */

/** The assignment IF it belongs to a class×subject this teacher teaches. */
async function ownedAssignmentForTeacher(teacherId: number, assignmentId: number) {
  const [row] = await db
    .select({
      id: lmsAssignments.id,
      classSubjectId: lmsAssignments.classSubjectId,
      classId: lmsClassSubjects.classId,
    })
    .from(lmsAssignments)
    .innerJoin(lmsClassSubjects, eq(lmsAssignments.classSubjectId, lmsClassSubjects.id))
    .where(
      and(
        eq(lmsAssignments.id, assignmentId),
        eq(lmsClassSubjects.teacherId, teacherId),
        eq(lmsAssignments.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The assignment IF the student is actively enrolled in its class. */
async function studentAssignment(studentId: number, assignmentId: number) {
  const [row] = await db
    .select({ id: lmsAssignments.id })
    .from(lmsAssignments)
    .innerJoin(lmsClassSubjects, eq(lmsAssignments.classSubjectId, lmsClassSubjects.id))
    .innerJoin(
      lmsEnrollments,
      and(
        eq(lmsEnrollments.classId, lmsClassSubjects.classId),
        eq(lmsEnrollments.studentId, studentId),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .where(and(eq(lmsAssignments.id, assignmentId), eq(lmsAssignments.isActive, true)))
    .limit(1);
  return row ?? null;
}

/* ── read receipts (v2.8.51.0 + v2.8.52.0 delivered) ─────────────────── */

/** The STUDENT opened the thread → the teacher's messages become read. */
async function markThreadReadByStudent(studentId: number, assignmentId: number) {
  await db
    .update(lmsAssignmentQuestions)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(lmsAssignmentQuestions.assignmentId, assignmentId),
        eq(lmsAssignmentQuestions.studentId, studentId),
        eq(lmsAssignmentQuestions.authorRole, "teacher"),
        isNull(lmsAssignmentQuestions.readAt),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    );
}

/** The TEACHER opened the thread → the student's messages become read. */
async function markThreadReadByTeacher(assignmentId: number, studentId: number) {
  await db
    .update(lmsAssignmentQuestions)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(lmsAssignmentQuestions.assignmentId, assignmentId),
        eq(lmsAssignmentQuestions.studentId, studentId),
        eq(lmsAssignmentQuestions.authorRole, "student"),
        isNull(lmsAssignmentQuestions.readAt),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    );
}

/**
 * v2.8.52.0 — DELIVERED: the viewer's chat hub fetched its thread list, so
 * every message the OTHER side wrote has reached their app. Marks the given
 * rows (already privacy-filtered — they came from the viewer's own select)
 * delivered in one tiny UPDATE. Read stays strictly "opened the thread".
 */
async function markMessagesDelivered(
  ids: number[],
  writtenBy: "student" | "teacher",
) {
  if (ids.length === 0) return;
  await db
    .update(lmsAssignmentQuestions)
    .set({ deliveredAt: sql`now()` })
    .where(
      and(
        inArray(lmsAssignmentQuestions.id, ids),
        eq(lmsAssignmentQuestions.authorRole, writtenBy),
        isNull(lmsAssignmentQuestions.deliveredAt),
      ),
    );
}

/* ── message loading (one query, grouped in memory) ────────────────────── */

/**
 * Every message of one assignment, grouped by thread student. Student names
 * come from the thread owner; teacher names from the writing account.
 * Soft-deleted rows keep their place but lose their body AND their file
 * (the columns are cleared on delete — the blob was deleted with them).
 */
async function loadMessagesByStudent(assignmentId: number) {
  const rows = await db
    .select({
      id: lmsAssignmentQuestions.id,
      studentId: lmsAssignmentQuestions.studentId,
      authorRole: lmsAssignmentQuestions.authorRole,
      authorAccountId: lmsAssignmentQuestions.authorAccountId,
      body: lmsAssignmentQuestions.body,
      createdAt: lmsAssignmentQuestions.createdAt,
      readAt: lmsAssignmentQuestions.readAt,
      deliveredAt: lmsAssignmentQuestions.deliveredAt,
      deletedAt: lmsAssignmentQuestions.deletedAt,
      objectKey: lmsAssignmentQuestions.objectKey,
      fileName: lmsAssignmentQuestions.fileName,
      mimeType: lmsAssignmentQuestions.mimeType,
      sizeBytes: lmsAssignmentQuestions.sizeBytes,
      studentName: lmsStudents.fullName,
      authorName: lmsPortalAccounts.fullName,
    })
    .from(lmsAssignmentQuestions)
    .innerJoin(
      lmsStudents,
      eq(lmsStudents.id, lmsAssignmentQuestions.studentId),
    )
    .leftJoin(
      lmsPortalAccounts,
      eq(lmsPortalAccounts.id, lmsAssignmentQuestions.authorAccountId),
    )
    .where(eq(lmsAssignmentQuestions.assignmentId, assignmentId))
    .orderBy(asc(lmsAssignmentQuestions.id));

  const byStudent = new Map<number, QuestionMessage[]>();
  for (const r of rows) {
    const deleted = r.deletedAt != null;
    const list = byStudent.get(r.studentId) ?? [];
    list.push({
      id: r.id,
      authorRole: r.authorRole === "teacher" ? "teacher" : "student",
      authorName:
        r.authorRole === "teacher"
          ? r.authorName ?? "Teacher"
          : r.studentName,
      body: deleted ? "" : r.body,
      atLabel: colomboStamp(r.createdAt),
      deleted,
      read: r.readAt != null,
      delivered: r.deliveredAt != null || r.readAt != null,
      attachment:
        !deleted && r.objectKey && r.fileName
          ? {
              name: r.fileName,
              mime: r.mimeType ?? "application/octet-stream",
              size: r.sizeBytes ?? 0,
            }
          : null,
    });
    byStudent.set(r.studentId, list);
  }
  return byStudent;
}

/** "Needs a reply" = the last NON-deleted message came from the student. */
function threadNeedsReply(messages: QuestionMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].deleted) return messages[i].authorRole === "student";
  }
  return false;
}

/* ── STUDENT side ──────────────────────────────────────────────────────── */

/**
 * The student's own thread on one assignment (ownership-checked). Loading
 * it marks the teacher's messages read — reading the page IS reading the
 * thread.
 */
export async function getStudentThread(
  accountId: number,
  assignmentId: number,
): Promise<{ ok: true; thread: StudentThreadView } | { ok: false; error: string }> {
  const student = (await ensureLmsPerson("student", accountId)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!student) return { ok: false, error: "Student record missing." };

  const assignment = await studentAssignment(student.id, assignmentId);
  if (!assignment) {
    return { ok: false, error: "This homework isn't available." };
  }

  await markThreadReadByStudent(student.id, assignmentId);
  const byStudent = await loadMessagesByStudent(assignmentId);
  return {
    ok: true,
    thread: { messages: byStudent.get(student.id) ?? [] },
  };
}

/**
 * Student asks (or follows up) on their OWN thread. v2.8.53.0 — the caption
 * may be empty when a file rides along (WhatsApp style); with no file the
 * two-character text rule stands unchanged.
 */
export async function askAssignmentQuestion(input: {
  accountId: number;
  assignmentId: number;
  body: unknown;
  file?: ChatFileUpload | null;
}): Promise<QuestionMutation> {
  const body = cleanBody(input.body);
  if (body.length < 2 && !input.file) {
    return { ok: false, error: "Write your question first." };
  }

  const student = (await ensureLmsPerson("student", input.accountId)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!student) return { ok: false, error: "Student record missing." };

  const assignment = await studentAssignment(student.id, input.assignmentId);
  if (!assignment) {
    return { ok: false, error: "This homework isn't available." };
  }

  let stored: StoredChatFile | null = null;
  if (input.file) {
    const verdict = await storeChatFile(input.file);
    if (!verdict.ok) return { ok: false, error: verdict.error };
    stored = verdict.stored;
  }

  try {
    await db.insert(lmsAssignmentQuestions).values({
      assignmentId: input.assignmentId,
      studentId: student.id,
      authorRole: "student",
      authorAccountId: input.accountId,
      body,
      ...(stored
        ? {
            objectKey: stored.key,
            fileName: stored.name,
            mimeType: stored.mime,
            sizeBytes: stored.size,
          }
        : {}),
    });
  } catch (cause) {
    await discardChatFile(stored);
    throw cause;
  }
  return { ok: true };
}

/* ── TEACHER side ──────────────────────────────────────────────────────── */

/**
 * All threads of one assignment (NO ownership check here — the caller must
 * have established the teacher owns the assignment's class×subject first).
 * Deliberately does NOT mark anything read: opening the submissions
 * register is not the same as opening a conversation.
 */
export async function loadTeacherThreads(
  assignmentId: number,
): Promise<TeacherThreadView[]> {
  const byStudent = await loadMessagesByStudent(assignmentId);
  if (byStudent.size === 0) return [];

  const studentRows = await db
    .select({
      id: lmsStudents.id,
      admissionNo: lmsStudents.admissionNo,
      fullName: lmsStudents.fullName,
    })
    .from(lmsStudents)
    .where(inArray(lmsStudents.id, [...byStudent.keys()]));
  const byId = new Map(studentRows.map((s) => [s.id, s]));

  const threads: TeacherThreadView[] = [];
  for (const [studentId, messages] of byStudent) {
    const info = byId.get(studentId);
    if (!info) continue;
    threads.push({
      studentId,
      admissionNo: info.admissionNo,
      fullName: info.fullName,
      needsReply: threadNeedsReply(messages),
      messages,
    });
  }
  return threads;
}

/** All threads of one assignment — TEACHER, ownership checked. */
export async function getTeacherThreads(
  accountId: number,
  assignmentId: number,
): Promise<{ ok: true; threads: TeacherThreadView[] } | { ok: false; error: string }> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return { ok: false, error: "Teacher record missing." };

  const assignment = await ownedAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) return { ok: false, error: "not_found" };

  return { ok: true, threads: await loadTeacherThreads(assignmentId) };
}

/**
 * v2.8.51.0 — ONE student's thread, fetched by its teacher: marks the
 * student's messages read (opening a conversation IS reading it) and
 * returns the fresh thread. Ownership + roster, same contract as always.
 */
export async function getTeacherThread(
  accountId: number,
  assignmentId: number,
  studentId: number,
): Promise<{ ok: true; thread: TeacherThreadView } | { ok: false; error: string }> {
  if (!Number.isInteger(studentId) || studentId <= 0) {
    return { ok: false, error: "bad_request" };
  }

  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return { ok: false, error: "Teacher record missing." };

  const assignment = await ownedAssignmentForTeacher(teacher.id, assignmentId);
  if (!assignment) return { ok: false, error: "not_found" };

  /* Roster guard — same rule as the reply path. */
  const [enrolled] = await db
    .select({ id: lmsEnrollments.id })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.classId, assignment.classId),
        eq(lmsEnrollments.studentId, studentId),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .limit(1);
  if (!enrolled) return { ok: false, error: "That student is not in this class." };

  await markThreadReadByTeacher(assignmentId, studentId);
  const byStudent = await loadMessagesByStudent(assignmentId);
  const messages = byStudent.get(studentId) ?? [];

  const [studentRow] = await db
    .select({
      admissionNo: lmsStudents.admissionNo,
      fullName: lmsStudents.fullName,
    })
    .from(lmsStudents)
    .where(eq(lmsStudents.id, studentId))
    .limit(1);
  if (!studentRow) return { ok: false, error: "not_found" };

  return {
    ok: true,
    thread: {
      studentId,
      admissionNo: studentRow.admissionNo,
      fullName: studentRow.fullName,
      needsReply: threadNeedsReply(messages),
      messages,
    },
  };
}

/**
 * Teacher answers ONE student's thread (ownership + roster checked).
 * v2.8.53.0 — the reply may carry ONE file (worksheet, marking scheme…);
 * the caption may be empty when it does.
 */
export async function answerAssignmentQuestion(input: {
  accountId: number;
  assignmentId: number;
  studentId: number;
  body: unknown;
  file?: ChatFileUpload | null;
}): Promise<QuestionMutation> {
  const body = cleanBody(input.body);
  if (body.length < 2 && !input.file) {
    return { ok: false, error: "Write the reply first." };
  }
  if (!Number.isInteger(input.studentId) || input.studentId <= 0) {
    return { ok: false, error: "bad_request" };
  }

  const teacher = (await ensureLmsPerson("teacher", input.accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return { ok: false, error: "Teacher record missing." };

  const assignment = await ownedAssignmentForTeacher(teacher.id, input.assignmentId);
  if (!assignment) return { ok: false, error: "not_found" };

  /* Roster guard: the reply may only land in a thread of a student who is
     actively enrolled in THIS assignment's class. */
  const [enrolled] = await db
    .select({ id: lmsEnrollments.id })
    .from(lmsEnrollments)
    .where(
      and(
        eq(lmsEnrollments.classId, assignment.classId),
        eq(lmsEnrollments.studentId, input.studentId),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .limit(1);
  if (!enrolled) {
    return { ok: false, error: "That student is not in this class." };
  }

  let stored: StoredChatFile | null = null;
  if (input.file) {
    const verdict = await storeChatFile(input.file);
    if (!verdict.ok) return { ok: false, error: verdict.error };
    stored = verdict.stored;
  }

  try {
    await db.insert(lmsAssignmentQuestions).values({
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      authorRole: "teacher",
      authorAccountId: input.accountId,
      body,
      ...(stored
        ? {
            objectKey: stored.key,
            fileName: stored.name,
            mimeType: stored.mime,
            sizeBytes: stored.size,
          }
        : {}),
    });
  } catch (cause) {
    await discardChatFile(stored);
    throw cause;
  }
  return { ok: true };
}

/* ── soft delete (v2.8.51.0 — WhatsApp style) ──────────────────────────── */

/**
 * The AUTHOR deletes their OWN message. The row stays (thread order is
 * preserved) but the body is withheld from every reader — the UI shows the
 * "message deleted" stub. Only the writing account can do this, so a
 * student can never touch a teacher's message and vice-versa.
 */
export async function deleteOwnQuestion(input: {
  accountId: number;
  assignmentId: number;
  messageId: number;
}): Promise<QuestionMutation> {
  if (!Number.isInteger(input.messageId) || input.messageId <= 0) {
    return { ok: false, error: "bad_request" };
  }
  /* v2.8.53.0 — read the file reference first so the blob can be reclaimed
     with the row's columns cleared in the same stroke (the "message
     deleted" stub must never leave a way back to the bytes). */
  const [row] = await db
    .select({ objectKey: lmsAssignmentQuestions.objectKey })
    .from(lmsAssignmentQuestions)
    .where(
      and(
        eq(lmsAssignmentQuestions.id, input.messageId),
        eq(lmsAssignmentQuestions.assignmentId, input.assignmentId),
        eq(lmsAssignmentQuestions.authorAccountId, input.accountId),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return { ok: false, error: "not_found" };

  const updated = await db
    .update(lmsAssignmentQuestions)
    .set({
      deletedAt: sql`now()`,
      objectKey: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
    })
    .where(
      and(
        eq(lmsAssignmentQuestions.id, input.messageId),
        eq(lmsAssignmentQuestions.assignmentId, input.assignmentId),
        eq(lmsAssignmentQuestions.authorAccountId, input.accountId),
        isNull(lmsAssignmentQuestions.deletedAt),
      ),
    )
    .returning({ id: lmsAssignmentQuestions.id });
  if (updated.length === 0) return { ok: false, error: "not_found" };

  if (row.objectKey) {
    await getStorage().deleteObject(row.objectKey).catch(() => undefined);
  }
  return { ok: true };
}

/* ── badges ────────────────────────────────────────────────────────────── */

/**
 * Per assignment: how many threads still wait for a teacher reply (the
 * last non-deleted message is the student's). Feeds the teacher-side
 * "unanswered" badge. One tiny query over the assignment ids at hand;
 * grouping in memory.
 */
export async function unansweredCountsByAssignment(
  assignmentIds: number[],
): Promise<Map<number, number>> {
  if (assignmentIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: lmsAssignmentQuestions.id,
      assignmentId: lmsAssignmentQuestions.assignmentId,
      studentId: lmsAssignmentQuestions.studentId,
      authorRole: lmsAssignmentQuestions.authorRole,
      deletedAt: lmsAssignmentQuestions.deletedAt,
    })
    .from(lmsAssignmentQuestions)
    .where(inArray(lmsAssignmentQuestions.assignmentId, assignmentIds))
    .orderBy(asc(lmsAssignmentQuestions.id));

  /* last NON-deleted author per (assignment, student) thread */
  const lastRole = new Map<string, "student" | "teacher">();
  for (const r of rows) {
    if (r.deletedAt != null) continue;
    lastRole.set(
      `${r.assignmentId}:${r.studentId}`,
      r.authorRole === "teacher" ? "teacher" : "student",
    );
  }
  const counts = new Map<number, number>();
  for (const [key, role] of lastRole) {
    if (role !== "student") continue;
    const assignmentId = Number(key.split(":")[0]);
    counts.set(assignmentId, (counts.get(assignmentId) ?? 0) + 1);
  }
  return counts;
}

/* ── CHAT HUB lists (v2.8.51.0) ────────────────────────────────────────── */

type HubRow = {
  /** v2.8.52.0 — row id, used to mark the other side's messages delivered. */
  id: number;
  assignmentId: number;
  title: string;
  subject: string;
  className: string;
  studentId: number;
  admissionNo?: string;
  studentName?: string;
  authorRole: string;
  body: string;
  /** v2.8.53.0 — the optional attachment's name, for the 📎 preview. */
  fileName: string | null;
  createdAt: Date;
  readAt: Date | null;
  deletedAt: Date | null;
};

/**
 * Group raw hub rows → per-thread summaries, newest activity first.
 * unread = messages written by the OTHER side that the viewer has not
 * opened yet — student counts the teachers' messages, teacher counts the
 * students'.
 */
function summarizeHubRows(
  rows: HubRow[],
  viewerRole: "student" | "teacher",
): ChatThreadSummary[] {
  const groupedByStudent = viewerRole === "teacher";
  const groups = new Map<string, HubRow[]>();
  for (const r of rows) {
    const key = groupedByStudent
      ? `${r.assignmentId}:${r.studentId}`
      : `${r.assignmentId}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const summaries: ChatThreadSummary[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    const alive = list.filter((r) => r.deletedAt == null);
    const last = list[list.length - 1];
    const lastAlive = alive[alive.length - 1] ?? null;
    /* unread = the OTHER side wrote it and I haven't opened the thread since */
    const otherRole = viewerRole === "student" ? "teacher" : "student";
    const unread = alive.filter(
      (r) => r.readAt == null && r.authorRole === otherRole,
    ).length;
    const needsReply = lastAlive != null && lastAlive.authorRole === "student";
    summaries.push({
      assignmentId: first.assignmentId,
      assignmentTitle: first.title,
      subject: first.subject,
      className: first.className,
      ...(groupedByStudent
        ? {
            studentId: first.studentId,
            studentName: first.studentName ?? "",
            admissionNo: first.admissionNo ?? "",
          }
        : {}),
      messageCount: alive.length,
      unread,
      needsReply,
      lastAuthorRole: lastAlive
        ? lastAlive.authorRole === "teacher"
          ? "teacher"
          : "student"
        : null,
      lastBody: lastAlive ? rowPreview(lastAlive.body, lastAlive.fileName) : "",
      lastAtLabel: colomboStamp(lastAlive?.createdAt ?? last.createdAt),
      lastAt: (lastAlive ?? last).createdAt.toISOString(),
    });
  }

  summaries.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
  return summaries;
}

/** Every thread of THIS student, across all active enrollments. */
export async function studentChatThreads(accountId: number): Promise<ChatThreadSummary[]> {
  const student = (await ensureLmsPerson("student", accountId)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!student) return [];

  const rows: HubRow[] = await db
    .select({
      id: lmsAssignmentQuestions.id,
      assignmentId: lmsAssignments.id,
      title: lmsAssignments.title,
      subject: lmsSubjects.name,
      className: lmsClasses.name,
      studentId: lmsAssignmentQuestions.studentId,
      authorRole: lmsAssignmentQuestions.authorRole,
      body: lmsAssignmentQuestions.body,
      fileName: lmsAssignmentQuestions.fileName,
      createdAt: lmsAssignmentQuestions.createdAt,
      readAt: lmsAssignmentQuestions.readAt,
      deletedAt: lmsAssignmentQuestions.deletedAt,
    })
    .from(lmsAssignmentQuestions)
    .innerJoin(
      lmsAssignments,
      and(
        eq(lmsAssignments.id, lmsAssignmentQuestions.assignmentId),
        eq(lmsAssignments.isActive, true),
      ),
    )
    .innerJoin(lmsClassSubjects, eq(lmsClassSubjects.id, lmsAssignments.classSubjectId))
    .innerJoin(lmsClasses, eq(lmsClasses.id, lmsClassSubjects.classId))
    .innerJoin(lmsSubjects, eq(lmsSubjects.id, lmsClassSubjects.subjectId))
    .innerJoin(
      lmsEnrollments,
      and(
        eq(lmsEnrollments.classId, lmsClassSubjects.classId),
        eq(lmsEnrollments.studentId, student.id),
        eq(lmsEnrollments.status, "active"),
      ),
    )
    .where(eq(lmsAssignmentQuestions.studentId, student.id))
    .orderBy(asc(lmsAssignmentQuestions.id));

  /* v2.8.52.0 — the hub fetched = the teachers' messages reached this
     student's app (the WhatsApp "delivered" step; read stays "opened"). */
  await markMessagesDelivered(
    rows.filter((r) => r.authorRole === "teacher").map((r) => r.id),
    "teacher",
  );

  return summarizeHubRows(rows, "student");
}

/** Every thread across the assignments this teacher set. */
export async function teacherChatThreads(accountId: number): Promise<ChatThreadSummary[]> {
  const teacher = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!teacher) return [];

  const rows: (HubRow & { studentName: string; admissionNo: string })[] = await db
    .select({
      id: lmsAssignmentQuestions.id,
      assignmentId: lmsAssignments.id,
      title: lmsAssignments.title,
      subject: lmsSubjects.name,
      className: lmsClasses.name,
      studentId: lmsAssignmentQuestions.studentId,
      admissionNo: lmsStudents.admissionNo,
      studentName: lmsStudents.fullName,
      authorRole: lmsAssignmentQuestions.authorRole,
      body: lmsAssignmentQuestions.body,
      fileName: lmsAssignmentQuestions.fileName,
      createdAt: lmsAssignmentQuestions.createdAt,
      readAt: lmsAssignmentQuestions.readAt,
      deletedAt: lmsAssignmentQuestions.deletedAt,
    })
    .from(lmsAssignmentQuestions)
    .innerJoin(
      lmsAssignments,
      and(
        eq(lmsAssignments.id, lmsAssignmentQuestions.assignmentId),
        eq(lmsAssignments.isActive, true),
      ),
    )
    .innerJoin(lmsClassSubjects, eq(lmsClassSubjects.id, lmsAssignments.classSubjectId))
    .innerJoin(lmsClasses, eq(lmsClasses.id, lmsClassSubjects.classId))
    .innerJoin(lmsSubjects, eq(lmsSubjects.id, lmsClassSubjects.subjectId))
    .innerJoin(lmsStudents, eq(lmsStudents.id, lmsAssignmentQuestions.studentId))
    .where(eq(lmsClassSubjects.teacherId, teacher.id))
    .orderBy(asc(lmsAssignmentQuestions.id));

  /* v2.8.52.0 — the hub fetched = the students' questions reached this
     teacher's app (the WhatsApp "delivered" step; read stays "opened"). */
  await markMessagesDelivered(
    rows.filter((r) => r.authorRole === "student").map((r) => r.id),
    "student",
  );

  return summarizeHubRows(rows, "teacher");
}

/**
 * The nav "Chat" badge — how many messages the viewer has not read yet.
 * Students count the teachers' unread replies; teachers count the
 * students' unread questions. Tiny counts, tiny queries; any failure
 * or miss returns 0 so a nav never breaks over a badge.
 */
export async function chatUnreadBadge(
  role: "student" | "teacher",
  accountId: number,
): Promise<number> {
  try {
    if (role === "student") {
      const student = (await ensureLmsPerson("student", accountId)) as
        | typeof lmsStudents.$inferSelect
        | null;
      if (!student) return 0;
      const [row] = await db
        .select({ total: count() })
        .from(lmsAssignmentQuestions)
        .innerJoin(
          lmsAssignments,
          and(
            eq(lmsAssignments.id, lmsAssignmentQuestions.assignmentId),
            eq(lmsAssignments.isActive, true),
          ),
        )
        .innerJoin(lmsClassSubjects, eq(lmsClassSubjects.id, lmsAssignments.classSubjectId))
        .innerJoin(
          lmsEnrollments,
          and(
            eq(lmsEnrollments.classId, lmsClassSubjects.classId),
            eq(lmsEnrollments.studentId, student.id),
            eq(lmsEnrollments.status, "active"),
          ),
        )
        .where(
          and(
            eq(lmsAssignmentQuestions.studentId, student.id),
            eq(lmsAssignmentQuestions.authorRole, "teacher"),
            isNull(lmsAssignmentQuestions.readAt),
            isNull(lmsAssignmentQuestions.deletedAt),
          ),
        );
      return Number(row?.total ?? 0);
    }

    const teacher = (await ensureLmsPerson("teacher", accountId)) as
      | typeof lmsTeachers.$inferSelect
      | null;
    if (!teacher) return 0;
    const [row] = await db
      .select({ total: count() })
      .from(lmsAssignmentQuestions)
      .innerJoin(
        lmsAssignments,
        and(
          eq(lmsAssignments.id, lmsAssignmentQuestions.assignmentId),
          eq(lmsAssignments.isActive, true),
        ),
      )
      .innerJoin(lmsClassSubjects, eq(lmsClassSubjects.id, lmsAssignments.classSubjectId))
      .where(
        and(
          eq(lmsClassSubjects.teacherId, teacher.id),
          eq(lmsAssignmentQuestions.authorRole, "student"),
          isNull(lmsAssignmentQuestions.readAt),
          isNull(lmsAssignmentQuestions.deletedAt),
        ),
      );
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}
