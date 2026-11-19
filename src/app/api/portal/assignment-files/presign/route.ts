import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { getStorage, getStorageDriver } from "@/lib/storage";
import { ALLOWED_EXT, BY_EXT, extensionFor, isVideoExt } from "@/lib/portal-file-types";
import {
  capForExt,
  checkStudentQuota,
  checkTeacherQuota,
  quotaErrorMessage,
} from "@/lib/student-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.67.1 — D.2: PRESIGNED DIRECT UPLOAD for classroom files.
 *
 * The multipart proxy route caps at Vercel's ~4.5 MB serverless body limit,
 * so a 100 MB video can never ride through the function. This route mirrors
 * /api/admin/media/presign for the portal: same type table, same per-type
 * caps (documents 20 MB / video 100 MB), same student 500 MB quota, and the
 * same CORS preflight probe — when the B2 bucket answers the browser, the
 * client PUTs straight to the bucket; otherwise it answers mode:"proxy" so
 * the client falls back to the multipart route (≤4.5 MB on Vercel until the
 * owner flips the bucket's CORS radio).
 *
 * The signed URL is scoped to ONE lms-work/ key for 10 minutes and carries
 * no session secret — safe to hand to the browser.
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
    const body = (await req.json()) as { fileName?: unknown; sizeBytes?: unknown };
    const fileName = typeof body.fileName === "string" ? body.fileName.trim().slice(0, 180) : "";
    const sizeBytes = Number(body.sizeBytes);
    if (!fileName) {
      return NextResponse.json(
        { ok: false, error: "The file has no name." },
        { status: 400 },
      );
    }
    const ext = extensionFor(fileName);
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        {
          ok: false,
          error: `"${fileName}" — that file type is not supported. PDFs, Word, PowerPoint, Excel, Access, images, video, audio and ZIP are.`,
        },
        { status: 400 },
      );
    }
    const cap = capForExt(ext);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > cap) {
      return NextResponse.json(
        {
          ok: false,
          error: isVideoExt(ext)
            ? `"${fileName}" is larger than the ${mb(cap)} video limit.`
            : `Each file must be ${mb(cap)} or smaller (videos may be up to 100 MB).`,
        },
        { status: 400 },
      );
    }

    // Students answer to the 500 MB bucket quota; teachers are exempt.
    if (session.role === "student") {
      const student = (await ensureLmsPerson(
        "student",
        session.accountId,
        session.email,
      )) as { id: number } | null;
      if (student) {
        const verdict = await checkStudentQuota(student.id, sizeBytes);
        if (!verdict.ok) {
          return NextResponse.json(
            { ok: false, error: quotaErrorMessage(verdict, "student") },
            { status: 400 },
          );
        }
      }
    }

    /* v2.8.67.3 — D.3: a TEACHER's custom cap binds here too (the presign
       gate runs BEFORE the browser PUTs anything, so an over-cap direct
       upload is refused before a single byte leaves the device). */
    if (session.role === "teacher") {
      const verdict = await checkTeacherQuota(session.accountId, sizeBytes);
      if (!verdict.ok) {
        return NextResponse.json(
          { ok: false, error: quotaErrorMessage(verdict, "teacher") },
          { status: 400 },
        );
      }
    }

    const driver = getStorageDriver();
    if (driver === "local" || driver === "database") {
      return NextResponse.json({ ok: true, mode: "proxy", driver });
    }

    const storage = getStorage();
    if (!("createSignedUpload" in storage) || !storage.createSignedUpload) {
      return NextResponse.json({ ok: true, mode: "proxy", driver });
    }

    // v2.8.66.7 probe pattern — never fire a guaranteed-failing presigned
    // PUT at a bucket that has no CORS rule; proxy instead, self-healing.
    const origin = req.headers.get("origin")?.trim() || "*";
    if ("probeDirectUpload" in storage && !(await storage.probeDirectUpload(origin))) {
      return NextResponse.json({ ok: true, mode: "proxy", driver });
    }

    const key = `lms-work/${randomUUID()}.${ext}`;
    const signed = await storage.createSignedUpload(key, BY_EXT[ext], 600);
    return NextResponse.json({
      ok: true,
      mode: "direct",
      driver,
      fileName,
      mimeType: BY_EXT[ext],
      sizeBytes,
      ...signed,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not prepare the upload. Try again." },
      { status: 500 },
    );
  }
}
