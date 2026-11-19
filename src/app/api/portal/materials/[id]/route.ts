import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  deleteMaterial,
  getTeacherMaterialDetail,
  updateMaterial,
} from "@/lib/portal-classroom";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE one material — the posting teacher only (ownership-checked).
 *  File rows AND their stored bytes are cleaned up with it. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await deleteMaterial(session.accountId, id);
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not delete the material." },
      { status: 500 },
    );
  }
}

/** GET one material — the edit-dialog payload (posting teacher only). */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const detail = await getTeacherMaterialDetail(session.accountId, id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, detail });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the material." },
      { status: 500 },
    );
  }
}

/**
 * v2.8.49.0 — Phase 1.2: edit a shared material. undefined = unchanged;
 * attachments reconcile in place (kept keys reuse stored rows, removed
 * keys lose their bytes, new keys must be fresh uploads).
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        classSubjectId?: number;
        title?: string;
        linkUrl?: string;
        files?: unknown;
      }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await updateMaterial(session.accountId, id, body);
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "not_found" ? 404 : 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the material." },
      { status: 500 },
    );
  }
}
