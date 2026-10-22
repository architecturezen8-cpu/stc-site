import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import { getPrivateStorage } from "@/lib/storage";
import { db } from "@/db";
import {
  lmsAssignmentFiles,
  lmsAssignmentGroupMembers,
  lmsAssignments,
  lmsClassSubjects,
  lmsEnrollments,
  lmsMaterialFiles,
  lmsMaterials,
  lmsParentChildren,
  lmsParents,
  lmsStudents,
  lmsSubmissionFiles,
  lmsSubmissions,
  lmsTeachers,
} from "@/db/schema-lms";
import { and, eq, inArray } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.43.0 — SERVES one classroom file, authorization-checked.
 * v2.8.45.0 — also serves MATERIAL files (lms_material_files).
 * v2.8.46.0 — Phase 3.2: parents of LINKED children may now read the
 * class files of work their child can see, and their own child's
 * submission files (read-only — parents never upload).
 *
 * Privacy rule: class work is NOT public. A request passes only when the
 * caller holds a live session that entitles them to that exact file:
 *   · lms_assignment_files  → the posting teacher, students enrolled in
 *     the assignment's class, a parent of a LINKED child enrolled in
 *     that class, or the LMS admin team;
 *   · lms_material_files    → the posting teacher, enrolled students of
 *     the material's class, or the LMS admin team;
 *   · lms_submission_files  → the submitting student, a parent of THAT
 *     student, that assignment's teacher, or the LMS admin team.
 * Object keys are unguessable UUIDs, but the check is by REFERENCE not by
 * secrecy — an unattached key 404s even for a signed-in user.
 */
