import { NextResponse } from "next/server";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import {
  getCleanupCandidates,
  getParentUsageRows,
  getStorageOverview,
  getStudentUsageRows,
  getTeacherUsageRows,
} from "@/lib/student-storage";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.1 — D.2 read side: everything the Storage & Quotas panel needs in
 * ONE round-trip — bucket prefix overview, per-student quota table and the
 * 3-month cleanup marks. Read-only; purging lives in ./purge.
 *
 * v2.8.67.3 — D.3: the guard now accepts an LMS admin session too (the
 * studio's own Storage page uses this endpoint) and the payload grows the
 * additive `teachers` + `parents` tables. `overview`, `students` and
 * `cleanup` keep their D.2 shape.
 */
export async function GET() {
  const admin = await guardPortalOrLmsAdmin("read");
  if (admin instanceof NextResponse) return admin;

  try {
    const [overview, students, teachers, parents, cleanup] = await Promise.all([
      getStorageOverview(),
      getStudentUsageRows(),
      getTeacherUsageRows(),
      getParentUsageRows(),
      getCleanupCandidates(),
    ]);
    return NextResponse.json(
      { ok: true, overview, students, teachers, parents, cleanup },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load storage data.",
      },
      { status: 500 },
    );
  }
}
