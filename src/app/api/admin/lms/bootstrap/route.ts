import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsStudentRecords,
  lmsStudents,
  lmsSubjects,
  lmsTeacherRecords,
  lmsTeachers,
} from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS Setup — one bootstrap payload for the whole manager:

     classes   lms_classes + class-teacher display name + student counts
     subjects  lms_subjects + usage counts
     staff     staff register rows (lms_teacher_records) LEFT JOIN the
               LMS person rows (lms_teachers) — NULL until a teacher
               registers and the bridge claims the row
     students  student register rows + person row + active enrollment
   ──────────────────────────────────────────────────────────────────────── */

export async function GET() {
  const denied = await guardPortalOrLmsAdmin("read");
  if (denied instanceof NextResponse) return denied;
  await ensureSchemaExtras();

  const [classRows, subjectRows, staffRecords, teacherRows, studentRecords, studentRows, enrollmentRows, assignmentRows] =
    await Promise.all([
      db.select().from(lmsClasses).orderBy(lmsClasses.name).limit(600),
      db.select().from(lmsSubjects).orderBy(lmsSubjects.name).limit(500),
      db.select().from(lmsTeacherRecords).orderBy(lmsTeacherRecords.fullName).limit(1200),
      db.select().from(lmsTeachers).limit(1500),
      db.select().from(lmsStudentRecords).orderBy(lmsStudentRecords.admissionNo).limit(4000),
      db.select().from(lmsStudents).limit(5000),
      db.select().from(lmsEnrollments).where(eq(lmsEnrollments.status, "active")).limit(6000),
      db.select().from(lmsClassSubjects).limit(6000),
    ]);

  const teacherByCode = new Map(
    teacherRows
      .filter((t) => t.staffCode)
      .map((t) => [(t.staffCode ?? "").toLowerCase(), t]),
  );
  const registerNameByCode = new Map(
    staffRecords.map((r) => [r.teacherId.toLowerCase(), r.fullName]),
  );
  const staff = staffRecords.map((record) => {
    const person = teacherByCode.get(record.teacherId.toLowerCase());
    return {
      recordId: record.id,
      teacherId: record.teacherId,
      fullName: record.fullName,
      designation: record.designation,
      email: record.email,
      phone: record.phone,
      lmsTeacherId: person?.id ?? null,
      hasAccount: person?.accountId != null,
    };
  });

  const countByClass = new Map<number, number>();
  for (const e of enrollmentRows) {
    countByClass.set(e.classId, (countByClass.get(e.classId) ?? 0) + 1);
  }
  const classes = classRows.map((c) => {
    const person = c.classTeacherId
      ? teacherRows.find((t) => t.id === c.classTeacherId)
      : undefined;
    const teacherName = person?.staffCode
      ? registerNameByCode.get(person.staffCode.toLowerCase()) ??
        (person.accountId ? null : person.staffCode)
      : null;
    return {
      id: c.id,
      name: c.name,
      grade: c.grade,
      section: c.section,
      academicYear: c.academicYear,
      classTeacherId: c.classTeacherId,
      classTeacherName: teacherName,
      students: countByClass.get(c.id) ?? 0,
    };
  });

  const personByAdmission = new Map(
    studentRows.map((s) => [s.admissionNo.toLowerCase(), s]),
  );
  const enrollmentByStudent = new Map(
    enrollmentRows.map((e) => [e.studentId, e]),
  );
  const classNameById = new Map(classRows.map((c) => [c.id, c.name]));
  const students = studentRecords.map((record) => {
    const person = personByAdmission.get(record.admissionNo.toLowerCase());
    const enrollment = person ? enrollmentByStudent.get(person.id) : undefined;
    return {
      recordId: record.id,
      admissionNo: record.admissionNo,
      fullName: record.fullName,
      registerClassName: record.className,
      personId: person?.id ?? null,
      hasAccount: person?.accountId != null,
      enrollmentId: enrollment?.id ?? null,
      classId: enrollment?.classId ?? null,
      className: enrollment ? (classNameById.get(enrollment.classId) ?? null) : null,
    };
  });

  const usageBySubject = new Map<number, number>();
  for (const a of assignmentRows) {
    usageBySubject.set(a.subjectId, (usageBySubject.get(a.subjectId) ?? 0) + 1);
  }
  const subjects = subjectRows.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    usage: usageBySubject.get(s.id) ?? 0,
  }));

  const assignments = assignmentRows.map((a) => ({
    id: a.id,
    classId: a.classId,
    subjectId: a.subjectId,
    teacherId: a.teacherId,
  }));

  return NextResponse.json({ classes, subjects, staff, students, assignments });
}
