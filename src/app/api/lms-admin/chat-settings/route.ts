import { NextResponse } from "next/server";
import { adminAuditLogs } from "@/db/schema";
import { db } from "@/db";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import {
  getChatTotals,
  getRetentionStats,
  maybeRunChatRetentionLazy,
  saveChatRetention,
} from "@/lib/chat-retention";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.1 — the LMS Admin's chat auto-clear settings.
 * GET  → current day-settings + how much the next sweep would remove.
 * PUT  → { chatRetentionDays, fileRetentionDays } (0 = keep forever;
 *        allowed values: 7 / 14 / 30 / 60 / 90 / 180 / 365).
 *
 * v2.8.76.2 — GET accepts ?chatDays=&fileDays= so the panel's preview
 * counts against the durations the admin has PICKED (not just the saved
 * ones) — the numbers always track what the screen shows.
 *
 * v2.8.76.3 — GET/PUT also return `totals` (live tracking: how many chats,
 * messages, attachments and bytes are in the database RIGHT NOW — counts
 * only, never content). The owner uses this to verify tracking works.
 *
 * v2.8.76.4 — PUT fires the throttled sweep right after saving, so the
 * new durations apply AT ONCE (older-than-N rows go within seconds) —
 * not just on the next chat traffic. Same fire-and-forget, never blocks
 * this response.
 */
export async function GET(req: Request) {
  await requireLmsAdmin();
  try {
    const url = new URL(req.url);
    const [stats, totals] = await Promise.all([
      getRetentionStats({
        chatDays: url.searchParams.get("chatDays") ?? undefined,
        fileDays: url.searchParams.get("fileDays") ?? undefined,
      }),
      getChatTotals(),
    ]);
    return NextResponse.json({ ok: true, stats, totals });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the chat cleanup settings." },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const session = await requireLmsAdmin();

  const body = (await req.json().catch(() => null)) as {
    chatRetentionDays?: unknown;
    fileRetentionDays?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const chatDays = Number(body.chatRetentionDays);
  const fileDays = Number(body.fileRetentionDays);
  const ALLOWED = [0, 7, 14, 30, 60, 90, 180, 365];
  if (!ALLOWED.includes(chatDays) || !ALLOWED.includes(fileDays)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Choose Off or one of 7 / 14 / 30 / 60 / 90 / 180 / 365 days.",
      },
      { status: 400 },
    );
  }

  try {
    await saveChatRetention({
      chatRetentionDays: chatDays,
      fileRetentionDays: fileDays,
      adminAccountId: session.accountId,
    });
    /* v2.8.76.4 — apply the new durations immediately: the throttled
       sweep deletes everything past the new cutoffs in the background
       (fire-and-forget). `force` bypasses the 30-min window so a fresh
       save never lands inside a just-ran throttle gap. */
    maybeRunChatRetentionLazy(true);
    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: "update_chat_retention",
      entity: "lms_chat_settings",
      entityId: "1",
    });
    const [stats, totals] = await Promise.all([getRetentionStats(), getChatTotals()]);
    return NextResponse.json({ ok: true, stats, totals });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the settings." },
      { status: 500 },
    );
  }
}
