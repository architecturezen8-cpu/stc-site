import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsClasses,
  lmsEnrollments,
  lmsStudentRecords,
  lmsTeacherRecords,
} from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureStudentPersonByAdmissionNo } from "@/lib/lms-identity";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   Admin → Verification Records — the OFFICE REGISTERS used to verify
   self-registrations. Students: admission no, register no, class, name,
   father & mother names. Teachers: teacher ID, name, email.

   GET    ?type=all            → { students, teachers }
   POST   { type, ...fields }  → create one register row
   PATCH  { type, id, ... }    → v2.8.48.0 EDIT one register row — identity
                                 fields (admissionNo / teacherId) are LOCKED;
                                 a class change moves the enrollment so the
                                 attendance roster follows (calm fallback: the
                                 office can still re-enroll from LMS Setup).
   DELETE ?type=student&id=1   → remove one register row
   ──────────────────────────────────────────────────────────────────────── */

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

export async function GET() {
  const denied = await guardPortalOrLmsAdmin("read");
  if (denied instanceof NextResponse) return denied;
  await ensureSchemaExtras();

  const [students, teachers] = await Promise.all([
    db.select().from(lmsStudentRecords).orderBy(desc(lmsStudentRecords.id)).limit(1000),
    db.select().from(lmsTeacherRecords).orderBy(desc(lmsTeacherRecords.id)).limit(1000),
  ]);

  return NextResponse.json({ students, teachers });
}

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const type = clean(body.type, 10);

  try {
    if (type === "student") {
      const admissionNo = clean(body.admissionNo, 40);
      const fullName = clean(body.fullName, 120);
      const className = clean(body.className, 40);
      /* v2.8.62.0 — the owner: "godak welawata thawa details danna wenawa"
         — the register row needs only the essentials; parents/contact are
         optional and can be added later with Edit. Stored as "" (the
         columns are NOT NULL), and the register matcher skips blanks. */
      const fatherName = clean(body.fatherName, 120);
      const motherName = clean(body.motherName, 120);
      const registerNo = clean(body.registerNo, 40) || null;
      const phone = clean(body.phone, 30) || null;
      const email = clean(body.email, 180) || null;

      if (!admissionNo || !fullName || !className) {
        return NextResponse.json(
          { error: "Admission number, name and class are required." },
          { status: 400 },
        );
      }

      const [created] = await db
        .insert(lmsStudentRecords)
        .values({
          admissionNo,
          registerNo,
          fullName,
          className,
          fatherName,
          motherName,
          phone,
          email,
        })
        .returning();

      /* v2.8.37.1 — a NEW register student is attendance-ready AT ONCE:
         materialize the lms_students person row and enroll them into the
         class named on the register (no account needed — attendance is
         roster-driven). Calm on failure: the office can still enroll
         manually from LMS Setup → Enrollment. */
      let autoEnrolledInto: string | null = null;
      try {
        const person = await ensureStudentPersonByAdmissionNo(created.admissionNo, null);
        if (person) {
          const [enrollment] = await db
            .select({ classId: lmsEnrollments.classId })
            .from(lmsEnrollments)
            .where(eq(lmsEnrollments.studentId, person.id))
            .limit(1);
          if (enrollment) autoEnrolledInto = className;
        }
      } catch {
        /* calm degradation — manual enrollment stays available */
      }

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "student_record_created",
        entity: "lms_student_records",
        entityId: String(created.id),
      });
      return NextResponse.json({ student: created, autoEnrolledInto });
    }

    if (type === "teacher") {
      const teacherId = clean(body.teacherId, 40);
      const fullName = clean(body.fullName, 120);
      const email = clean(body.email, 180) || null;
      const phone = clean(body.phone, 30) || null;
      const designation = clean(body.designation, 120) || null;

      if (!teacherId || !fullName) {
        return NextResponse.json(
          { error: "Teacher ID and full name are required." },
          { status: 400 },
        );
      }

      const [created] = await db
        .insert(lmsTeacherRecords)
        .values({ teacherId, fullName, email, phone, designation })
        .returning();

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "teacher_record_created",
        entity: "lms_teacher_records",
        entityId: String(created.id),
      });
      return NextResponse.json({ teacher: created });
    }

    return NextResponse.json({ error: "Unknown record type." }, { status: 400 });
  } catch (error) {
    /* Drizzle wraps the pg driver error — the unique-violation code rides
       on `cause`, the text on `message`. Both are checked. */
    const pgCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
    const message = error instanceof Error ? error.message : "Unable to save the record.";
    if (pgCode === "23505" || message.includes("duplicate key")) {
      return NextResponse.json(
        { error: "That ID is already on the register." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ── v2.8.48.0 — EDIT one register row ───────────────────────────────────
   The office can fix typos and life events (phone, email, a class change,
   a parent's name) without delete-and-recreate. Identity columns are
   LOCKED server-side: admissionNo verifies portal registrations and links
   the lms_students person row; teacherId verifies teacher accounts. */
export async function PATCH(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const type = body ? clean(body.type, 10) : "";
  const id = body ? Number(body.id) : NaN;
  if (!body || !Number.isInteger(id) || id <= 0 || !["student", "teacher"].includes(type)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    if (type === "student") {
      const fullName = clean(body.fullName, 120);
      const className = clean(body.className, 40);
      const fatherName = clean(body.fatherName, 120);
      const motherName = clean(body.motherName, 120);
      const registerNo = clean(body.registerNo, 40) || null;
      const phone = clean(body.phone, 30) || null;
      const email = clean(body.email, 180) || null;

      if (!fullName || !className || !fatherName || !motherName) {
        return NextResponse.json(
          { error: "Name, class and both parent names are required." },
          { status: 400 },
        );
      }

      const [current] = await db
        .select()
        .from(lmsStudentRecords)
        .where(eq(lmsStudentRecords.id, id))
        .limit(1);
      if (!current) {
        return NextResponse.json({ error: "Student record not found." }, { status: 404 });
      }

      const [updated] = await db
        .update(lmsStudentRecords)
        .set({ fullName, className, fatherName, motherName, registerNo, phone, email })
        .where(eq(lmsStudentRecords.id, id))
        .returning();

      /* Class changed → move the active enrollment so attendance, homework
         and marks rosters follow the register. Calm on any mismatch: the
         office can always re-enroll manually from LMS Setup → Enrollment. */
      let enrollmentMoved = false;
      let enrollmentNote: string | null = null;
      if (current.className !== className) {
        const person = await ensureStudentPersonByAdmissionNo(
          current.admissionNo,
          null,
        ).catch(() => null);
        if (person) {
          const [existing] = await db
            .select()
            .from(lmsEnrollments)
            .where(eq(lmsEnrollments.studentId, person.id))
            .limit(1);
          if (existing) {
            const [target] = await db
              .select({ id: lmsClasses.id })
              .from(lmsClasses)
              .where(eq(lmsClasses.name, className))
              .orderBy(desc(lmsClasses.academicYear), desc(lmsClasses.id))
              .limit(1);
            if (target && target.id !== existing.classId) {
              await db
                .update(lmsEnrollments)
                .set({ classId: target.id })
                .where(eq(lmsEnrollments.id, existing.id));
              enrollmentMoved = true;
            } else if (!target) {
              enrollmentNote = `No class named “${className}” exists yet — create it under LMS Setup → Classes, then re-enroll from Enrollment.`;
            }
          } else {
            enrollmentNote = "The student is not enrolled in a class yet — pick one under LMS Setup → Enrollment.";
          }
        }
      }

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "student_record_updated",
        entity: "lms_student_records",
        entityId: String(id),
        details: { classChanged: current.className !== className, enrollmentMoved },
      });
      return NextResponse.json({ student: updated, enrollmentMoved, enrollmentNote });
    }

    if (type === "teacher") {
      const fullName = clean(body.fullName, 120);
      const email = clean(body.email, 180) || null;
      const phone = clean(body.phone, 30) || null;
      const designation = clean(body.designation, 120) || null;

      if (!fullName) {
        return NextResponse.json({ error: "Name is required." }, { status: 400 });
      }

      const [updated] = await db
        .update(lmsTeacherRecords)
        .set({ fullName, email, phone, designation })
        .where(eq(lmsTeacherRecords.id, id))
        .returning();
      if (!updated) {
        return NextResponse.json({ error: "Teacher record not found." }, { status: 404 });
      }

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "teacher_record_updated",
        entity: "lms_teacher_records",
        entityId: String(id),
      });
      return NextResponse.json({ teacher: updated });
    }

    return NextResponse.json({ error: "Unknown record type." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the record.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";
  if (!["student", "teacher"].includes(type)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  /* v2.8.67.2 (Task 25-c) — BATCH delete: ?type=student&ids=1,2,3 alongside
     the existing single-id form. The single path below is untouched. */
  const idsParam = url.searchParams.get("ids");
  if (idsParam !== null) {
    const ids = [
      ...new Set(
        idsParam
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ].slice(0, 1000);
    if (ids.length === 0) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    try {
      let deleted = 0;
      const missing: number[] = [];

      if (type === "student") {
        /* Same per-row semantics as the single delete: resolve the person
           by admission BEFORE the register row goes, then drop the ACTIVE
           enrollments (person row + attendance history are kept). */
        const rows = await db
          .select({ id: lmsStudentRecords.id, admissionNo: lmsStudentRecords.admissionNo })
          .from(lmsStudentRecords)
          .where(inArray(lmsStudentRecords.id, ids));
        const foundIds = new Set(rows.map((r) => r.id));
        for (const id of ids) if (!foundIds.has(id)) missing.push(id);

        for (const row of rows) {
          const person = await ensureStudentPersonByAdmissionNo(row.admissionNo, null).catch(
            () => null,
          );
          await db.delete(lmsStudentRecords).where(eq(lmsStudentRecords.id, row.id));
          if (person) {
            await db.delete(lmsEnrollments).where(eq(lmsEnrollments.studentId, person.id));
          }
          await db.insert(adminAuditLogs).values({
            userId: session.id,
            action: "student_record_deleted",
            entity: "lms_student_records",
            entityId: String(row.id),
          });
          deleted++;
        }
      } else {
        const rows = await db
          .select({ id: lmsTeacherRecords.id })
          .from(lmsTeacherRecords)
          .where(inArray(lmsTeacherRecords.id, ids));
        const foundIds = new Set(rows.map((r) => r.id));
        for (const id of ids) if (!foundIds.has(id)) missing.push(id);

        for (const row of rows) {
          await db.delete(lmsTeacherRecords).where(eq(lmsTeacherRecords.id, row.id));
          await db.insert(adminAuditLogs).values({
            userId: session.id,
            action: "teacher_record_deleted",
            entity: "lms_teacher_records",
            entityId: String(row.id),
          });
          deleted++;
        }
      }

      return NextResponse.json({ ok: true, deleted, missing });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the records.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    if (type === "student") {
      /* v2.8.37.1 — the register is the source of truth: removing a student
         from it also drops their ACTIVE class enrollment, so the child
         leaves the attendance roster immediately (person row + attendance
         history are kept for the record). The person is resolved BEFORE
         the register row goes — after deletion it can't be found. */
      const [row] = await db
        .select({ admissionNo: lmsStudentRecords.admissionNo })
        .from(lmsStudentRecords)
        .where(eq(lmsStudentRecords.id, id))
        .limit(1);
      const person = row
        ? await ensureStudentPersonByAdmissionNo(row.admissionNo, null).catch(() => null)
        : null;
      await db.delete(lmsStudentRecords).where(eq(lmsStudentRecords.id, id));
      if (person) {
        await db.delete(lmsEnrollments).where(eq(lmsEnrollments.studentId, person.id));
      }
    } else {
      await db.delete(lmsTeacherRecords).where(eq(lmsTeacherRecords.id, id));
    }
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: type === "student" ? "student_record_deleted" : "teacher_record_deleted",
      entity: type === "student" ? "lms_student_records" : "lms_teacher_records",
      entityId: String(id),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete the record.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