export async function GET(req: Request) {
  const portal = await getPortalSession();
  const lmsAdmin = portal ? null : await getLmsAdminSession();
  if (!portal && !lmsAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const accountId = portal?.accountId ?? lmsAdmin?.accountId ?? 0;
  const role = portal?.role ?? "lms_admin";

  /* student rows are looked up at most once per request */
  const studentId =
    role === "student" ? await studentIdForAccount(accountId) : -1;
  /* v2.8.46.0 — linked children of a parent, resolved at most once */
  const linkedStudentIds =
    role === "parent" ? await parentStudentIdsForAccount(accountId) : [];

  const key = new URL(req.url).searchParams.get("key") || "";
  if (!key.startsWith("lms-work/") || key.length > 200) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const [teacherFile] = await db
      .select({
        fileName: lmsAssignmentFiles.fileName,
        mimeType: lmsAssignmentFiles.mimeType,
        assignmentId: lmsAssignmentFiles.assignmentId,
      })
      .from(lmsAssignmentFiles)
      .where(eq(lmsAssignmentFiles.objectKey, key))
      .limit(1);

    let fileName: string;
    let mimeType: string;

    if (teacherFile) {
      const [anchor] = await db
        .select({
          teacherAccountId: lmsTeachers.accountId,
          classId: lmsClassSubjects.classId,
        })
        .from(lmsAssignments)
        .innerJoin(lmsClassSubjects, eq(lmsAssignments.classSubjectId, lmsClassSubjects.id))
        .innerJoin(lmsTeachers, eq(lmsClassSubjects.teacherId, lmsTeachers.id))
        .where(eq(lmsAssignments.id, teacherFile.assignmentId))
        .limit(1);
      if (!anchor) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }

      let allowed = role === "lms_admin" || anchor.teacherAccountId === accountId;
      if (!allowed && role === "student" && studentId > 0) {
        const [enrolled] = await db
          .select({ id: lmsEnrollments.id })
          .from(lmsEnrollments)
          .where(
            and(
              eq(lmsEnrollments.studentId, studentId),
              eq(lmsEnrollments.classId, anchor.classId),
              eq(lmsEnrollments.status, "active"),
            ),
          )
          .limit(1);
        allowed = Boolean(enrolled);
      }
      /* v2.8.46.0 — a parent of a linked child enrolled in this class */
      if (!allowed && role === "parent" && linkedStudentIds.length > 0) {
        const [enrolled] = await db
          .select({ id: lmsEnrollments.id })
          .from(lmsEnrollments)
          .where(
            and(
              inArray(lmsEnrollments.studentId, linkedStudentIds),
              eq(lmsEnrollments.classId, anchor.classId),
              eq(lmsEnrollments.status, "active"),
            ),
          )
          .limit(1);
        allowed = Boolean(enrolled);
      }
      if (!allowed) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      fileName = teacherFile.fileName;
      mimeType = teacherFile.mimeType;
    } else {
      /* v2.8.45.0 — material files: the posting teacher, students enrolled
         in the material's class, or the LMS admin team. */
      const [materialFile] = await db
        .select({
          fileName: lmsMaterialFiles.fileName,
          mimeType: lmsMaterialFiles.mimeType,
          materialId: lmsMaterialFiles.materialId,
        })
        .from(lmsMaterialFiles)
        .where(eq(lmsMaterialFiles.objectKey, key))
        .limit(1);

      if (materialFile) {
        const [anchor] = await db
          .select({
            teacherAccountId: lmsTeachers.accountId,
            classId: lmsClassSubjects.classId,
          })
          .from(lmsMaterials)
          .innerJoin(
            lmsClassSubjects,
            eq(lmsMaterials.classSubjectId, lmsClassSubjects.id),
          )
          .innerJoin(lmsTeachers, eq(lmsClassSubjects.teacherId, lmsTeachers.id))
          .where(eq(lmsMaterials.id, materialFile.materialId))
          .limit(1);
        if (!anchor) {
          return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        }

        let allowed = role === "lms_admin" || anchor.teacherAccountId === accountId;
        if (!allowed && role === "student" && studentId > 0) {
          const [enrolled] = await db
            .select({ id: lmsEnrollments.id })
            .from(lmsEnrollments)
            .where(
              and(
                eq(lmsEnrollments.studentId, studentId),
                eq(lmsEnrollments.classId, anchor.classId),
                eq(lmsEnrollments.status, "active"),
              ),
            )
            .limit(1);
          allowed = Boolean(enrolled);
        }
        if (!allowed) {
          return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        fileName = materialFile.fileName;
        mimeType = materialFile.mimeType;
      } else {
        const [submissionFile] = await db
          .select({
            fileName: lmsSubmissionFiles.fileName,
            mimeType: lmsSubmissionFiles.mimeType,
            studentId: lmsSubmissionFiles.studentId,
            assignmentId: lmsSubmissionFiles.assignmentId,
            submissionId: lmsSubmissionFiles.submissionId,
          })
          .from(lmsSubmissionFiles)
          .where(eq(lmsSubmissionFiles.objectKey, key))
          .limit(1);
        if (!submissionFile) {
          return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
        }

        let allowed =
          role === "lms_admin" ||
          (role === "student" && studentId === submissionFile.studentId) ||
          /* v2.8.46.0 — the parent of the child who owns this answer */
          (role === "parent" && linkedStudentIds.includes(submissionFile.studentId));
        /* v2.8.57.0 — Phase 4.1: GROUP answers — every member of the team
           that owns this submission reads its files, whoever uploaded. */
        if (!allowed && role === "student" && studentId > 0) {
          const [subRow] = await db
            .select({ groupId: lmsSubmissions.groupId })
            .from(lmsSubmissions)
            .where(eq(lmsSubmissions.id, submissionFile.submissionId))
            .limit(1);
          if (subRow?.groupId != null) {
            const [member] = await db
              .select({ id: lmsAssignmentGroupMembers.id })
              .from(lmsAssignmentGroupMembers)
              .where(
                and(
                  eq(lmsAssignmentGroupMembers.groupId, subRow.groupId),
                  eq(lmsAssignmentGroupMembers.studentId, studentId),
                ),
              )
              .limit(1);
            allowed = Boolean(member);
          }
        }
        if (!allowed && role === "teacher") {
          const [owned] = await db
            .select({ id: lmsAssignments.id })
            .from(lmsAssignments)
            .innerJoin(lmsClassSubjects, eq(lmsAssignments.classSubjectId, lmsClassSubjects.id))
            .innerJoin(lmsTeachers, eq(lmsClassSubjects.teacherId, lmsTeachers.id))
            .where(
              and(
                eq(lmsAssignments.id, submissionFile.assignmentId),
                eq(lmsTeachers.accountId, accountId),
              ),
            )
            .limit(1);
          allowed = Boolean(owned);
        }
        if (!allowed) {
          return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        fileName = submissionFile.fileName;
        mimeType = submissionFile.mimeType;
      }
    }

    const buffer = await getPrivateStorage().getObject(key);
    const safeName = fileName.replace(/[\r\n"\\]/g, "_");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}

/** account_id → lms_students.id (−1 when the account has no student row). */
async function studentIdForAccount(accountId: number): Promise<number> {
  const [row] = await db
    .select({ id: lmsStudents.id })
    .from(lmsStudents)
    .where(eq(lmsStudents.accountId, accountId))
    .limit(1);
  return row?.id ?? -1;
}

/** v2.8.46.0 — account_id → the lms_students.id values linked as children. */
async function parentStudentIdsForAccount(accountId: number): Promise<number[]> {
  const rows = await db
    .select({ studentId: lmsParentChildren.studentId })
    .from(lmsParentChildren)
    .innerJoin(lmsParents, eq(lmsParentChildren.parentId, lmsParents.id))
    .where(eq(lmsParents.accountId, accountId));
  return rows.map((r) => r.studentId);
}
