import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import {
  getOwnSignatures,
  isSignatureKind,
  removeSignature,
  saveSignature,
} from "@/lib/portal-signature";

export const dynamic = "force-dynamic";

/**
 * v2.8.63.0 — PRIVATE signature stamps (the owner's anti-abuse design).
 *
 * GET    · the signed-in teacher/principal's own stamp STATUS (metadata
 *          only — the bytes live at /api/portal/signature/image).
 * POST   · { kind: "sign" | "seal", dataUrl } — PNG only, ≤ 2 MB. Teachers
 *          may hold 'sign'; the Principal may hold 'sign' + 'seal'.
 * DELETE · { kind } removes one of the caller's own stamps.
 *
 * The stamps never join the media library and never get a public URL;
 * report-card sheets pull them through the session-gated
 * /api/portal/report-card-signature route.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req, ["teacher", "principal"]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const own = await getOwnSignatures(session.accountId, session.role);
    return NextResponse.json({ ok: true, ...own });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the signatures." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req, ["teacher", "principal"]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher" && session.role !== "principal") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { kind?: string; dataUrl?: string }
    | null;
  if (!body || !isSignatureKind(body.kind) || typeof body.dataUrl !== "string") {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const result = await saveSignature(session.accountId, session.role, body.kind, body.dataUrl);
  if (!result.ok) {
    const status =
      result.error === "forbidden_kind"
        ? 403
        : result.error === "too_large" || result.error === "not_png"
          ? 415
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getPortalSessionForRequest(req, ["teacher", "principal"]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher" && session.role !== "principal") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { kind?: string } | null;
  if (!body || !isSignatureKind(body.kind)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const result = await removeSignature(session.accountId, session.role, body.kind);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "forbidden_kind" ? 403 : 400 });
  }
  return NextResponse.json({ ok: true });
}
