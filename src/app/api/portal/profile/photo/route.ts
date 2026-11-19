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
import { deletePortalAvatar, storePortalAvatar } from "@/lib/portal-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.59.0 — SELF-SERVICE PROFILE PHOTO (the owner: "studentslatai option
 * ekak danna wei ... teacherslage profile walatath").
 *
 * v2.9.15.6 — EVERY portal role can now manage their own photo from the
 * profile's Photo Studio popup (the owner: "dan admin,parent,lms-admin,
 * student,teacher,principal acc wala profile photo eka daddi nikanma
 * upload karala danna witharai thiyenne"):
 *
 * POST /api/portal/profile/photo — multipart/form-data, field `file`.
 *   · STUDENT → their office register row (via admission no) gains the photo;
 *   · TEACHER → their staff register row (via staff code) gains the photo;
 *   · PARENT / PRINCIPAL → the ACCOUNT row gains a private avatar under
 *     portal-avatars/ (they have no register row; the Google picture stays
 *     untouched underneath and steps back in if the upload is removed).
 *
 * DELETE /api/portal/profile/photo — removes the caller's photo:
 *   · student/teacher → the register row's photo_key clears + the blob is
 *     deleted (the bytes actually leave the bucket — no silent orphans);
 *   · parent/principal → the account avatar clears + the blob is deleted,
 *     the Google picture steps back in.
 *
 * An upload REPLACES any previous one: the old blob is deleted, the
 * display URL is cache-busted, and the portals pick it up on the next
 * load. JPG/PNG/WebP, 3 MB max.
 */
const ACCOUNT_ROLES = new Set(["parent", "principal"]);

export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req, [
    "student",
    "teacher",
    "parent",
    "principal",
  ]);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Sign in to change your photo." },
      { status: 401 },
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

    /* v2.9.15.6 — parents + principals hang the photo on the ACCOUNT row. */
    if (ACCOUNT_ROLES.has(session.role)) {
      const stored = await storePortalAvatar(
        session.accountId,
        fileEntry as File,
      );
      if ("error" in stored) {
        return NextResponse.json({ ok: false, error: stored.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, photoUrl: stored.displayUrl }, { status: 201 });
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

/**
 * v2.9.15.6 — REMOVE the caller's own photo. Students/teachers clear the
 * register row; parents/principals clear the account avatar (the Google
 * picture steps back in). Both paths delete the real blob + mark the
 * storage ledger, so the bucket and the Storage page agree.
 */
export async function DELETE(req: Request) {
  const session = await getPortalSessionForRequest(req, [
    "student",
    "teacher",
    "parent",
    "principal",
  ]);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Sign in first." },
      { status: 401 },
    );
  }

  try {
    if (ACCOUNT_ROLES.has(session.role)) {
      await deletePortalAvatar(session.accountId);
      return NextResponse.json({ ok: true });
    }

    if (session.role === "student") {
      const person = (await ensureLmsPerson("student", session.accountId)) as
        | typeof lmsStudents.$inferSelect
        | null;
      const record = person
        ? await findStudentRecordByAdmission(person.admissionNo)
        : null;
      if (!record) {
        return NextResponse.json(
          { ok: false, error: "No office register row is linked to your account yet." },
          { status: 404 },
        );
      }
      const previousKey = record.photoKey ?? null;
      await db
        .update(lmsStudentRecords)
        .set({ photoKey: null, photoUrl: null })
        .where(eq(lmsStudentRecords.id, record.id));
      await deletePhotoBlob(previousKey);
      return NextResponse.json({ ok: true });
    }

    /* teacher */
    const teacher = (await ensureLmsPerson("teacher", session.accountId)) as
      | typeof lmsTeachers.$inferSelect
      | null;
    if (!teacher?.staffCode) {
      return NextResponse.json(
        { ok: false, error: "No staff register row is linked to your account yet." },
        { status: 404 },
      );
    }
    const [record] = await db
      .select({ id: lmsTeacherRecords.id, photoKey: lmsTeacherRecords.photoKey })
      .from(lmsTeacherRecords)
      .where(eq(lmsTeacherRecords.teacherId, teacher.staffCode))
      .limit(1);
    if (!record) {
      return NextResponse.json(
        { ok: false, error: "No staff register row is linked to your account yet." },
        { status: 404 },
      );
    }
    const previousKey = record.photoKey ?? null;
    await db
      .update(lmsTeacherRecords)
      .set({ photoKey: null, photoUrl: null })
      .where(eq(lmsTeacherRecords.id, record.id));
    await deletePhotoBlob(previousKey);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not remove the photo. Try again." },
      { status: 500 },
    );
  }
}
