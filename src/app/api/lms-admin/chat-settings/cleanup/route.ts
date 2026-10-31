import { NextResponse } from "next/server";
import { adminAuditLogs } from "@/db/schema";
import { db } from "@/db";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { runChatRetentionNow, wipeAllChats } from "@/lib/chat-retention";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.1 — "Clean up now": runs the retention sweep immediately and
 * reports what it removed. Audited.
 *
 * v2.8.76.2 — the root fix for "it shows a count but the chat isn't
 * cleaned": the sweep used to run with the LAST SAVED durations while the
 * panel let the admin pick new ones and press the button without saving.
 * The body now carries the durations ON SCREEN — they are persisted first
 * and the sweep runs with exactly those, so the button always does what
 * the screen says. Response adds the used settings + what still remains
 * past the cutoff (the per-run cap can leave more).
 *
 * v2.8.76.3 — the owner's new contract: `{ scope: "all" }` = the REAL
 * "Clean up now" — EVERY chat message + attachment in the database is
 * deleted right now (a full wipe, durations do not apply). The legacy
 * duration-sweep path is kept for stale clients.
 */
const ALLOWED = [0, 7, 14, 30, 60, 90, 180, 365];

export async function POST(req: Request) {
  const session = await requireLmsAdmin();

  const body = (await req.json().catch(() => null)) as {
    scope?: unknown;
    chatRetentionDays?: unknown;
    fileRetentionDays?: unknown;
  } | null;

  /* v2.8.76.3 — FULL WIPE: "okkoma chat clear". Every message row and
     every attachment blob goes, right now — no cutoff involved. */
  if (body && body.scope === "all") {
    try {
      const result = await wipeAllChats();
      await db.insert(adminAuditLogs).values({
        userId: session.accountId,
        action: "wipe_all_chats",
        entity: "lms_assignment_questions",
        entityId: `deleted:${result.messagesDeleted},files:${result.attachmentsCleared},bytes:${result.bytesReclaimed}`,
      });
      return NextResponse.json({ ok: true, result: { scope: "all" as const, ...result } });
    } catch {
      return NextResponse.json(
        { ok: false, error: "The cleanup run failed — please try again." },
        { status: 500 },
      );
    }
  }

  /* Legacy path — duration sweep (kept for stale clients). Durations
     currently on screen (absent body → sweep with the saved ones). */
  let apply: { chatRetentionDays: number; fileRetentionDays: number; adminAccountId: number } | undefined;
  if (body && body.chatRetentionDays != null && body.fileRetentionDays != null) {
    const chatDays = Number(body.chatRetentionDays);
    const fileDays = Number(body.fileRetentionDays);
    if (!ALLOWED.includes(chatDays) || !ALLOWED.includes(fileDays)) {
      return NextResponse.json(
        { ok: false, error: "Choose Off or one of 7 / 14 / 30 / 60 / 90 / 180 / 365 days." },
        { status: 400 },
      );
    }
    apply = {
      chatRetentionDays: chatDays,
      fileRetentionDays: fileDays,
      adminAccountId: session.accountId,
    };
  }

  try {
    const result = await runChatRetentionNow(apply);
    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: "run_chat_cleanup",
      entity: "lms_chat_settings",
      entityId: `chat:${result.chatRetentionDays}d,file:${result.fileRetentionDays}d,deleted:${result.messagesDeleted},files:${result.attachmentsCleared},remaining:${result.remainingMessages}`,
    });
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json(
      { ok: false, error: "The cleanup run failed — please try again." },
      { status: 500 },
    );
  }
}
