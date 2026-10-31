import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import {
  certifyReportCard,
  deleteReportCard,
  getReportCardView,
  recallReportCard,
  returnReportCard,
  submitReportCard,
} from "@/lib/portal-report-card";

export const dynamic = "force-dynamic";

/**
 * v2.8.62.0 — one report card sheet, addressed by card id.
 * v2.8.63.0 — the certification lifecycle rides this route too:
 *
 * GET    · student / teacher / parent / principal → the full view payload.
 *          The reader enforces its own guards: students and parents only
 *          ever see a CERTIFIED sheet of their own card / linked child;
 *          the class teacher may read any state of their class; the
 *          principal reads submitted + certified.
 * PATCH  · teacher — { action: "submit" | "recall" }
 *          principal — { action: "certify" } or { action: "return", note }
 * DELETE · teacher only, DRAFT sheets only — removes the sheet with its
 *          marks, terms and audit events (cascade in one transaction).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getPortalSessionForRequest(req, [
    "student",
    "teacher",
    "parent",
    "principal",
  ]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const cardId = Number(id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const result = await getReportCardView(cardId, {
      role: session.role as "student" | "teacher" | "parent" | "principal",
      accountId: session.accountId,
    });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 403;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the report card." },
      { status: 500 },
    );
  }
}

type PatchAction =
  | { action: "submit" }
  | { action: "recall" }
  | { action: "certify" }
  | { action: "return"; note?: string };

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getPortalSessionForRequest(req, ["teacher", "principal"]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const cardId = Number(id);
  const body = (await req.json().catch(() => null)) as PatchAction | null;
  if (
    !body ||
    !Number.isInteger(cardId) ||
    cardId <= 0 ||
    !["submit", "recall", "certify", "return"].includes(body.action)
  ) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const failStatus = (error: string) =>
    error === "not_class_teacher" || error === "forbidden"
      ? 403
      : error === "not_found"
        ? 404
        : error === "wrong_state" || error === "signature_missing" || error === "locked"
          ? 409
          : 400;

  try {
    if (session.role === "teacher") {
      if (body.action === "submit") {
        const result = await submitReportCard(session.accountId, cardId);
        if (!result.ok) return NextResponse.json(result, { status: failStatus(result.error) });
        return NextResponse.json(result);
      }
      if (body.action === "recall") {
        const result = await recallReportCard(session.accountId, cardId);
        if (!result.ok) return NextResponse.json(result, { status: failStatus(result.error) });
        return NextResponse.json(result);
      }
      /* certify / return belong to the Principal alone. */
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    /* session.role === "principal" */
    if (body.action === "certify") {
      const result = await certifyReportCard(session.accountId, cardId);
      if (!result.ok) return NextResponse.json(result, { status: failStatus(result.error) });
      return NextResponse.json(result);
    }
    if (body.action === "return") {
      const result = await returnReportCard(session.accountId, cardId, body.note ?? "");
      if (!result.ok) return NextResponse.json(result, { status: failStatus(result.error) });
      return NextResponse.json(result);
    }
    /* submit / recall belong to the class teacher alone. */
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not update the report card." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getPortalSessionForRequest(req, ["teacher"]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const cardId = Number(id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const result = await deleteReportCard(session.accountId, cardId);
    if (!result.ok) {
      const status =
        result.error === "not_class_teacher"
          ? 403
          : result.error === "not_found"
            ? 404
            : result.error === "locked"
              ? 409
              : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not delete the report card." },
      { status: 500 },
    );
  }
}
