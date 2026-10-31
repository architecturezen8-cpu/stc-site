import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lmsParents, lmsPortalAccounts, lmsStudents, lmsTeachers } from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import {
  getMyStorageParent,
  getMyStorageStudent,
  getMyStorageTeacher,
} from "@/lib/student-storage";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.3 — D.3: the per-person FILES drawer for the studio's Storage
 * panel. ?role=student|teacher|parent&personId=<lms person row id> → the
 * person's whole file inventory (live + trashed, the drawer dims trashed
 * rows) plus their used / capBytes. Students resolve through lms_students,
 * teachers through lms_teachers (a null account_id simply means an empty
 * list — caps can still be set ahead of the account link).
 */
export async function GET(req: Request) {
  const admin = await guardPortalOrLmsAdmin("read");
  if (admin instanceof NextResponse) return admin;

  try {
    const url = new URL(req.url);
    const role = url.searchParams.get("role");
    const personId = Number(url.searchParams.get("personId"));
    if (
      (role !== "student" && role !== "teacher" && role !== "parent") ||
      !Number.isInteger(personId) ||
      personId <= 0
    ) {
      return NextResponse.json(
        { ok: false, error: "A valid role and personId are required." },
        { status: 400 },
      );
    }

    if (role === "student") {
      const [student] = await db
        .select()
        .from(lmsStudents)
        .where(eq(lmsStudents.id, personId))
        .limit(1);
      if (!student) {
        return NextResponse.json({ ok: false, error: "Student not found." }, { status: 404 });
      }
      const data = await getMyStorageStudent(student.id);
      return NextResponse.json({
        ok: true,
        role,
        person: { fullName: student.fullName, label: student.admissionNo },
        ...data,
      });
    }

    if (role === "teacher") {
      const [teacher] = await db
        .select()
        .from(lmsTeachers)
        .where(eq(lmsTeachers.id, personId))
        .limit(1);
      if (!teacher) {
        return NextResponse.json({ ok: false, error: "Teacher not found." }, { status: 404 });
      }
      let fullName = teacher.staffCode || `Teacher #${teacher.id}`;
      if (teacher.accountId != null) {
        const [account] = await db
          .select({ fullName: lmsPortalAccounts.fullName })
          .from(lmsPortalAccounts)
          .where(eq(lmsPortalAccounts.id, teacher.accountId))
          .limit(1);
        if (account?.fullName) fullName = account.fullName;
      }
      const data = await getMyStorageTeacher(teacher.accountId, teacher.id);
      return NextResponse.json({
        ok: true,
        role,
        person: { fullName, label: teacher.staffCode ?? `T-${teacher.id}` },
        ...data,
      });
    }

    const [parent] = await db
      .select({
        id: lmsParents.id,
        relationship: lmsParents.relationship,
        accountName: lmsPortalAccounts.fullName,
      })
      .from(lmsParents)
      .innerJoin(lmsPortalAccounts, eq(lmsPortalAccounts.id, lmsParents.accountId))
      .where(eq(lmsParents.id, personId))
      .limit(1);
    if (!parent) {
      return NextResponse.json({ ok: false, error: "Parent not found." }, { status: 404 });
    }
    const data = await getMyStorageParent(parent.id);
    return NextResponse.json({
      ok: true,
      role,
      person: {
        fullName: parent.accountName || parent.relationship || `Parent #${parent.id}`,
        label: parent.relationship ?? "Parent",
      },
      ...data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load the person's files.",
      },
      { status: 500 },
    );
  }
}
