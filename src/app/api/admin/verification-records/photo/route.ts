import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { db } from "@/db";
import { lmsStudentRecords, lmsTeacherRecords } from "@/db/schema-lms";
import {
  deletePhotoBlob,
  photoUrlFor,
  storePersonPhoto,
  type PersonPhotoKind,
} from "@/lib/person-photo";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.59.0 — OFFICE PHOTO UPLOAD (the owner: "lms-admintai ... images danna
 * option ekak danna wei ne").
 *
 * POST /api/admin/verification-records/photo — multipart/form-data:
 *   type   = "student" | "teacher"
 *   id     = the register row id
 *   file   = JPG / PNG / WebP, 3 MB max
 *
 * Used by the Verification Records manager's camera button: the office sets
 * the face BEFORE an account exists, and every portal surface that reads the
 * register (profile card, roster wall) picks it up automatically. Replacing
 * a photo deletes the old blob. Same guard as the rest of the approvals
 * queue (site admin OR lms admin, edit level).
 */
export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  try {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }

    const typeRaw = String(form.get("type") ?? "");
    const kind: PersonPhotoKind | null =
      typeRaw === "student" || typeRaw === "teacher" ? typeRaw : null;
    const rowId = Number(form.get("id"));
    const fileEntry = form.get("file");

    if (!kind || !Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
    }
    if (!fileEntry || typeof fileEntry === "string") {
      return NextResponse.json(
        { ok: false, error: "Choose a photo to upload." },
        { status: 400 },
      );
    }

    let previousKey: string | null = null;
    if (kind === "student") {
      const [row] = await db
        .select({ photoKey: lmsStudentRecords.photoKey })
        .from(lmsStudentRecords)
        .where(eq(lmsStudentRecords.id, rowId))
        .limit(1);
      if (!row) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      previousKey = row.photoKey ?? null;
    } else {
      const [row] = await db
        .select({ photoKey: lmsTeacherRecords.photoKey })
        .from(lmsTeacherRecords)
        .where(eq(lmsTeacherRecords.id, rowId))
        .limit(1);
      if (!row) {
        return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
      }
      previousKey = row.photoKey ?? null;
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
