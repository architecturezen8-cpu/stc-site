import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsNotices,
  lmsTeachers,
  lmsTimetableSlots,
} from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { normalizeClass } from "@/lib/verification";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS Setup → Classes

   POST   { grade, section, academicYear? }     create (name = "<grade>-<section>")
   PATCH  { id, classTeacherId: number|null }   set / clear the class teacher
   DELETE ?id=                                  delete (blocked while referenced)
   ──────────────────────────────────────────────────────────────────────── */

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const grade = clean(body?.grade, 10);
  const section = clean(body?.section, 20);
  const academicYear = clean(body?.academicYear, 9) || "2026";
  if (!grade || !section) {
    return NextResponse.json({ error: "Grade and section are required." }, { status: 400 });
  }

  const name = `${grade}-${section}`;
  /* Year-aware duplicate check (academic-year rollover): the same class name
     may exist once per academic year — "6-A" for 2026 and "6-A" for 2027 are
     different classes. Only a same-name + same-year clash is a 409. */
  const [dup] = await db
    .select({ id: lmsClasses.id })
    .from(lmsClasses)
    .where(
      and(
        sql`lower(${lmsClasses.name}) = ${name.toLowerCase()}`,
        eq(lmsClasses.academicYear, academicYear),
      ),
    )
    .limit(1);
  if (dup) {
    return NextResponse.json(
      { error: `Class ${name} already exists for ${academicYear}.` },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(lmsClasses)
    .values({ name, grade, section, academicYear })
    .returning();

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_class_created",
    entity: "lms_class",
    entityId: String(created.id),
  });

  return NextResponse.json({ ok: true, class: created });
}

export async function PATCH(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid class." }, { status: 400 });
  }
  const hasTeacher = body?.classTeacherId !== null && body?.classTeacherId !== undefined && body?.classTeacherId !== "";
  const classTeacherId = hasTeacher ? Number(body?.classTeacherId) : null;
  if (classTeacherId !== null && (!Number.isInteger(classTeacherId) || classTeacherId <= 0)) {
    return NextResponse.json({ error: "Invalid teacher." }, { status: 400 });
  }

  const [exists] = await db.select({ id: lmsClasses.id }).from(lmsClasses).where(eq(lmsClasses.id, id)).limit(1);
  if (!exists) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  if (classTeacherId !== null) {
    const [teacher] = await db
      .select({ id: lmsTeachers.id })
      .from(lmsTeachers)
      .where(eq(lmsTeachers.id, classTeacherId))
      .limit(1);
    if (!teacher) {
      return NextResponse.json({ error: "That teacher is not on the LMS staff list." }, { status: 404 });
    }
  }

  await db.update(lmsClasses).set({ classTeacherId }).where(eq(lmsClasses.id, id));
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: classTeacherId ? "lms_class_teacher_set" : "lms_class_teacher_cleared",
    entity: "lms_class",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid class." }, { status: 400 });
  }

  const [enr] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsEnrollments)
    .where(eq(lmsEnrollments.classId, id));
  const [cs] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsClassSubjects)
    .where(eq(lmsClassSubjects.classId, id));
  const [slots] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsTimetableSlots)
    .where(eq(lmsTimetableSlots.classId, id));
  const [notices] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lmsNotices)
    .where(eq(lmsNotices.classId, id));

  const refs = (enr?.n ?? 0) + (cs?.n ?? 0) + (slots?.n ?? 0) + (notices?.n ?? 0);
  if (refs > 0) {
    return NextResponse.json(
      {
        error: `Class is still in use — ${enr?.n ?? 0} enrollment(s), ${cs?.n ?? 0} subject assignment(s), ${slots?.n ?? 0} timetable slot(s), ${notices?.n ?? 0} notice(s). Remove those first.`,
      },
      { status: 409 },
    );
  }

  await db.delete(lmsClasses).where(eq(lmsClasses.id, id));
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "lms_class_deleted",
    entity: "lms_class",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
