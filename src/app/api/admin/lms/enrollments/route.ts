import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsClasses, lmsEnrollments } from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  ensureStudentPersonByAdmissionNo,
  findStudentRecordByAdmission,
} from "@/lib/lms-identity";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS Setup → Enrollment

   POST   { classId, admissionNo }   enroll a REGISTER student into a
                                     class (materializes the lms_students
                                     person row; a student lives in ONE
                                     class — enrolling elsewhere moves)
   DELETE ?id=                       remove the enrollment row
   ──────────────────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const classId = Number(body?.classId);
  const admissionNo = typeof body?.admissionNo === "string" ? body.admissionNo.trim() : "";

  if (!Number.isInteger(classId) || classId <= 0 || !admissionNo) {
    return NextResponse.json({ error: "Class and admission number are required." }, { status: 400 });
  }

  const [cls] = await db
    .select({ id: lmsClasses.id, name: lmsClasses.name })
    .from(lmsClasses)
    .where(eq(lmsClasses.id, classId))
    .limit(1);
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const record = await findStudentRecordByAdmission(admissionNo);
  if (!record) {
    return NextResponse.json(
      { error: `"${admissionNo}" is not on the student register — add it in Verification Records first.` },
      { status: 404 },
    );
  }

  const person = await ensureStudentPersonByAdmissionNo(record.admissionNo, null);
  if (!person) {
    return NextResponse.json({ error: "Could not materialize the student person row." }, { status: 500 });
  }

  const [existing] = await db
    .select()
    .from(lmsEnrollments)
    .where(and(eq(lmsEnrollments.studentId, person.id), eq(lmsEnrollments.status, "active")))
    .limit(1);

  if (existing && existing.classId === classId) {
    return NextResponse.json(
      { error: `${record.fullName} is already in ${cls.name}.` },
      { status: 409 },
    );
  }

  if (existing) {
    await db.update(lmsEnrollments).set({ classId }).where(eq(lmsEnrollments.id, existing.id));
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "lms_student_moved",
      entity: "lms_enrollment",
      entityId: String(existing.id),
    });
    return NextResponse.json({ ok: true, moved: true });
  }

  const [created] = await db
    .insert(lmsEnrollments)
    .values({ studentId: person.id, classId, status: "active" })
    .onConflictDoNothing()
    .returning();
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_student_enrolled",
    entity: "lms_enrollment",
    entityId: String(created?.id ?? "0"),
  });

  return NextResponse.json({ ok: true, enrolled: true });
}

export async function DELETE(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid enrollment." }, { status: 400 });
  }

  await db.delete(lmsEnrollments).where(eq(lmsEnrollments.id, id));
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_student_removed",
    entity: "lms_enrollment",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
