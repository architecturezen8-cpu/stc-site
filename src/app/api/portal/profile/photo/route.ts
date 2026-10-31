import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { ensureLmsPerson, findStudentRecordByAdmission } from "@/lib/lms-identity";
import { db } from "@/db";
import {
  lmsStudentRecords,
  lmsStudents,
  lmsTeacherRecords,
  lmsTeachers,
} from "@/db/schema-lms";
import {
  deletePhotoBlob,
  photoUrlFor,
  storePersonPhoto,
} from "@/lib/person-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.59.0 — SELF-SERVICE PROFILE PHOTO (the owner: "studentslatai option
 * ekak danna wei ... teacherslage profile walatath").
 *
 * POST /api/portal/profile/photo — multipart/form-data, field `file`.
 *   · STUDENT → their office register row (via admission no) gains the photo;
 *   · TEACHER → their staff register row (via staff code) gains the photo;
 *   · PARENT  → politely refused (parents have no register row; the account
 *     keeps its Google picture).
 *
 * The photo REPLACES any previous one: the old blob is deleted, the row's
 * photo_url is cache-busted, and the portals (profile card, teacher roster
 * wall) pick it up on the next load. JPG/PNG/WebP, 3 MB max.
 */
export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req, ["student", "teacher"]);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Sign in to change your photo." },
      { status: 401 },
    );
  }
  if (session.role !== "student" && session.role !== "teacher") {
    return NextResponse.json(
      { ok: false, error: "Parent accounts keep their Google profile photo." },
      { status: 403 },
    );
  }

  try {
    const form = await req.formData().catch(() => null);
    const fileEntry = form?.get("file");
    if (!form || !fileEntry || typeof fileEntry === "string") {
      return NextResponse.json(
        { ok: false, error: "Choose a photo to upload." },
        { status: 400 },
      );
    }

    let kind: "student" | "teacher";
    let rowId: number;
    let previousKey: string | null = null;

    if (session.role === "student") {
      const person = (await ensureLmsPerson("student", session.accountId)) as
        | typeof lmsStudents.$inferSelect
        | null;
      const record = person
        ? await findStudentRecordByAdmission(person.admissionNo)
        : null;
      if (!record) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Your office register row isn't linked yet — ask the school office to confirm your admission number, then try again.",
          },
          { status: 404 },
        );
      }
      kind = "student";
      rowId = record.id;
      previousKey = record.photoKey ?? null;
    } else {
      const teacher = (await ensureLmsPerson("teacher", session.accountId)) as
        | typeof lmsTeachers.$inferSelect
        | null;
      if (!teacher?.staffCode) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Your staff register row isn't linked yet — ask the school office to confirm your teacher ID, then try again.",
          },
          { status: 404 },
        );
      }
      const [record] = await db
        .select()
        .from(lmsTeacherRecords)
        .where(eq(lmsTeacherRecords.teacherId, teacher.staffCode))
        .limit(1);
      if (!record) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Your staff register row isn't linked yet — ask the school office to confirm your teacher ID, then try again.",
          },
          { status: 404 },
        );
      }
      kind = "teacher";
      rowId = record.id;
      previousKey = record.photoKey ?? null;
    }

    const stored = await storePersonPhoto(kind, rowId, fileEntry as File);
    if ("error" in stored) {
      return NextResponse.json({ ok: false, error: stored.error }, { status: 400 });
    }

    const photoUrl = photoUrlFor(kind, rowId);
    if (kind === "student") {
      await db
        .update(lmsStudentRecords)
        .set({ photoKey: stored.key, photoUrl })
        .where(eq(lmsStudentRecords.id, rowId));
    } else {
      await db
        .update(lmsTeacherRecords)
        .set({ photoKey: stored.key, photoUrl })
        .where(eq(lmsTeacherRecords.id, rowId));
    }

    await deletePhotoBlob(previousKey);

    return NextResponse.json({ ok: true, photoUrl }, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not upload the photo. Try again." },
      { status: 500 },
    );
  }
}
