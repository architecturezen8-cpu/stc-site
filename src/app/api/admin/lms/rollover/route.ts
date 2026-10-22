import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsStudents,
  lmsTeacherRecords,
  lmsTeachers,
} from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS → Academic year rollover (the December/January promotion run)

   GET    the rollover workspace: every class with its roll + class teacher
          (bootstrap-style), the active students per class, the staff who
          can be picked as class teachers, and the current/target year.
   POST   run the promotion inside ONE transaction:
            · create (or idempotently reuse) each plan's target class in the
              target year, with its class teacher;
            · copy lms_class_subjects onto the new class (skip existing);
            · move active enrollments to the new-year class (promote), mark
              O/L & A/L leavers graduated, honour per-student exceptions
              (repeat into a same-grade new class / left school);
            · guard reruns — a student already sitting in a target-year
              class is never touched twice.

   Old-year class rows keep their history (attendance, notices…); empty
   classes simply fall out of the teachers' markable/notice/assignment
   lists through the active-roll guards in the portal read models.
   ──────────────────────────────────────────────────────────────────────── */

const GRADES = ["6", "7", "8", "9", "10", "11", "12", "13"];

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

/** All-or-nothing validation failure — the message lists EVERY problem. */
class RolloverError extends Error {}

type ClassMappingInput = {
  fromClassId: number;
  action: "promote" | "graduate";
  toGrade: string;
  toSection: string;
  classTeacherId: number | null;
};

type StudentExceptionInput = {
  studentId: number;
  fromClassId: number;
  mode: "promote" | "repeat" | "left";
};

type EnrollmentRow = { id: number; studentId: number; classId: number };

/* ── GET — the workspace payload ─────────────────────────────────────── */

