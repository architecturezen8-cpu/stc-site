import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsClasses,
  lmsEnrollments,
  lmsPortalAccounts,
  lmsStudents,
  lmsTeachers,
} from "@/db/schema-lms";
import { ledByFilter } from "@/lib/portal-class-teacher";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/**
 * v2.9.15.0 — extracted from the teacher dashboard page so the dedicated
 * "Student passwords" side-panel section (/teacher/passwords) and any other
 * surface can share the same class-teacher-scoped roster.
 *
 * The class-teacher fallback of D.1: students whose account carries the
 * synthetic adm-… identity (no reachable email) get their password reset by
 * the teacher who LEADS their class (class teacher OR assistant — the same
 * ledByFilter gate the reset API enforces; subject teachers get none of it).
 * Empty when the teacher leads nothing — callers simply render nothing.
 */
export async function getTeacherResetRoster(teacherAccountId: number) {
  await ensureSchemaExtras();
  const [teacher] = await db
    .select({ id: lmsTeachers.id })
    .from(lmsTeachers)
    .where(eq(lmsTeachers.accountId, teacherAccountId))
    .limit(1);
  if (!teacher) return [];

  const ledClasses = await db
    .select({ id: lmsClasses.id })
    .from(lmsClasses)
    .where(ledByFilter(teacher.id)); // class teacher OR assistant, ALL their classes
  if (ledClasses.length === 0) return [];
  const ledClassIds = ledClasses.map((row) => row.id);

  const [classes, rows] = await Promise.all([
    db
      .select({ id: lmsClasses.id, name: lmsClasses.name })
      .from(lmsClasses)
      .where(inArray(lmsClasses.id, ledClassIds)),
    db
      .select({
        classId: lmsEnrollments.classId,
        accountId: lmsPortalAccounts.id,
        name: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
      .innerJoin(lmsPortalAccounts, eq(lmsStudents.accountId, lmsPortalAccounts.id))
      .where(
        and(
          inArray(lmsEnrollments.classId, ledClassIds),
          eq(lmsEnrollments.status, "active"),
          eq(lmsPortalAccounts.active, true),
        ),
      ),
  ]);

  const nameById = new Map(classes.map((c) => [c.id, c.name] as const));
  type RosterRow = { accountId: number; name: string; admissionNo: string };
  const groups = new Map<string, RosterRow[]>();
  for (const row of rows) {
    const className = nameById.get(row.classId) || `Class #${row.classId}`;
    const list = groups.get(className) || [];
    list.push({
      accountId: row.accountId,
      name: row.name,
      admissionNo: row.admissionNo,
    });
    groups.set(className, list);
  }
  return Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([className, students]) => ({
      className,
      students: students.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
