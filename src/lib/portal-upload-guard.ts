import "server-only";

import { NextResponse } from "next/server";
import { ensureLmsPerson } from "@/lib/lms-identity";
import {
  checkStudentQuota,
  checkTeacherQuota,
  quotaErrorMessage,
} from "@/lib/student-storage";

/**
 * v2.8.68.4 — EARLY multipart quota guard.
 *
 * THE BUG THIS FIXES: Next.js route handlers cannot inspect a multipart
 * body without first buffering ALL of it (`req.formData()`), so every
 * quota gate that ran after the formData() call only fired AFTER the
 * browser had pushed 100 % of the bytes — the owner saw the progress bar
 * finish and THEN "couldn't upload". The pick-time pre-check in the
 * uploaders is best-effort (it fail-opens when the usage probe is
 * unavailable), so it could not catch every case.
 *
 * THE FIX: read the `Content-Length` header BEFORE touching the body and
 * compare it against the person's REMAINING quota. An over-cap request is
 * refused with the friendly "storage is full — free up space" message
 * within the first second, while the progress bar has barely moved. The
 * after-buffer gates stay in place untouched (they remain authoritative
 * for chunked uploads without a Content-Length, and as the race-free
 * second line of defence).
 *
 * Margin covers the multipart boundary + caption fields riding with the
 * file, so a request that is exactly at the cap is never false-rejected.
 */
export const MULTIPART_OVERHEAD_BYTES = 256 * 1024;

type PortalSessionLike = {
  /** The routes call this AFTER narrowing to student|teacher, but the
   *  declared session type is the full union — accept it and no-op for
   *  anything else (parents/principals never reach these routes anyway). */
  role: string;
  accountId: number;
  email?: string;
};

export async function earlyMultipartQuotaGuard(
  req: Request,
  session: PortalSessionLike,
): Promise<NextResponse | null> {
  const raw = req.headers.get("content-length");
  if (!raw) return null; // chunked / unknown size — post-buffer gates decide
  const contentLength = Number(raw);
  if (!Number.isFinite(contentLength) || contentLength <= 0) return null;
  const incoming = contentLength - MULTIPART_OVERHEAD_BYTES;
  if (incoming <= 0) return null; // tiny request — nothing to guard

  if (session.role === "student") {
    const person = await ensureLmsPerson(
      "student",
      session.accountId,
      session.email ?? "",
    );
    if (!person) return null; // no person row — the old gates handle it
    const verdict = await checkStudentQuota(person.id, 0);
    if (verdict.used < 0) return null; // fail-open, as everywhere else
    const remaining = verdict.quota - verdict.used;
    if (incoming > remaining) {
      return NextResponse.json(
        {
          ok: false,
          error: quotaErrorMessage(
            { ...verdict, incoming },
            "student",
          ),
        },
        { status: 400 },
      );
    }
    return null;
  }

  if (session.role !== "teacher") return null; // parents upload nothing here

  // teacher — a custom cap binds here before a single byte is buffered
  const verdict = await checkTeacherQuota(session.accountId, 0);
  if (verdict.quota <= 0 || verdict.used < 0) return null; // unlimited / fail-open
  const remaining = verdict.quota - verdict.used;
  if (incoming > remaining) {
    return NextResponse.json(
      {
        ok: false,
        error: quotaErrorMessage({ ...verdict, incoming }, "teacher"),
      },
      { status: 400 },
    );
  }
  return null;
}
