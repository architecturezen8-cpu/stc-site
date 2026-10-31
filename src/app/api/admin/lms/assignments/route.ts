import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsAssignments,
  lmsAssessments,
  lmsClassSubjects,
  lmsClasses,
  lmsMaterials,
  lmsSubjects,
  lmsTeachers,
} from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS Setup → Teaching assignments (lms_class_subjects)

   POST   { classId, subjectId, teacherId? }   create or re-assign the
                                               teacher for a class+subject
   DELETE ?id=                                 remove (blocked while
                                               assignments/assessments/
                                               materials reference it)
   ──────────────────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const classId = Number(body?.classId);
  const subjectId = Number(body?.subjectId);
  const hasTeacher =
    body?.teacherId !== null && body?.teacherId !== undefined && body?.teacherId !== "";
  const teacherId = hasTeacher ? Number(body?.teacherId) : null;

  if (!Number.isInteger(classId) || classId <= 0 || !Number.isInteger(subjectId) || subjectId <= 0) {
    return NextResponse.json({ error: "Class and subject are required." }, { status: 400 });
  }
  if (teacherId !== null && (!Number.isInteger(teacherId) || teacherId <= 0)) {
    return NextResponse.json({ error: "Invalid teacher." }, { status: 400 });
  }

  const [cls] = await db.select({ id: lmsClasses.id, name: lmsClasses.name }).from(lmsClasses).where(eq(lmsClasses.id, classId)).limit(1);
  if (!cls) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  const [subject] = await db.select({ id: lmsSubjects.id, name: lmsSubjects.name }).from(lmsSubjects).where(eq(lmsSubjects.id, subjectId)).limit(1);
  if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  if (teacherId !== null) {
    const [teacher] = await db.select({ id: lmsTeachers.id }).from(lmsTeachers).where(eq(lmsTeachers.id, teacherId)).limit(1);
    if (!teacher) return NextResponse.json({ error: "That teacher is not on the LMS staff list." }, { status: 404 });
  }

  const [existing] = await db
    .select()
    .from(lmsClassSubjects)
    .where(and(eq(lmsClassSubjects.classId, classId), eq(lmsClassSubjects.subjectId, subjectId)))
    .limit(1);

  if (existing) {
    await db.update(lmsClassSubjects).set({ teacherId }).where(eq(lmsClassSubjects.id, existing.id));
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "lms_assignment_updated",
      entity: "lms_class_subject",
      entityId: String(existing.id),
    });
    return NextResponse.json({ ok: true, updated: true });
  }

  const [created] = await db
    .insert(lmsClassSubjects)
    .values({ classId, subjectId, teacherId })
    .returning();
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_assignment_created",
    entity: "lms_class_subject",
    entityId: String(created.id),
  });

  return NextResponse.json({ ok: true, created: true });
}

export async function DELETE(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid assignment." }, { status: 400 });
  }

  const [assignments] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsAssignments)
    .where(eq(lmsAssignments.classSubjectId, id));
  const [assessments] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsAssessments)
    .where(eq(lmsAssessments.classSubjectId, id));
  const [materials] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsMaterials)
    .where(eq(lmsMaterials.classSubjectId, id));

  const refs = (assignments?.n ?? 0) + (assessments?.n ?? 0) + (materials?.n ?? 0);
  if (refs > 0) {
    return NextResponse.json(
      {
        error: `Assignment is still used — ${assignments?.n ?? 0} homework, ${assessments?.n ?? 0} assessment(s), ${materials?.n ?? 0} material(s). Remove those first.`,
      },
      { status: 409 },
    );
  }

  await db.delete(lmsClassSubjects).where(eq(lmsClassSubjects.id, id));
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_assignment_deleted",
    entity: "lms_class_subject",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