export async function GET() {
  const denied = await guardPortalOrLmsAdmin("read");
  if (denied instanceof NextResponse) return denied;
  await ensureSchemaExtras();

  const [classRows, teacherRows, staffRecords, enrollRows, csRows] = await Promise.all([
    db.select().from(lmsClasses).limit(600),
    db
      .select({ id: lmsTeachers.id, staffCode: lmsTeachers.staffCode })
      .from(lmsTeachers)
      .limit(1500),
    db
      .select({ teacherId: lmsTeacherRecords.teacherId, fullName: lmsTeacherRecords.fullName })
      .from(lmsTeacherRecords)
      .limit(1200),
    db
      .select({
        studentId: lmsEnrollments.studentId,
        classId: lmsEnrollments.classId,
        fullName: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
      .where(eq(lmsEnrollments.status, "active"))
      .limit(6000),
    db
      .select({ classId: lmsClassSubjects.classId })
      .from(lmsClassSubjects)
      .limit(6000),
  ]);

  /* Teacher display names — the bootstrap convention: lms_teachers.staff_code
     joined to the office staff register for the human name. */
  const registerNameByCode = new Map(
    staffRecords.map((r) => [r.teacherId.toLowerCase(), r.fullName]),
  );
  const teacherNameById = new Map<number, string>();
  for (const t of teacherRows) {
    const code = (t.staffCode ?? "").toLowerCase();
    if (!code) continue;
    const name = registerNameByCode.get(code) ?? t.staffCode ?? "";
    if (name) teacherNameById.set(t.id, name);
  }

  /* Class-teacher picker options: register staff holding an lms_teachers row
     (same filter the LMS Setup ClassesTab uses). */
  const personIdByCode = new Map(
    teacherRows
      .filter((t) => t.staffCode)
      .map((t) => [(t.staffCode ?? "").toLowerCase(), t.id]),
  );
  const staff = staffRecords
    .map((r) => {
      const lmsTeacherId = personIdByCode.get(r.teacherId.toLowerCase()) ?? null;
      return lmsTeacherId ? { lmsTeacherId, fullName: r.fullName, teacherId: r.teacherId } : null;
    })
    .filter((s): s is { lmsTeacherId: number; fullName: string; teacherId: string } => s !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const rollByClass = new Map<number, number>();
  const students = enrollRows.map((e) => {
    rollByClass.set(e.classId, (rollByClass.get(e.classId) ?? 0) + 1);
    return {
      studentId: e.studentId,
      classId: e.classId,
      fullName: e.fullName,
      admissionNo: e.admissionNo,
    };
  });
  students.sort((a, b) => a.fullName.localeCompare(b.fullName, "en", { numeric: true }));

  const subjectsByClass = new Map<number, number>();
  for (const r of csRows) {
    subjectsByClass.set(r.classId, (subjectsByClass.get(r.classId) ?? 0) + 1);
  }

  /* Numeric-aware ordering: grade 6 → 13, anything unparseable last. */
  const gradeRank = (g: string) => {
    const n = parseInt(g, 10);
    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
  };
  const classes = classRows
    .map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      section: c.section,
      academicYear: c.academicYear,
      classTeacherId: c.classTeacherId,
      classTeacherName: c.classTeacherId
        ? (teacherNameById.get(c.classTeacherId) ?? null)
        : null,
      roll: rollByClass.get(c.id) ?? 0,
      subjectsCount: subjectsByClass.get(c.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        gradeRank(a.grade) - gradeRank(b.grade) ||
        a.name.localeCompare(b.name, "en", { numeric: true }),
    );

  const currentYear = classRows.reduce<string>((max, c) => {
    const n = parseInt(c.academicYear, 10);
    const m = parseInt(max, 10);
    if (Number.isNaN(n)) return max;
    if (Number.isNaN(m) || n > m) return c.academicYear;
    return max;
  }, "");
  const targetYear = /^\d+$/.test(currentYear) ? String(Number(currentYear) + 1) : currentYear;

  /* v2.8.64.0 — the undo card: the last rollover run, whether its target
     classes still exist, and how many graduated/left students it created
     on the old-year classes (restorable with one checkbox). */
  const [lastRunRow] = await db
    .select()
    .from(adminAuditLogs)
    .where(eq(adminAuditLogs.action, "lms_rollover_run"))
    .orderBy(desc(adminAuditLogs.id))
    .limit(1);
  let lastRollover: {
    at: string;
    targetYear: string;
    moved: number;
    graduated: number;
    repeated: number;
    left: number;
    classesCreated: number;
    restoreCount: number;
    classesStillThere: number;
  } | null = null;
  if (lastRunRow) {
    const details = (lastRunRow.details ?? {}) as Record<string, unknown>;
    const runYear = String(details.targetYear ?? lastRunRow.entityId ?? "");
    const prevYear = /^\d+$/.test(runYear) ? String(Number(runYear) - 1) : "";
    const [stillThere, restoreRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(lmsClasses)
        .where(eq(lmsClasses.academicYear, runYear)),
      prevYear
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(lmsEnrollments)
            .innerJoin(lmsClasses, eq(lmsEnrollments.classId, lmsClasses.id))
            .where(
              and(
                eq(lmsClasses.academicYear, prevYear),
                inArray(lmsEnrollments.status, ["graduated", "left"]),
                sql`not exists (select 1 from lms_enrollments a where a.student_id = ${lmsEnrollments.studentId} and a.status = 'active')`,
              ),
            )
        : Promise.resolve([{ count: 0 }]),
    ]);
    lastRollover = {
      at: lastRunRow.createdAt?.toISOString() ?? "",
      targetYear: runYear,
      moved: Number(details.moved ?? 0),
      graduated: Number(details.graduated ?? 0),
      repeated: Number(details.repeated ?? 0),
      left: Number(details.left ?? 0),
      classesCreated: Number(details.classesCreated ?? 0),
      restoreCount: restoreRows[0]?.count ?? 0,
      classesStillThere: stillThere[0]?.count ?? 0,
    };
  }

  return NextResponse.json({
    ok: true,
    currentYear,
    targetYear,
    grades: GRADES,
    classes,
    students,
    staff,
    lastRollover,
  });
}

/* ── POST — run the promotion ────────────────────────────────────────── */

type RolloverResult = {
  targetYear: string;
  classesCreated: { id: number; name: string }[];
  classesReused: string[];
  moved: number;
  graduated: number;
  repeated: number;
  left: number;
  alreadyMoved: number;
};

function parseBody(body: Record<string, unknown> | null): {
  targetYear: string;
  mappings: ClassMappingInput[];
  exceptions: StudentExceptionInput[];
} {
  const problems: string[] = [];

  const targetYear = clean(body?.targetYear, 9);
  if (!targetYear) problems.push("Target academic year is required.");

  const rawClasses = Array.isArray(body?.classes) ? body.classes : null;
  if (!rawClasses || rawClasses.length === 0) {
    problems.push("The plan has no classes — nothing to roll over.");
  }

  const mappings: ClassMappingInput[] = [];
  const seenClasses = new Set<number>();
  for (const raw of rawClasses ?? []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const fromClassId = Number(row.fromClassId);
    if (!Number.isInteger(fromClassId) || fromClassId <= 0) {
      problems.push("A plan row is missing its source class.");
      continue;
    }
    const action =
      row.action === "graduate" ? "graduate" : row.action === "promote" ? "promote" : null;
    if (!action) {
      problems.push(`Class #${fromClassId}: action must be "promote" or "graduate".`);
      continue;
    }
    if (seenClasses.has(fromClassId)) {
      problems.push(`Class #${fromClassId} appears more than once in the plan.`);
      continue;
    }
    seenClasses.add(fromClassId);

    const toGrade = clean(row.toGrade, 10);
    const toSection = clean(row.toSection, 10);
    if (action === "promote" && (!toGrade || !toSection)) {
      problems.push(
        `Class #${fromClassId}: promote needs both a target grade and a target section.`,
      );
    }

    let classTeacherId: number | null = null;
    if (
      row.classTeacherId !== null &&
      row.classTeacherId !== undefined &&
      row.classTeacherId !== ""
    ) {
      const parsed = Number(row.classTeacherId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        problems.push(`Class #${fromClassId}: invalid class teacher.`);
      } else {
        classTeacherId = parsed;
      }
    }

    mappings.push({ fromClassId, action, toGrade, toSection, classTeacherId });
  }

  const exceptions: StudentExceptionInput[] = [];
  const rawStudents = Array.isArray(body?.students) ? body.students : [];
  for (const raw of rawStudents) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const studentId = Number(row.studentId);
    const fromClassId = Number(row.fromClassId);
    const mode =
      row.mode === "repeat" || row.mode === "left" || row.mode === "promote" ? row.mode : null;
    if (!Number.isInteger(studentId) || studentId <= 0) {
      problems.push("A student exception is missing its student.");
      continue;
    }
    if (!Number.isInteger(fromClassId) || fromClassId <= 0) {
      problems.push(`Student #${studentId}: exception is missing the source class.`);
      continue;
    }
    if (!mode) {
      problems.push(
        `Student #${studentId}: exception mode must be "promote", "repeat" or "left".`,
      );
      continue;
    }
    exceptions.push({ studentId, fromClassId, mode });
  }

  if (problems.length > 0) {
    throw new RolloverError(problems.map((p, i) => `${i + 1}. ${p}`).join(" "));
  }

  return { targetYear, mappings, exceptions };
}

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const { targetYear, mappings, exceptions } = parseBody(body);

    const result = await db.transaction(async (tx): Promise<RolloverResult> => {
      const problems: string[] = [];

      /* ── a. validate the plan against the database ──────────────────── */
      const fromIds = [...new Set(mappings.map((m) => m.fromClassId))];
      const fromRows = fromIds.length
        ? await tx
            .select({
              id: lmsClasses.id,
              name: lmsClasses.name,
              grade: lmsClasses.grade,
              section: lmsClasses.section,
              academicYear: lmsClasses.academicYear,
            })
            .from(lmsClasses)
            .where(inArray(lmsClasses.id, fromIds))
        : [];
      const fromById = new Map(fromRows.map((c) => [c.id, c]));
      for (const id of fromIds) {
        if (!fromById.has(id)) problems.push(`Source class #${id} no longer exists.`);
      }
      for (const m of mappings) {
        const cls = fromById.get(m.fromClassId);
        if (cls && m.action === "promote" && (!m.toGrade || !m.toSection)) {
          problems.push(`${cls.name}: promote needs both a target grade and a target section.`);
        }
      }

      const teacherIds = [
        ...new Set(
          mappings
            .map((m) => m.classTeacherId)
            .filter((id): id is number => id !== null),
        ),
      ];
      if (teacherIds.length > 0) {
        const foundTeachers = await tx
          .select({ id: lmsTeachers.id })
          .from(lmsTeachers)
          .where(inArray(lmsTeachers.id, teacherIds));
        const foundSet = new Set(foundTeachers.map((t) => t.id));
        for (const id of teacherIds) {
          if (!foundSet.has(id)) {
            problems.push(`Chosen class teacher #${id} is not on the LMS staff list.`);
          }
        }
      }

      /* Full class map (every class, so the rerun guard can see years). */
      const allClassRows = await tx
        .select({
          id: lmsClasses.id,
          name: lmsClasses.name,
          grade: lmsClasses.grade,
          academicYear: lmsClasses.academicYear,
        })
        .from(lmsClasses);
      const classById = new Map(allClassRows.map((c) => [c.id, c]));

      /* Active enrollments: every student of the planned classes, plus every
         active row of the exception students (they may have moved classes
         between loading the wizard and running it). */
      const planEnrollRows: EnrollmentRow[] = fromIds.length
        ? await tx
            .select({
              id: lmsEnrollments.id,
              studentId: lmsEnrollments.studentId,
              classId: lmsEnrollments.classId,
            })
            .from(lmsEnrollments)
            .where(
              and(inArray(lmsEnrollments.classId, fromIds), eq(lmsEnrollments.status, "active")),
            )
        : [];
      const exceptionStudentIds = [...new Set(exceptions.map((e) => e.studentId))];
      const extraEnrollRows: EnrollmentRow[] = exceptionStudentIds.length
        ? await tx
            .select({
              id: lmsEnrollments.id,
              studentId: lmsEnrollments.studentId,
              classId: lmsEnrollments.classId,
            })
            .from(lmsEnrollments)
            .where(
              and(
                inArray(lmsEnrollments.studentId, exceptionStudentIds),
                eq(lmsEnrollments.status, "active"),
              ),
            )
        : [];
      const enrollById = new Map<number, EnrollmentRow>();
      for (const row of [...planEnrollRows, ...extraEnrollRows]) enrollById.set(row.id, row);
      const enrollByClass = new Map<number, EnrollmentRow[]>();
      const enrollByStudent = new Map<number, EnrollmentRow[]>();
      for (const row of enrollById.values()) {
        const byClass = enrollByClass.get(row.classId) ?? [];
        byClass.push(row);
        enrollByClass.set(row.classId, byClass);
        const byStudent = enrollByStudent.get(row.studentId) ?? [];
        byStudent.push(row);
        enrollByStudent.set(row.studentId, byStudent);
      }

      /* Exception students must exist and belong to a planned class. */
      const studentRows = exceptionStudentIds.length
        ? await tx
            .select({
              id: lmsStudents.id,
              fullName: lmsStudents.fullName,
              admissionNo: lmsStudents.admissionNo,
            })
            .from(lmsStudents)
            .where(inArray(lmsStudents.id, exceptionStudentIds))
        : [];
      const studentById = new Map(studentRows.map((s) => [s.id, s]));
      const planIds = new Set(fromIds);
      for (const e of exceptions) {
        const student = studentById.get(e.studentId);
        if (!student) {
          problems.push(`Student #${e.studentId} in the exceptions list does not exist.`);
          continue;
        }
        if (!planIds.has(e.fromClassId)) {
          problems.push(
            `${student.fullName} (${student.admissionNo}) is filed under class #${e.fromClassId}, which is not part of the plan.`,
          );
        }
      }

      /* "Repeat" needs a promote target in the SAME grade as the student's
         current class — validated upfront so the run never half-happens. */
      const repeatMappingByGrade = new Map<string, ClassMappingInput>();
      for (const m of mappings) {
        if (m.action === "promote" && m.toGrade && !repeatMappingByGrade.has(m.toGrade)) {
          repeatMappingByGrade.set(m.toGrade, m);
        }
      }
      for (const e of exceptions) {
        if (e.mode !== "repeat") continue;
        const student = studentById.get(e.studentId);
        if (!student) continue;
        const rows = enrollByStudent.get(e.studentId) ?? [];
        const row = rows.find((r) => r.classId === e.fromClassId) ?? rows[0];
        if (!row) continue; // nothing active to move — skipped at apply time
        const currentGrade = classById.get(row.classId)?.grade ?? "";
        if (!currentGrade || !repeatMappingByGrade.has(currentGrade)) {
          problems.push(
            currentGrade
              ? `${student.fullName} (${student.admissionNo}) repeats Grade ${currentGrade}, but the plan creates no new Grade ${currentGrade} class.`
              : `${student.fullName} (${student.admissionNo}) has no current class grade to repeat into.`,
          );
        }
      }

      if (problems.length > 0) {
        throw new RolloverError(problems.map((p, i) => `${i + 1}. ${p}`).join(" "));
      }

      /* ── b. resolve / create the target classes (idempotent) ────────── */
      const targetByKey = new Map<string, { id: number; name: string; created: boolean }>();
      const resolveTarget = async (m: ClassMappingInput) => {
        const name = `${m.toGrade}-${m.toSection}`;
        const key = name.toLowerCase();
        const remembered = targetByKey.get(key);
        if (remembered) return remembered;

        const [found] = await tx
          .select({ id: lmsClasses.id, name: lmsClasses.name })
          .from(lmsClasses)
          .where(
            and(sql`lower(${lmsClasses.name}) = ${key}`, eq(lmsClasses.academicYear, targetYear)),
          )
          .limit(1);
        if (found) {
          const entry = { id: found.id, name: found.name, created: false };
          targetByKey.set(key, entry);
          return entry;
        }

        const [inserted] = await tx
          .insert(lmsClasses)
          .values({
            name,
            grade: m.toGrade,
            section: m.toSection,
            academicYear: targetYear,
            classTeacherId: m.classTeacherId,
          })
          .returning({ id: lmsClasses.id, name: lmsClasses.name });
        const entry = { id: inserted.id, name: inserted.name, created: true };
        targetByKey.set(key, entry);
        return entry;
      };

      const targetByMapping = new Map<number, { id: number; name: string; created: boolean }>();
      for (const m of mappings) {
        if (m.action === "promote" && m.toGrade && m.toSection) {
          targetByMapping.set(m.fromClassId, await resolveTarget(m));
        } else if (m.action === "graduate" && m.toGrade && m.toSection) {
          /* Optional: a graduate plan may still name a holding class. */
          targetByMapping.set(m.fromClassId, await resolveTarget(m));
        }
      }

      /* ── c. copy teaching assignments onto each new class ───────────── */
      for (const m of mappings) {
        const target = targetByMapping.get(m.fromClassId);
        if (!target) continue;
        const csRows = await tx
          .select({
            subjectId: lmsClassSubjects.subjectId,
            teacherId: lmsClassSubjects.teacherId,
          })
          .from(lmsClassSubjects)
          .where(eq(lmsClassSubjects.classId, m.fromClassId));
        if (csRows.length === 0) continue;
        await tx
          .insert(lmsClassSubjects)
          .values(
            csRows.map((r) => ({
              classId: target.id,
              subjectId: r.subjectId,
              teacherId: r.teacherId,
            })),
          )
          /* (class_id, subject_id) unique — pairs already on the target are
             skipped, so reruns stay idempotent. */
          .onConflictDoNothing();
      }

      /* ── d. move the students ───────────────────────────────────────── */
      let moved = 0;
      let graduated = 0;
      let repeated = 0;
      let left = 0;
      let alreadyMoved = 0;

      const exceptionByStudent = new Map(exceptions.map((e) => [e.studentId, e]));

      const applyStudent = async (
        enrollment: EnrollmentRow,
        mapping: ClassMappingInput | null,
        exception: StudentExceptionInput | null,
      ) => {
        /* Rerun guard: already sitting in a target-year class → skip. */
        const activeRows = enrollByStudent.get(enrollment.studentId) ?? [];
        if (activeRows.some((r) => classById.get(r.classId)?.academicYear === targetYear)) {
          alreadyMoved += 1;
          return;
        }

        /* mode: a repeat/left exception wins; "promote" = follow the class. */
        const followAction = mapping ? mapping.action : null;
        const mode = exception && exception.mode !== "promote" ? exception.mode : followAction;
        if (!mode) {
          alreadyMoved += 1; // follow-class exception, but the class isn't planned
          return;
        }

        if (mode === "left") {
          await tx
            .update(lmsEnrollments)
            .set({ status: "left" })
            .where(eq(lmsEnrollments.id, enrollment.id));
          left += 1;
          return;
        }

        if (mode === "repeat") {
          const currentGrade = classById.get(enrollment.classId)?.grade ?? "";
          const repeatMapping = repeatMappingByGrade.get(currentGrade);
          const repeatTarget = repeatMapping
            ? targetByMapping.get(repeatMapping.fromClassId)
            : undefined;
          if (!repeatTarget) {
            alreadyMoved += 1; // validated upfront; belt-and-braces
            return;
          }
          await tx
            .update(lmsEnrollments)
            .set({ classId: repeatTarget.id })
            .where(eq(lmsEnrollments.id, enrollment.id));
          repeated += 1;
          return;
        }

        const target = mapping ? targetByMapping.get(mapping.fromClassId) : undefined;
        if (mode === "graduate") {
          if (target) {
            await tx
              .update(lmsEnrollments)
              .set({ classId: target.id, status: "graduated" })
              .where(eq(lmsEnrollments.id, enrollment.id));
          } else {
            await tx
              .update(lmsEnrollments)
              .set({ status: "graduated" })
              .where(eq(lmsEnrollments.id, enrollment.id));
          }
          graduated += 1;
          return;
        }

        if (!target) {
          alreadyMoved += 1; // promote plan without a resolvable target
          return;
        }
        await tx
          .update(lmsEnrollments)
          .set({ classId: target.id })
          .where(eq(lmsEnrollments.id, enrollment.id));
        moved += 1;
      };

      /* Planned classes first (students following their class plan), then any
         exception students whose active row sits on an unplanned class. */
      const processed = new Set<number>();
      for (const m of mappings) {
        for (const enrollment of enrollByClass.get(m.fromClassId) ?? []) {
          if (processed.has(enrollment.id)) continue;
          processed.add(enrollment.id);
          await applyStudent(enrollment, m, exceptionByStudent.get(enrollment.studentId) ?? null);
        }
      }
      for (const e of exceptions) {
        for (const enrollment of enrollByStudent.get(e.studentId) ?? []) {
          if (processed.has(enrollment.id)) continue;
          processed.add(enrollment.id);
          await applyStudent(enrollment, null, e);
        }
      }

      const classesCreated = [...targetByKey.values()]
        .filter((t) => t.created)
        .map((t) => ({ id: t.id, name: t.name }));
      const classesReused = [...targetByKey.values()]
        .filter((t) => !t.created)
        .map((t) => t.name);

      /* ── e. audit ───────────────────────────────────────────────────── */
      await tx.insert(adminAuditLogs).values({
        userId: session.id,
        action: "lms_rollover_run",
        entity: "lms_classes",
        entityId: targetYear,
        details: {
          targetYear,
          classesCreated: classesCreated.length,
          classesReused: classesReused.length,
          moved,
          graduated,
          repeated,
          left,
          alreadyMoved,
        },
      });

      return {
        targetYear,
        classesCreated,
        classesReused,
        moved,
        graduated,
        repeated,
        left,
        alreadyMoved,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RolloverError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[lms-rollover] run failed:", err);
    return NextResponse.json(
      { error: "The rollover run failed — nothing was changed. Please try again." },
      { status: 500 },
    );
  }
}
