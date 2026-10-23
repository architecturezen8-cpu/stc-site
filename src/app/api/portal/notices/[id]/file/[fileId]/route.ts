import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { db } from "@/db";
import {
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsParentChildren,
  lmsParents,
  lmsStudents,
  lmsTeachers,
} from "@/db/schema-lms";
import { getNoticeFileRow } from "@/lib/portal-classroom";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; fileId: string }> };

/**
 * v2.8.59.0 — the ONLY door to a notice attachment's bytes.
 *
 * GET /api/portal/notices/[id]/file/[fileId] streams ONE file attached to a
 * class notice — after the SAME audience contract the notice itself reads by:
 *   · the STUDENT actively enrolled in the notice's class;
 *   · a PARENT of such a student;
 *   · a TEACHER who teaches any subject of that class or leads it (plus the
 *     notice's poster);
 *   · everyone else → 401/403/404 with no existence leak.
 *
 * The fileId param is double-checked against the notice id, so a file can
 * never be reached through a different notice's URL.
 */
export async function GET(req: Request, ctx: Ctx) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const noticeId = Number((await ctx.params).id);
  const fileId = Number((await ctx.params).fileId);
  if (
    !Number.isInteger(noticeId) || noticeId <= 0 ||
    !Number.isInteger(fileId) || fileId <= 0
  ) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const row = await getNoticeFileRow(fileId);
    if (!row || row.noticeId !== noticeId) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const classId = row.classId;
    let allowed = false;

    if (session.role === "student") {
      const student = (await ensureLmsPerson("student", session.accountId)) as
        | typeof lmsStudents.$inferSelect
        | null;
      if (student) {
        const [enrolled] = await db
          .select({ id: lmsEnrollments.id })
          .from(lmsEnrollments)
          .where(
            and(
              eq(lmsEnrollments.classId, classId),
              eq(lmsEnrollments.studentId, student.id),
              eq(lmsEnrollments.status, "active"),
            ),
          )
          .limit(1);
        allowed = Boolean(enrolled);
      }
    } else if (session.role === "parent") {
      const parent = (await ensureLmsPerson("parent", session.accountId)) as
        | typeof lmsParents.$inferSelect
        | null;
      if (parent) {
        const links = await db
          .select({ studentId: lmsParentChildren.studentId })
          .from(lmsParentChildren)
          .where(eq(lmsParentChildren.parentId, parent.id));
        for (const link of links) {
          const [enrolled] = await db
            .select({ id: lmsEnrollments.id })
            .from(lmsEnrollments)
            .where(
              and(
                eq(lmsEnrollments.classId, classId),
                eq(lmsEnrollments.studentId, link.studentId),
                eq(lmsEnrollments.status, "active"),
              ),
            )
            .limit(1);
          if (enrolled) {
            allowed = true;
            break;
          }
        }
      }
    } else if (session.role === "teacher") {
      if (row.createdBy === session.accountId) {
        allowed = true;
      } else {
        const teacher = (await ensureLmsPerson("teacher", session.accountId)) as
          | typeof lmsTeachers.$inferSelect
          | null;
        if (teacher) {
          const [teaches] = await db
            .select({ id: lmsClassSubjects.id })
            .from(lmsClassSubjects)
            .where(
              and(
                eq(lmsClassSubjects.classId, classId),
                eq(lmsClassSubjects.teacherId, teacher.id),
              ),
            )
            .limit(1);
          if (teaches) {
            allowed = true;
          } else {
            const [led] = await db
              .select({ id: lmsClasses.id })
              .from(lmsClasses)
              .where(
                and(eq(lmsClasses.id, classId), eq(lmsClasses.classTeacherId, teacher.id)),
              )
              .limit(1);
            allowed = Boolean(led);
          }
        }
      }
    }

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    let bytes: Buffer;
    try {
      bytes = await getStorage().getObject(row.objectKey);
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
