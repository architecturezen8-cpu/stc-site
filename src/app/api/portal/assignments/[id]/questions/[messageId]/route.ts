import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { deleteOwnQuestion } from "@/lib/portal-questions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; messageId: string }> };

/**
 * v2.8.51.0 — WhatsApp-style DELETE for one Q&A message.
 *
 * DELETE /api/portal/assignments/[id]/questions/[messageId]
 *   · the AUTHOR deletes their OWN message (student their question,
 *     teacher their reply) — soft delete: the row keeps its place in the
 *     thread, the body is withheld from every reader, the UI shows the
 *     "message deleted" stub;
 *   · anything else (foreign id, not the author, already deleted) → 404
 *     with no existence leak;
 *   · parents / other roles → 401/403.
 *
 * v2.8.52.0 — session resolution honors the island's `x-portal-role` hint
 * (a browser may hold BOTH a student and a teacher session; the hint picks
 * the right cookie — it cannot escalate).
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "student" && session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const params = await ctx.params;
  const assignmentId = Number(params.id);
  const messageId = Number(params.messageId);
  if (
    !Number.isInteger(assignmentId) || assignmentId <= 0 ||
    !Number.isInteger(messageId) || messageId <= 0
  ) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await deleteOwnQuestion({
      accountId: session.accountId,
      assignmentId,
      messageId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not delete the message." },
      { status: 500 },
    );
  }
}
