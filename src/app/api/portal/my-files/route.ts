import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import {
  ensureParentPerson,
  ensureStudentPerson,
  ensureTeacherPerson,
} from "@/lib/lms-identity";
import {
  getMyStorageParent,
  getMyStorageStudent,
  getMyStorageTeacher,
} from "@/lib/student-storage";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.3 — D.3 read side of the portal's "My Storage" manager: EVERYTHING
 * the signed-in person owns (live + trashed rows — the client splits the
 * tabs). Guard = any portal session (student | teacher | parent); the LMS
 * admin studio and principal sessions have no personal storage here.
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
        // No person row yet (register not linked) — an honest empty view.
        return NextResponse.json({
          ok: true,
          role: "student",
          used: 0,
          capBytes: null,
          files: { submissions: [], chat: [] },
        });
      }
      const data = await getMyStorageStudent(person.id);
      return NextResponse.json({ ok: true, role: "student", ...data });
    }

    if (session.role === "teacher") {
      const person = await ensureTeacherPerson(session.accountId);
      const data = await getMyStorageTeacher(session.accountId, person?.id ?? null);
      return NextResponse.json({ ok: true, role: "teacher", ...data });
    }

    const person = await ensureParentPerson(session.accountId);
    const data = person
      ? await getMyStorageParent(person.id)
      : { used: 0, capBytes: null, files: { submissions: [], chat: [] } };
    return NextResponse.json({ ok: true, role: "parent", ...data });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load your files.",
      },
      { status: 500 },
    );
  }
}
