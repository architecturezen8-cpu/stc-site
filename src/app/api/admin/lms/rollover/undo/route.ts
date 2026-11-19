import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsAssignments,
  lmsAssessments,
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsMaterials,
} from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS → Rollover UNDO (v2.8.64.0) — the "ran it too early" button.

   The rollover moves every active enrollment into the new year's classes
   and copies the teaching assignments across. When that happens before the
   school actually closes the year, teachers suddenly see "7-A" children who
   are really in 6-A. This endpoint reverses the LAST run for a target year:

     · every ACTIVE enrollment sitting in a target-year class moves back to
       the previous-year class one grade down with the same section
       (7-A → 6-A, 13-S-1 → 12-S-1) — the exact inverse of promote;
     · graduated/left rows that were moved into a target-year holding class
       are always restored; rows still sitting on their old-year class are
       re-activated only when the caller passes restoreLeavers;
     · the copied class_subjects rows of the target year are removed
       (unreferenced ones only) and every target-year class left with no
       students, no subjects and no history (timetable, attendance,
       notices, report cards) is deleted — the pre-run state, restored.

   HONEST LIMIT: the inverse of "promote" is assumed for everyone. A run
   that used "repeat" exceptions cannot be auto-undone (a repeater would go
   back one grade too far) — the endpoint refuses and says so.
   ──────────────────────────────────────────────────────────────────────── */

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim().slice(0, 9) : "";

/** "7-A" → "6-A", "13-S-1" → "12-S-1". Null when the name has no numeric
    grade prefix (QA classes etc.) — those can never be reverse-mapped. */
function originClassName(name: string): string | null {
  const m = name.match(/^(\d+)(-.*)$/);
  if (!m) return null;
  const grade = Number(m[1]);
  if (!Number.isInteger(grade) || grade <= 1) return null;
  return `${grade - 1}${m[2]}`;
}

type UndoPreview = {
  targetYear: string;
  prevYear: string;
  lastRunAt: string | null;
  lastRun: Record<string, unknown> | null;
  classesInTargetYear: number;
  activeRowsToMoveBack: number;
  movedLeaversToRestore: number;
  oldYearLeaverRows: number;
  missingOriginClasses: string[];
  blockedReason: string | null;
};

async function loadLastRun(targetYear: string) {
  const [row] = await db
    .select()
    .from(adminAuditLogs)
    .where(eq(adminAuditLogs.action, "lms_rollover_run"))
    .orderBy(desc(adminAuditLogs.id))
    .limit(1);
  if (!row) return null;
  if (clean(row.entityId) !== targetYear) return null; // the run being undone must match
  return row;
}

async function buildPreview(targetYear: string): Promise<UndoPreview> {
  const prevYear = /^\d+$/.test(targetYear) ? String(Number(targetYear) - 1) : "";

  const [targetClasses, prevClasses, lastRunRow] = await Promise.all([
    db
      .select({ id: lmsClasses.id, name: lmsClasses.name })
      .from(lmsClasses)
      .where(eq(lmsClasses.academicYear, targetYear)),
    db
      .select({ id: lmsClasses.id, name: lmsClasses.name })
      .from(lmsClasses)
      .where(eq(lmsClasses.academicYear, prevYear)),
    loadLastRun(targetYear),
  ]);

  const prevByName = new Map(prevClasses.map((c) => [c.name.toLowerCase(), c.name]));

  /* Every ACTIVE row in the target year + the origin class it would return to. */
  const activeRows = targetClasses.length
    ? await db
        .select({
          id: lmsEnrollments.id,
          classId: lmsEnrollments.classId,
          studentName: sql<string>`(select full_name from lms_students s where s.id = ${lmsEnrollments.studentId})`,
        })
        .from(lmsEnrollments)
        .where(
          and(
            inArray(
              lmsEnrollments.classId,
              targetClasses.map((c) => c.id),
            ),
            eq(lmsEnrollments.status, "active"),
          ),
        )
    : [];
  const targetNameById = new Map(targetClasses.map((c) => [c.id, c.name]));
  const missing = new Set<string>();
  for (const row of activeRows) {
    const current = targetNameById.get(row.classId) ?? "";
    const origin = current ? originClassName(current) : null;
    if (!origin || !prevByName.has(origin.toLowerCase())) {
      missing.add(origin ?? current ?? `class #${row.classId}`);
    }
  }

  /* Graduated/left rows still on their OLD-year classes (the run marked them
     in place) whose student has no other active enrollment — the checkbox set. */
  const oldLeaverRows = prevYear
    ? await db
        .select({ id: lmsEnrollments.id })
        .from(lmsEnrollments)
        .innerJoin(lmsClasses, eq(lmsEnrollments.classId, lmsClasses.id))
        .where(
          and(
            eq(lmsClasses.academicYear, prevYear),
            inArray(lmsEnrollments.status, ["graduated", "left"]),
            sql`not exists (select 1 from lms_enrollments a where a.student_id = ${lmsEnrollments.studentId} and a.status = 'active')`,
          ),
        )
    : [];

  /* Graduated/left rows that WERE moved into a target-year holding class —
     always restored by an undo. */
  const movedLeavers = targetClasses.length
    ? await db
        .select({ id: lmsEnrollments.id })
        .from(lmsEnrollments)
        .where(
          and(
            inArray(
              lmsEnrollments.classId,
              targetClasses.map((c) => c.id),
            ),
            inArray(lmsEnrollments.status, ["graduated", "left"]),
          ),
        )
    : [];

  const lastRun = (lastRunRow?.details ?? null) as Record<string, unknown> | null;
  const blockedReason =
    Number(lastRun?.repeated ?? 0) > 0
      ? `The last run marked ${lastRun?.repeated} student(s) as repeating — an automatic undo would send repeaters back one grade too far. Move those students manually, then undo.`
      : missing.size > 0
        ? `No ${prevYear} class exists for: ${[...missing].join(", ")}. Create those classes first (or ask the office to).`
        : null;

  return {
    targetYear,
    prevYear,
    lastRunAt: lastRunRow?.createdAt?.toISOString() ?? null,
    lastRun,
    classesInTargetYear: targetClasses.length,
    activeRowsToMoveBack: activeRows.length,
    movedLeaversToRestore: movedLeavers.length,
    oldYearLeaverRows: oldLeaverRows.length,
    missingOriginClasses: [...missing],
    blockedReason,
  };
}

