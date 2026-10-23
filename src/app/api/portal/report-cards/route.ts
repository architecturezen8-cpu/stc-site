import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import {
  getPrincipalQueue,
  getStudentReportCards,
  getTeacherClassStudents,
  getTeacherReportClasses,
  getParentChildrenReportCards,
  saveReportCard,
  type SaveReportCardInput,
} from "@/lib/portal-report-card";

export const dynamic = "force-dynamic";

/**
 * v2.8.62.0 — the digital terminal report card.
 * v2.8.63.0 — the Principal's certification queue rides the GET:
 *
 * GET  · teacher → ?classId= present ? one class's roster with card states
 *        : every class the teacher leads
 *      · student → the student's CERTIFIED sheets, newest year first
 *      · parent  → per linked child, the same certified list
 *      · principal → the certification queue + recently certified history
 * POST · teacher only — save (upsert) one sheet:
 *        { classId, studentId, year?, rows[], terms[], submit? }
 *        submit=true saves AND hands the sheet to the Principal.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req, [
    "student",
    "teacher",
    "parent",
    "principal",
  ]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    if (session.role === "teacher") {
      const classId = Number(new URL(req.url).searchParams.get("classId"));
      if (Number.isInteger(classId) && classId > 0) {
        const result = await getTeacherClassStudents(session.accountId, classId);
        if (!result.ok) {
          const status =
            result.error === "not_class_teacher" ? 403 : result.error === "not_found" ? 404 : 400;
          return NextResponse.json(result, { status });
        }
        return NextResponse.json({ ok: true, ...result.data });
      }
      const classes = await getTeacherReportClasses(session.accountId);
      return NextResponse.json({ ok: true, classes });
    }

    if (session.role === "student") {
      const cards = await getStudentReportCards(session.accountId, session.email);
      return NextResponse.json({ ok: true, cards });
    }

    if (session.role === "principal") {
      const queue = await getPrincipalQueue(session.accountId);
      return NextResponse.json({ ok: true, queue });
    }

    const children = await getParentChildrenReportCards(session.accountId);
    return NextResponse.json({ ok: true, children });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the report cards." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req, ["teacher"]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as SaveReportCardInput | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await saveReportCard(session.accountId, body);
    if (!result.ok) {
      const status =
        result.error === "not_class_teacher"
          ? 403
          : result.error === "not_enrolled" || result.error === "not_found"
            ? 404
            : result.error === "locked"
              ? 409
              : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the report card." },
      { status: 500 },
    );
  }
}
