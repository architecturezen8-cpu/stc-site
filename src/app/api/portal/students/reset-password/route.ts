import { NextResponse } from "next/server";
import { issueStudentTempPassword } from "@/lib/portal-password-reset";
import { getPortalSessionForRequest } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.0 — the TEACHER fallback of D.1: a student without a reachable
 * email (synthetic adm-… identity) is reset by a teacher who teaches the
 * student's class or is its class teacher. The response carries the
 * one-time temp password exactly once; the student must replace it at the
 * next login (/account/secure). Every issuance is audit-logged with the
 * student's admission number.
 */
export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req, ["teacher"]);
  if (!session || session.role !== "teacher") {
    return NextResponse.json({ ok: false, status: "unauthorized" }, { status: 200 });
  }

  let body: { studentAccountId?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const studentAccountId = Number(body.studentAccountId);
  if (!Number.isInteger(studentAccountId) || studentAccountId <= 0) {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  try {
    const result = await issueStudentTempPassword(session.accountId, studentAccountId);
    if (result.status !== "ok") {
      return NextResponse.json({ ok: false, status: result.status }, { status: 200 });
    }
    return NextResponse.json(
      { ok: true, tempPassword: result.tempPassword },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, status: "server_error" }, { status: 200 });
  }
}
