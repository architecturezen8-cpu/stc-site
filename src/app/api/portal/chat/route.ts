import { NextResponse } from "next/server";
import {
  getPortalSessionForRequest,
} from "@/lib/portal-auth";
import {
  studentChatThreads,
  teacherChatThreads,
} from "@/lib/portal-questions";
import { maybeRunChatRetentionLazy } from "@/lib/chat-retention";

export const dynamic = "force-dynamic";

/**
 * v2.8.51.0 — the Chat hub list (the owner's "apita baida ekata wenama
 * chat section ekak"): ONE endpoint that returns every thread the viewer
 * may touch, as summary rows (last message preview + time, unread count,
 * waiting-for-reply flag). The server-side privacy contract is the same
 * as the thread endpoints — a student gets only their own conversations,
 * a teacher only the threads of the class×subjects they teach, and a
 * parent gets 403.
 *
 * v2.8.52.0 — session resolution honors the island's `x-portal-role`
 * hint, so a browser signed in as BOTH roles reads the right cookie.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "student" && session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    /* v2.8.70.1 — fire-and-forget retention sweep (throttled to 1/30min):
       the "auto clear" the owner asked for, powered by the lms-admin's
       day settings. Never blocks this response. */
    maybeRunChatRetentionLazy();
    const threads =
      session.role === "student"
        ? await studentChatThreads(session.accountId)
        : await teacherChatThreads(session.accountId);
    return NextResponse.json({ ok: true, role: session.role, threads });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the conversations." },
      { status: 500 },
    );
  }
}
