import "server-only";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lmsStudentRecords, lmsTeacherRecords } from "@/db/schema-lms";
import { getStorage } from "@/lib/storage";
import { markStorageBlobDeleted, recordStorageBlob } from "@/lib/storage-ledger";
import { extForImageMime, optimizeProfileImage } from "@/lib/image-optimize";

/**
 * v2.8.59.0 — PROFILE PHOTOS on the office registers (the owner: "students
 * images kohomada danne lms-admintai, studentslatai option ekak danna wei
 * ne. profile image eka danna. teacherslage profile walatath teachertai
 * lms-admintai images danna option ekak danna wei ne.")
 *
 * The photo hangs on the REGISTER ROW (lms_student_records /
 * lms_teacher_records) — the office's source of truth — so:
 *   · it exists BEFORE the person ever creates an account;
 *   · every admission-no join (roster wall, portal profile) picks it up;
 *   · a Google sign-in can never clobber it (Google only touches
 *     lms_portal_accounts.avatar_url on login).
 *
 * Bytes live in the shared provider-neutral storage layer under lms-people/
 * and are served ONLY through the session-gated
 * /api/portal/person-photo/[kind]/[id] route (<img> tags are same-origin,
 * so the session cookie rides along).
 */

export type PersonPhotoKind = "student" | "teacher";

export const MAX_PHOTO_BYTES = 12 * 1024 * 1024; // 12 MB raw — the optimizer shrinks what lands

const PHOTO_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp";

function extensionFor(name: string): string {
  const raw = name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "";
}

export type StoredPhoto = { key: string; mimeType: string; sizeBytes: number };

/** Validate + store one photo upload; returns the storage coordinates.
 *  v2.9.15.10 — every upload rides the media library's sharp optimizer
 *  (EXIF-rotate, fit inside 1024², WebP q80) before it ever reaches the
 *  bucket — a 6 MB phone shot lands as ~100 KB (owner: "ona reddak upload
 *  wenawa ... optimize engin ekath use karamu ne"). */
export async function storePersonPhoto(
  kind: PersonPhotoKind,
  rowId: number,
  file: File,
): Promise<StoredPhoto | { error: string }> {
  const ext = extensionFor(file.name || "");
  if (!ext || !PHOTO_MIME_BY_EXT[ext]) {
    return { error: "Photos must be JPG, PNG or WebP images." };
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return { error: "Photos are limited to 12 MB — pick a smaller image." };
  }
  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.length === 0 || raw.length > MAX_PHOTO_BYTES) {
    return { error: "Photos are limited to 12 MB — pick a smaller image." };
  }

  const optimized = await optimizeProfileImage(raw);
  const bytes = optimized?.bytes ?? raw;
  const mimeType = optimized?.contentType ?? PHOTO_MIME_BY_EXT[ext];
  const finalExt = optimized ? extForImageMime(mimeType) : ext;

  const key = `lms-people/${kind}-${rowId}-${randomBytes(8).toString("hex")}.${finalExt}`;
  try {
    await getStorage().putObject({
      key,
      body: bytes,
      contentType: mimeType,
    });
  } catch {
    return { error: "Could not store the photo — try again." };
  }
  /* v2.9.15.6 — the storage ledger row: profile photos now carry their
     REAL size into the admin Storage page (owner: "okkoma storage
     hariyatama track wenna ona"). Best-effort — never blocks the upload. */
  try {
    await recordStorageBlob({
      key,
      bytes: bytes.length,
      contentType: mimeType,
      kind: "person-photo",
      ownerKind: kind,
      ownerId: rowId,
    });
  } catch {
    /* ledger hiccup must never block the photo */
  }
  return { key, mimeType, sizeBytes: bytes.length };
}

/** Cache-busted display URL for a stored photo. */
export function photoUrlFor(kind: PersonPhotoKind, rowId: number): string {
  return `/api/portal/person-photo/${kind}/${rowId}?v=${Date.now()}`;
}

/** Best-effort blob cleanup for a replaced/removed photo. */
export async function deletePhotoBlob(key: string | null | undefined) {
  if (!key) return;
  try {
    await getStorage().deleteObject(key);
  } catch {
    /* storage hiccup must never block the row update */
  }
  /* v2.9.15.6 — the ledger row is marked so the Storage page stops
     counting these bytes the moment the blob is gone. */
  try {
    await markStorageBlobDeleted(key);
  } catch {
    /* ledger hiccup must never block the row update */
  }
}

/** Load one register row's photo coordinates (session-gated routes only). */
export async function getPersonPhotoRow(kind: PersonPhotoKind, rowId: number) {
  if (kind === "student") {
    const [row] = await db
      .select({
        id: lmsStudentRecords.id,
        fullName: lmsStudentRecords.fullName,
        photoKey: lmsStudentRecords.photoKey,
      })
      .from(lmsStudentRecords)
      .where(eq(lmsStudentRecords.id, rowId))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select({
      id: lmsTeacherRecords.id,
      fullName: lmsTeacherRecords.fullName,
      photoKey: lmsTeacherRecords.photoKey,
    })
    .from(lmsTeacherRecords)
    .where(eq(lmsTeacherRecords.id, rowId))
    .limit(1);
  return row ?? null;
}
