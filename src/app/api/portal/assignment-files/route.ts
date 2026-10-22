import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { getPrivateStorage } from "@/lib/storage";
import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_GROUP,
} from "@/lib/portal-assignments";
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
 * Response: { ok, files: AssignmentFileRef[] } — the client collects these
 * and sends them along with the create/submit call, which pins them in
 * lms_assignment_files / lms_submission_files.
 */

const BY_EXT: Record<string, string> = {
  // documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain",
  md: "text/markdown",
  // slides
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
  // sheets
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  // databases (MS Access)
  mdb: "application/x-msaccess",
  accdb: "application/x-msaccess",
  // images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  // video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  // audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  aac: "audio/aac",
  // archives
  zip: "application/zip",
};

const ALLOWED_EXT = new Set(Object.keys(BY_EXT));

function extensionFor(name: string): string {
  const raw = name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "";
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

    const uploaded = [];
    const storage = getPrivateStorage();
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
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          {
            ok: false,
            error: `Each file must be ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`,
          },
          { status: 400 },
        );
      }

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
