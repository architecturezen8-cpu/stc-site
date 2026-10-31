import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { getStorage } from "@/lib/storage";
import { MAX_FILES_PER_GROUP } from "@/lib/portal-assignments";
import {
  ALLOWED_EXT,
  BY_EXT,
  extensionFor,
} from "@/lib/portal-file-types";
import {
  checkStudentQuota,
  checkTeacherQuota,
  quotaErrorMessage,
} from "@/lib/student-storage";
import { earlyMultipartQuotaGuard } from "@/lib/portal-upload-guard";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.43.0 — ASSIGNMENT FILE UPLOAD (portal edition).
 *
 * The classroom counterpart of /api/admin/media/upload: teachers attach
 * worksheets / videos / spreadsheets to their assignments and students
 * answer with photos, documents, anything the work demands. Bytes land in
 * the SAME provider-neutral storage layer the site media uses (database
 * driver → media_blobs, so files survive sandbox restarts), under the
 * dedicated lms-work/ key prefix.
 *
 * Guard: live student OR teacher portal session. Serving is separate
 * (/api/portal/assignment-files/object) and authorization-checked there.
 *
 * v2.8.67.1 — D.2: per-file caps went per-type (documents 20 MB, video
 * 100 MB — the shared table lives in portal-file-types.ts) and STUDENTS
 * answer to their 500 MB bucket quota; teachers are exempt from the quota.
 *
 * Response: { ok, files: AssignmentFileRef[] } — the client collects these
 * and sends them along with the create/submit call, which pins them in
 * lms_assignment_files / lms_submission_files.
 */

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function POST(req: Request) {
  const session = await getPortalSession();
  if (!session || (session.role !== "student" && session.role !== "teacher")) {
    return NextResponse.json(
      { ok: false, error: "Sign in as a student or teacher to attach files." },
      { status: 401 },
    );
  }

  try {
    /* v2.8.68.4 — refuse an over-cap upload BEFORE the body is buffered.
       formData() must read every byte first, so the post-buffer quota gate
       below only fired after the progress bar hit 100 % — the owner saw
       "couldn't upload" only once the upload had finished. This guard
       answers from the Content-Length header within the first second. */
    const early = await earlyMultipartQuotaGuard(req, session);
    if (early) return early;

    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Choose a file to attach." },
        { status: 400 },
      );
    }
    if (files.length > MAX_FILES_PER_GROUP) {
      return NextResponse.json(
        { ok: false, error: `Attach up to ${MAX_FILES_PER_GROUP} files at a time.` },
        { status: 400 },
      );
    }

    // v2.8.67.1 — per-type caps BEFORE anything is stored.
    let batchBytes = 0;
    for (const file of files) {
      const ext = extensionFor(file.name || "");
      if (!ALLOWED_EXT.has(ext)) {
        return NextResponse.json(
          {
            ok: false,
            error: `"${file.name}" — that file type is not supported. PDFs, Word, PowerPoint, Excel, Access, images, video, audio and ZIP are.`,
          },
          { status: 400 },
        );
      }
      const isVideo = ["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(ext);
      const cap = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
      if (file.size <= 0 || file.size > cap) {
        return NextResponse.json(
          {
            ok: false,
            error: isVideo
              ? `"${file.name}" is larger than the ${mb(cap)} video limit.`
              : `Each file must be ${mb(cap)} or smaller (videos may be up to 100 MB).`,
          },
          { status: 400 },
        );
      }
      batchBytes += file.size;
    }

    // v2.8.67.1 — the student 500 MB bucket quota (one cheap SUM round-trip).
    if (session.role === "student") {
      const student = (await ensureLmsPerson(
        "student",
        session.accountId,
        session.email,
      )) as { id: number } | null;
      if (student) {
        const verdict = await checkStudentQuota(student.id, batchBytes);
        if (!verdict.ok) {
          return NextResponse.json(
            { ok: false, error: quotaErrorMessage(verdict, "student") },
            { status: 400 },
          );
        }
      }
    }

    /* v2.8.67.3 — D.3: a TEACHER's custom cap binds too. No lms_storage_caps
       row → checkTeacherQuota always answers ok, so trusted staff stay
       unlimited unless the office says otherwise. */
    if (session.role === "teacher") {
      const verdict = await checkTeacherQuota(session.accountId, batchBytes);
      if (!verdict.ok) {
        return NextResponse.json(
          { ok: false, error: quotaErrorMessage(verdict, "teacher") },
          { status: 400 },
        );
      }
    }

    const uploaded = [];
    const storage = getStorage();
    for (const file of files) {
      const ext = extensionFor(file.name || "");
      const key = `lms-work/${randomUUID()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await storage.putObject({
        key,
        body: buffer,
        contentType: BY_EXT[ext],
      });
      uploaded.push({
        key,
        fileName: file.name.slice(0, 180),
        mimeType: BY_EXT[ext],
        sizeBytes: buffer.length,
      });
    }

    return NextResponse.json({ ok: true, files: uploaded }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("too large")) {
      return NextResponse.json(
        { ok: false, error: "That file is too large for storage." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Could not upload the file. Try again." },
      { status: 500 },
    );
  }
}