/* ── GET — the undo preview for the confirmation card ────────────────── */

export async function GET(req: Request) {
  const denied = await guardPortalOrLmsAdmin("read");
  if (denied instanceof NextResponse) return denied;
  await ensureSchemaExtras();

  const url = new URL(req.url);
  const lastRow = (
    await db
      .select({ entityId: adminAuditLogs.entityId })
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.action, "lms_rollover_run"))
      .orderBy(desc(adminAuditLogs.id))
      .limit(1)
  )[0];
  const fallbackYear = clean(lastRow?.entityId);
  const targetYear = clean(url.searchParams.get("year")) || fallbackYear;
  if (!/^\d{4}$/.test(targetYear)) {
    return NextResponse.json({ error: "A four-digit target year is required." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...(await buildPreview(targetYear)) });
}

/* ── POST — run the undo inside ONE transaction ──────────────────────── */

type UndoResult = {
  targetYear: string;
  movedBack: number;
  reactivated: number;
  subjectsDeleted: number;
  classesDeleted: number;
  classesKept: string[];
};

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const targetYear = clean(body?.targetYear);
    const restoreLeavers = body?.restoreLeavers === true;
    if (!/^\d{4}$/.test(targetYear)) {
      return NextResponse.json({ error: "A four-digit target year is required." }, { status: 400 });
    }

    /* The preview gates the run — problems abort BEFORE anything is written. */
    const preview = await buildPreview(targetYear);
    if (preview.classesInTargetYear === 0) {
      return NextResponse.json(
        { error: `There are no ${targetYear} classes to undo — nothing was changed.` },
        { status: 400 },
      );
    }
    if (preview.blockedReason) {
      return NextResponse.json({ error: preview.blockedReason }, { status: 400 });
    }

    const result = await db.transaction(async (tx): Promise<UndoResult> => {
      const prevYear = preview.prevYear;

      /* a. name maps: target-year classes and previous-year classes. */
      const targetClasses = await tx
        .select({ id: lmsClasses.id, name: lmsClasses.name })
        .from(lmsClasses)
        .where(eq(lmsClasses.academicYear, targetYear));
      const prevClasses = await tx
        .select({ id: lmsClasses.id, name: lmsClasses.name })
        .from(lmsClasses)
        .where(eq(lmsClasses.academicYear, prevYear));
      const prevIdByName = new Map(
        prevClasses.map((c) => [c.name.toLowerCase(), c.id] as const),
      );
      const targetNameById = new Map(targetClasses.map((c) => [c.id, c.name] as const));
      const targetIds = targetClasses.map((c) => c.id);

      /* b. move every active enrollment back one grade, same section. */
      let movedBack = 0;
      if (targetIds.length > 0) {
        const activeRows = await tx
          .select({ id: lmsEnrollments.id, classId: lmsEnrollments.classId })
          .from(lmsEnrollments)
          .where(
            and(inArray(lmsEnrollments.classId, targetIds), eq(lmsEnrollments.status, "active")),
          );
        for (const row of activeRows) {
          const origin = originClassName(targetNameById.get(row.classId) ?? "");
          const originId = origin ? prevIdByName.get(origin.toLowerCase()) : undefined;
          if (!origin || originId === undefined) {
            /* Preview already checked this — belt and braces. */
            throw new Error(`Missing ${prevYear} class "${origin ?? "?"}" for the undo.`);
          }
          await tx
            .update(lmsEnrollments)
            .set({ classId: originId })
            .where(eq(lmsEnrollments.id, row.id));
          movedBack += 1;
        }
      }

      /* c. leavers: rows moved into a target-year holding class are always
            restored (status + class); old-year rows only on request. */
      let reactivated = 0;
      const restoreIn = async (classIds: number[]) => {
        if (classIds.length === 0) return;
        const rows = await tx
          .select({ id: lmsEnrollments.id, studentId: lmsEnrollments.studentId })
          .from(lmsEnrollments)
          .where(
            and(
              inArray(lmsEnrollments.classId, classIds),
              inArray(lmsEnrollments.status, ["graduated", "left"]),
              sql`not exists (select 1 from lms_enrollments a where a.student_id = ${lmsEnrollments.studentId} and a.status = 'active')`,
            ),
          );
        for (const row of rows) {
          await tx
            .update(lmsEnrollments)
            .set({ status: "active" })
            .where(eq(lmsEnrollments.id, row.id));
          reactivated += 1;
        }
      };
      await restoreIn(targetIds);
      if (restoreLeavers) {
        const prevIds = prevClasses.map((c) => c.id);
        await restoreIn(prevIds);
      }

      /* d. remove the copied teaching assignments of the target year —
            only the unreferenced ones (assignments/materials/assessments). */
      let subjectsDeleted = 0;
      if (targetIds.length > 0) {
        const referenced = new Set<number>();
        for (const table of [lmsAssignments, lmsMaterials, lmsAssessments]) {
          const rows = await tx
            .select({ csId: table.classSubjectId })
            .from(table)
            .where(
              inArray(
                table.classSubjectId,
                tx
                  .select({ id: lmsClassSubjects.id })
                  .from(lmsClassSubjects)
                  .where(inArray(lmsClassSubjects.classId, targetIds)),
              ),
            );
          for (const r of rows) referenced.add(r.csId);
        }
        const csRows = await tx
          .select({ id: lmsClassSubjects.id })
          .from(lmsClassSubjects)
          .where(inArray(lmsClassSubjects.classId, targetIds));
        const deletable = csRows.map((r) => r.id).filter((id) => !referenced.has(id));
        if (deletable.length > 0) {
          await tx.delete(lmsClassSubjects).where(inArray(lmsClassSubjects.id, deletable));
          subjectsDeleted = deletable.length;
        }
      }

      /* e. delete the target-year classes that are now truly empty — no
            students, no subjects, no timetable, attendance, notices or
            report cards. Referenced classes stay and are reported. */
      let classesDeleted = 0;
      const classesKept: string[] = [];
      if (targetIds.length > 0) {
        const remaining = await tx.execute(sql`
          SELECT cl.id, cl.name,
            (SELECT COUNT(*) FROM lms_enrollments e WHERE e.class_id = cl.id AND e.status = 'active') AS roll,
            (SELECT COUNT(*) FROM lms_class_subjects cs WHERE cs.class_id = cl.id) AS subjects,
            (SELECT COUNT(*) FROM lms_timetable_slots t WHERE t.class_id = cl.id) AS slots,
            (SELECT COUNT(*) FROM lms_attendance att WHERE att.class_id = cl.id) AS attendance,
            (SELECT COUNT(*) FROM lms_notices n WHERE n.class_id = cl.id) AS notices,
            (SELECT COUNT(*) FROM lms_report_cards rc WHERE rc.class_id = cl.id) AS report_cards
          FROM lms_classes cl
          WHERE cl.academic_year = ${targetYear}`);
        for (const row of remaining.rows as {
          id: number;
          name: string;
          roll: string;
          subjects: string;
          slots: string;
          attendance: string;
          notices: string;
          report_cards: string;
        }[]) {
          const empty =
            Number(row.roll) === 0 &&
            Number(row.subjects) === 0 &&
            Number(row.slots) === 0 &&
            Number(row.attendance) === 0 &&
            Number(row.notices) === 0 &&
            Number(row.report_cards) === 0;
          if (empty) {
            await tx.delete(lmsClasses).where(eq(lmsClasses.id, row.id));
            classesDeleted += 1;
          } else {
            classesKept.push(row.name);
          }
        }
      }

      /* f. audit. */
      await tx.insert(adminAuditLogs).values({
        userId: session.id,
        action: "lms_rollover_undo",
        entity: "lms_classes",
        entityId: targetYear,
        details: {
          targetYear,
          movedBack,
          reactivated,
          restoreLeavers,
          subjectsDeleted,
          classesDeleted,
          classesKept,
        },
      });

      return {
        targetYear,
        movedBack,
        reactivated,
        subjectsDeleted,
        classesDeleted,
        classesKept,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[lms-rollover-undo] failed:", err);
    return NextResponse.json(
      { error: "The undo failed — nothing was changed. Please try again." },
      { status: 500 },
    );
  }
}
