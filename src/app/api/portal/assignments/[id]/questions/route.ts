import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { MAX_CHAT_FILE_BYTES } from "@/lib/chat-limits";
import { earlyMultipartQuotaGuard } from "@/lib/portal-upload-guard";
import { maybeRunChatRetentionLazy } from "@/lib/chat-retention";
import {
  answerAssignmentQuestion,
  askAssignmentQuestion,
  getStudentThread,
  getTeacherThread,
  getTeacherThreads,
  type ChatFileUpload,
} from "@/lib/portal-questions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * v2.8.50.0 — Phase 2.1: the private "Ask the teacher" Q&A on ONE assignment.
 *
 * v2.8.51.0 — read receipts + one-thread fetch:
 *   GET  · student  → their OWN thread ({ role:"student", thread }) — and
 *                    loading it MARKS THE TEACHER'S MESSAGES READ.
 *        · teacher + ?studentId=N → that ONE student's thread
 *                    ({ role:"teacher", thread }) — marks the STUDENT'S
 *                    MESSAGES READ (opening a conversation is reading it).
 *        · teacher (no studentId) → every thread of the assignment
 *                    ({ role:"teacher", threads }) — the submissions
 *                    register view; deliberately marks NOTHING read.
 *        · parent / everyone else → 401/403 (privacy contract: student +
 *          that class's teachers only)
 *
 *   POST · student  → { body } asks on their own thread
 *        · teacher  → { studentId, body } answers ONE student's thread
 *
 * Every path is ownership-checked server-side (enrollment for the student,
 * class×subject ownership + roster for the teacher) — see portal-questions.
 *
 * v2.8.52.0 — session resolution honors the island's `x-portal-role` hint:
 * one browser may hold BOTH a student and a teacher session, and the
 * role-agnostic read silently picked the student — the teacher's reply was
 * saved as the student's message and receipts never fired. The hint picks
 * the right cookie; it cannot escalate.
 *
 * v2.8.53.0 — the send path accepts BOTH bodies:
 *   · application/json          — { body } / { studentId, body } (text only,
 *                                 the original contract, unchanged);
 *   · multipart/form-data       — `body` + optional `studentId` + ONE `file`
 *                                 (≤5 MB, extension allow-list — the server
 *                                 derives the MIME from ITS table, never
 *                                 from the client). A file may ride alone
 *                                 with an empty caption (WhatsApp style).
 */
export async function GET(req: Request, ctx: Ctx) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "student" && session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const assignmentId = Number((await ctx.params).id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    /* v2.8.70.1 — the throttled fire-and-forget retention sweep rides
       thread reads too, so old messages/attachments age out on traffic. */
    maybeRunChatRetentionLazy();
    if (session.role === "student") {
      const result = await getStudentThread(session.accountId, assignmentId);
      if (!result.ok) {
        return NextResponse.json(result, { status: 404 });
      }
      return NextResponse.json({ ok: true, role: "student", thread: result.thread });
    }

    /* teacher — one student's thread (mark-read) or the whole register */
    const studentIdParam = new URL(req.url).searchParams.get("studentId");
    if (studentIdParam != null) {
      const studentIdRaw = Number(studentIdParam);
      if (!Number.isInteger(studentIdRaw) || studentIdRaw <= 0) {
        return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
      }
      const result = await getTeacherThread(
        session.accountId,
        assignmentId,
        studentIdRaw,
      );
      if (!result.ok) {
        const status = result.error === "not_found" ? 404 : 400;
        return NextResponse.json(result, { status });
      }
      return NextResponse.json({ ok: true, role: "teacher", thread: result.thread });
    }

    const result = await getTeacherThreads(session.accountId, assignmentId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json({ ok: true, role: "teacher", threads: result.threads });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the questions." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "student" && session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const assignmentId = Number((await ctx.params).id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  /* v2.8.53.0 — multipart (a file may ride along) or the original JSON.
     The guard above already narrowed the role to student|teacher; the
     actor literal captures that narrowed type (the session object's
     DECLARED role is still the full LmsPortalRole union). */
  const actor = {
    role: session.role,
    accountId: session.accountId,
    email: session.email,
  };
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    return POSTMultipart(req, ctx, actor, assignmentId);
  }

  const body = (await req.json().catch(() => null)) as
    | { body?: string; studentId?: number }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    if (session.role === "student") {
      const result = await askAssignmentQuestion({
        accountId: session.accountId,
        assignmentId,
        body: body.body,
      });
      /* not your homework (or gone) → 404, matching the GET path; a bad
         payload stays 400 */
      const status = result.ok
        ? 200
        : result.error === "This homework isn't available." || result.error === "Student record missing."
          ? 404
          : 400;
      return NextResponse.json(result, { status });
    }

    const result = await answerAssignmentQuestion({
      accountId: session.accountId,
      assignmentId,
      studentId: Number(body.studentId),
      body: body.body,
    });
    /* not your assignment → 404 (no existence leak), matching the GET path */
    const status = result.ok ? 200 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the message." },
      { status: 500 },
    );
  }
}

/**
 * v2.8.53.0 — the multipart send: `body` caption + optional `studentId`
 * (teacher) + ONE optional `file`. v2.8.68.4 — the quota guard answers
 * from the Content-Length header BEFORE the body is buffered (the old
 * claim below was aspirational: formData() always read every byte first),
 * and the 5 MB chat cap is still re-checked after the parse.
 */
async function POSTMultipart(
  req: Request,
  ctx: Ctx,
  session: { role: "student" | "teacher"; accountId: number; email?: string },
  assignmentId: number,
) {
  /* v2.8.68.4 — the chat quota gate used to live inside
     askAssignmentQuestion, AFTER formData() had buffered the whole
     message + attachment — the sender watched the progress bar finish
     and only then saw "storage is full". This early guard reads the
     Content-Length header instead and refuses within the first second. */
  const early = await earlyMultipartQuotaGuard(req, session);
  if (early) return early;

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const body = String(form.get("body") ?? "");
  const studentIdRaw = form.get("studentId");
  const fileEntry = form.get("file");

  let file: ChatFileUpload | null = null;
  if (fileEntry && typeof fileEntry !== "string") {
    const f = fileEntry as File;
    if (f.size > MAX_CHAT_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Chat files are limited to 5 MB." },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(await f.arrayBuffer());
    if (bytes.length > MAX_CHAT_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Chat files are limited to 5 MB." },
        { status: 400 },
      );
    }
    file = { name: f.name, bytes };
  }

  try {
    if (session.role === "student") {
      const result = await askAssignmentQuestion({
        accountId: session.accountId,
        assignmentId,
        body,
        file,
      });
      const status = result.ok
        ? 200
        : result.error === "This homework isn't available." || result.error === "Student record missing."
          ? 404
          : 400;
      return NextResponse.json(result, { status });
    }

    const result = await answerAssignmentQuestion({
      accountId: session.accountId,
      assignmentId,
      studentId: Number(studentIdRaw),
      body,
      file,
    });
    const status = result.ok ? 200 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the message." },
      { status: 500 },
    );
  }
}
