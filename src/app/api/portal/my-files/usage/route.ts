import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  ensureParentPerson,
  ensureStudentPerson,
  ensureTeacherPerson,
} from "@/lib/lms-identity";
import {
  checkStudentQuota,
  checkTeacherQuota,
  getEffectiveCapBytes,
} from "@/lib/student-storage";

export const dynamic = "force-dynamic";

/**
 * v2.8.68.1 — the CHEAP pre-upload storage probe. Before a picker starts
 * moving bytes, the client asks here for the signed-in person's used /
 * capBytes / remaining so an over-cap pick can be refused IN THE BROWSER
 * with the honest "not enough storage — free up space" message instead of
 * a doomed upload that dies on the server.
 *
 * Deliberately tiny: two SUM queries at most, NO file inventory (My
 * Storage's /api/portal/my-files stays the heavy read).
 *
 * FAIL-OPEN everywhere: any read trouble answers used:-1 + remaining:null
 * and the client simply skips the pre-check — the presign/multipart gates
 * remain the authoritative enforcement, exactly as before.
 */
export async function GET() {
  const session = await getPortalSession();
  if (!session || session.role === "principal") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (session.role === "student") {
      const person = await ensureStudentPerson(session.accountId, session.email);
      if (!person) {
        return NextResponse.json({
          ok: true,
          role: "student",
          used: 0,
          capBytes: null,
          remaining: null,
        });
      }
      const verdict = await checkStudentQuota(person.id, 0);
      if (verdict.used < 0) {
        return NextResponse.json({
          ok: true,
          role: "student",
          used: -1,
          capBytes: null,
          remaining: null,
        });
      }
      return NextResponse.json({
        ok: true,
        role: "student",
        used: verdict.used,
        capBytes: verdict.quota,
        remaining: Math.max(0, verdict.quota - verdict.used),
      });
    }

    if (session.role === "teacher") {
      // The person row is not needed for the check (it reads by account id)
      // — resolving it keeps the failure modes identical to my-files.
      await ensureTeacherPerson(session.accountId);
      const verdict = await checkTeacherQuota(session.accountId, 0);
      // quota <= 0 → no cap row (trusted-staff unlimited) or read failure.
      if (verdict.quota <= 0 || verdict.used < 0) {
        return NextResponse.json({
          ok: true,
          role: "teacher",
          used: -1,
          capBytes: null,
          remaining: null,
        });
      }
      return NextResponse.json({
        ok: true,
        role: "teacher",
        used: verdict.used,
        capBytes: verdict.quota,
        remaining: Math.max(0, verdict.quota - verdict.used),
      });
    }

    // Parents upload nothing today — report the cap honestly anyway.
    const person = await ensureParentPerson(session.accountId);
    const cap = person ? await getEffectiveCapBytes("parent", person.id) : null;
    return NextResponse.json({
      ok: true,
      role: "parent",
      used: 0,
      capBytes: cap,
      remaining: cap,
    });
  } catch {
    return NextResponse.json({ ok: true, used: -1, capBytes: null, remaining: null });
  }
}
