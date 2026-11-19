import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { getPortalSession } from "@/lib/portal-auth";
import { ensureStudentPerson } from "@/lib/lms-identity";
import {
  purgeOwnChatAttachment,
  purgeOwnSubmissionFile,
  purgeOwnTeacherFile,
  setSubmissionFileTrashed,
  setTeacherFileTrashed,
} from "@/lib/student-storage";

export const dynamic = "force-dynamic";

type FileKind = "submission" | "assignment" | "material" | "notice" | "chat";
type FileAction = "trash" | "restore" | "purge";

const KINDS: readonly FileKind[] = ["submission", "assignment", "material", "notice", "chat"];
const ACTIONS: readonly FileAction[] = ["trash", "restore", "purge"];

const AUDIT_ACTION: Record<FileAction, string> = {
  purge: "portal_file_purged",
  trash: "portal_file_trashed",
  restore: "portal_file_restored",
};

/**
 * v2.8.67.3 — D.3 write side of the portal's "My Storage": the person's own
 * trash / restore / purge over THEIR OWN files. Ownership is enforced inside
 * the storage helpers (in the SQL), and every action lands in the audit log
 * with the portal account id as the actor.
 *
 *   student → submission files + own chat attachments
 *   teacher → assignment / material / notice files + own chat attachments
 *   parent  → nothing to manage (403)
 */
export async function POST(req: Request) {
  const session = await getPortalSession();
  if (!session || session.role === "principal") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "parent") {
    return NextResponse.json(
      { ok: false, error: "Parents don't manage files here yet." },
      { status: 403 },
    );
  }

  let body: { kind?: unknown; id?: unknown; action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const kind = body.kind as FileKind;
  const action = body.action as FileAction;
  const id = Number(body.id);
  if (!KINDS.includes(kind) || !ACTIONS.includes(action) || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { ok: false, error: "A file kind, id and action are required." },
      { status: 400 },
    );
  }

  const isTeacher = session.role === "teacher";
  const teacherKind = kind === "assignment" || kind === "material" || kind === "notice";

  try {
    let result: { ok: true; reclaimed?: number } | { ok: false; error: string };

    if (kind === "chat") {
      // Both roles: the author purges their OWN attachment (text stays).
      if (action !== "purge") {
        return NextResponse.json(
          { ok: false, error: "Chat attachments can only be removed, not trashed." },
          { status: 400 },
        );
      }
      const purged = await purgeOwnChatAttachment(id, session.accountId);
      result = purged;
    } else if (kind === "submission") {
      if (isTeacher) {
        return NextResponse.json(
          { ok: false, error: "Submission files belong to students." },
          { status: 403 },
        );
      }
      const person = await ensureStudentPerson(session.accountId, session.email);
      if (!person) {
        return NextResponse.json(
          { ok: false, error: "Your student record is not linked yet — ask the office." },
          { status: 403 },
        );
      }
      result =
        action === "purge"
          ? await purgeOwnSubmissionFile(id, person.id)
          : await setSubmissionFileTrashed(id, action === "trash", person.id);
    } else if (teacherKind) {
      if (!isTeacher) {
        return NextResponse.json(
          { ok: false, error: "Only teachers manage these files." },
          { status: 403 },
        );
      }
      const teacherFileKind = kind as "assignment" | "material" | "notice";
      result =
        action === "purge"
          ? await purgeOwnTeacherFile(teacherFileKind, id, session.accountId)
          : await setTeacherFileTrashed(teacherFileKind, id, action === "trash", session.accountId);
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported file kind." }, { status: 400 });
    }

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }

    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: AUDIT_ACTION[action],
      entity: `lms_${kind}_file`,
      entityId: String(id),
    });

    return NextResponse.json(
      action === "purge" ? { ok: true, reclaimed: result.reclaimed ?? 0 } : { ok: true },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not update the file.",
      },
      { status: 500 },
    );
  }
}
