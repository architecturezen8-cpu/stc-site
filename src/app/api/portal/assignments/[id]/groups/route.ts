import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  getAssignmentGroupManager,
  mutateAssignmentGroup,
} from "@/lib/portal-assignments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Phase 4.1 — the teacher's group manager for ONE assignment.
 *
 * GET  → the full manager payload: groups with member ids, the ungrouped
 *        roster, whether the structure is locked (a team has submitted)
 *        and the mark ceiling.
 * POST → { action: "create"|"rename"|"delete"|"addMember"|"removeMember",
 *          groupId?, name?, studentId?, studentIds? } — structure
 *        mutations, all ownership-checked server-side and locked once work
 *        is submitted; addMember takes ONE studentId or a studentIds[]
 *        batch (the whole team in one go).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const assignmentId = Number((await ctx.params).id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const view = await getAssignmentGroupManager(session.accountId, assignmentId);
    if (!view) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, manager: view });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the groups." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const assignmentId = Number((await ctx.params).id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        action?: string;
        groupId?: number;
        name?: string;
        studentId?: number;
        /* v2.8.58.0 — batch member add */
        studentIds?: number[];
      }
    | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await mutateAssignmentGroup({
      accountId: session.accountId,
      assignmentId,
      action: body.action,
      groupId: body.groupId,
      name: body.name,
      studentId: body.studentId,
      studentIds: body.studentIds,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the group change." },
      { status: 500 },
    );
  }
}
