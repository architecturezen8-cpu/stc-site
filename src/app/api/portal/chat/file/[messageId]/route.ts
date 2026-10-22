import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { db } from "@/db";
import {
  lmsAssignmentQuestions,
  lmsAssignments,
  lmsClassSubjects,
  lmsEnrollments,
  lmsStudents,
  lmsTeachers,
} from "@/db/schema-lms";
import { getPrivateStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ messageId: string }> };

/**
 * v2.8.53.0 — the ONLY door to a chat attachment's bytes.
 *
 * GET /api/portal/chat/file/[messageId] streams the ONE file attached to a
 * Q&A message — after the SAME privacy contract as every chat path:
 *   · the STUDENT who owns the thread (and is still actively enrolled);
 *   · a TEACHER whose class×subject owns the assignment;
 *   · parents and everyone else → 401/403/404 with no existence leak.
 *
 * Soft-deleted messages lost their file reference (and their blob), so the
 * "message deleted" stub can never serve bytes.
 */
export async function GET(req: Request, ctx: Ctx) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "student" && session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const messageId = Number((await ctx.params).messageId);
  if (!Number.isInteger(messageId) || messageId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const [row] = await db
      .select({
        objectKey: lmsAssignmentQuestions.objectKey,
        fileName: lmsAssignmentQuestions.fileName,
        mimeType: lmsAssignmentQuestions.mimeType,
        studentId: lmsAssignmentQuestions.studentId,
        classId: lmsClassSubjects.classId,
        teacherId: lmsClassSubjects.teacherId,
        isActive: lmsAssignments.isActive,
      })
      .from(lmsAssignmentQuestions)
      .innerJoin(
        lmsAssignments,
        eq(lmsAssignments.id, lmsAssignmentQuestions.assignmentId),
      )
      .innerJoin(
        lmsClassSubjects,
        eq(lmsClassSubjects.id, lmsAssignments.classSubjectId),
      )
      .where(
        and(
          eq(lmsAssignmentQuestions.id, messageId),
          isNull(lmsAssignmentQuestions.deletedAt),
        ),
      )
      .limit(1);

    if (!row || !row.isActive) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    if (session.role === "student") {
      const student = (await ensureLmsPerson("student", session.accountId)) as
        | typeof lmsStudents.$inferSelect
        | null;
      if (!student || student.id !== row.studentId) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      const [enrolled] = await db
        .select({ id: lmsEnrollments.id })
        .from(lmsEnrollments)
        .where(
          and(
            eq(lmsEnrollments.classId, row.classId),
            eq(lmsEnrollments.studentId, student.id),
            eq(lmsEnrollments.status, "active"),
          ),
        )
        .limit(1);
      if (!enrolled) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
    } else {
      const teacher = (await ensureLmsPerson("teacher", session.accountId)) as
        | typeof lmsTeachers.$inferSelect
        | null;
      if (!teacher || teacher.id !== row.teacherId) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
    }

    if (!row.objectKey || !row.fileName) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    let bytes: Buffer;
    try {
      bytes = await getPrivateStorage().getObject(row.objectKey);
    } catch {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const asciiName = row.fileName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_");
    const utf8Name = encodeURIComponent(row.fileName);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": row.mimeType ?? "application/octet-stream",
        "content-disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        "cache-control": "private, no-store",
        "content-length": String(bytes.length),
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the file." },
      { status: 500 },
    );
  }
}
