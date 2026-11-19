import { desc } from "drizzle-orm";
import { db } from "@/db";
import { lmsClasses, lmsStudentRecords, lmsTeacherRecords } from "@/db/schema-lms";
import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import {
  VerificationRecordsManager,
  type StudentRecordRow,
  type TeacherRecordRow,
} from "@/components/admin/verification-records-manager";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * LMS Admin → Verification Records — the office registers (students &
 * staff) that portal self-registrations are verified against.
 * (Moved out of the website Admin Studio in v2.8.35.0 — module isolation.)
 *
 * v2.8.59.0 — the page also hands down the school's REAL class names
 * (live class master + the register's own distinct values) so the dialogs'
 * Class field is a SELECTION LIST, never a typo-prone text box.
 */
export default async function LmsAdminRegistersPage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  const [studentRows, teacherRows, classRows, registerClassRows] = await Promise.all([
    db.select().from(lmsStudentRecords).orderBy(desc(lmsStudentRecords.id)).limit(1000),
    db.select().from(lmsTeacherRecords).orderBy(desc(lmsTeacherRecords.id)).limit(1000),
    db.selectDistinct({ name: lmsClasses.name }).from(lmsClasses),
    db.selectDistinct({ name: lmsStudentRecords.className }).from(lmsStudentRecords),
  ]);

  /* Natural sort so "10-A" follows "9-B" like a human expects. */
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const classNames = [...new Set(
    [...classRows, ...registerClassRows]
      .map((r) => r.name.trim())
      .filter((n) => n.length > 0 && n.length <= 40),
  )].sort(collator.compare);

  const students: StudentRecordRow[] = JSON.parse(
    JSON.stringify(
      studentRows.map((row) => ({
        id: row.id,
        admissionNo: row.admissionNo,
        registerNo: row.registerNo,
        fullName: row.fullName,
        className: row.className,
        fatherName: row.fatherName,
        motherName: row.motherName,
        phone: row.phone,
        email: row.email,
        photoUrl: row.photoUrl,
      })),
    ),
  );
  const teachers: TeacherRecordRow[] = JSON.parse(
    JSON.stringify(
      teacherRows.map((row) => ({
        id: row.id,
        teacherId: row.teacherId,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        designation: row.designation,
        photoUrl: row.photoUrl,
      })),
    ),
  );

  return (
    <LmsAdminShell
      session={session}
      active="registers"
      title="Verification Records"
      subtitle="School registers that verify self-registrations"
    >
      <VerificationRecordsManager
        initialStudents={students}
        initialTeachers={teachers}
        classNames={classNames}
      />
    </LmsAdminShell>
  );
}
