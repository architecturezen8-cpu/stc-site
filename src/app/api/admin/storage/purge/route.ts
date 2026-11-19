import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import {
  purgeAssignmentFile,
  purgeChatAttachment,
  purgeMaterialFile,
  purgeNoticeFile,
  purgeSubmissionFile,
} from "@/lib/student-storage";
import {
  completePurgeRequest,
  createPurgeRequest,
  findAcceptedRequestFor,
  findDeclinedRequestFor,
  findPendingRequestFor,
  isPurgeKind,
  type PurgeKind,
} from "@/lib/storage-consent";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.1 — D.2 write side: the manual purge behind the cleanup marks.
 * NOTHING is deleted automatically anywhere in D.2 — this endpoint only
 * fires from an explicit, confirmed click in the Storage & Quotas panel,
 * and every purge lands in the admin audit log.
 *
 * v2.8.67.3 — D.3: the guard accepts an LMS admin session, and the kinds
 * grow the three teacher groups (assignment / material / notice) so the
 * studio's per-person Files drawer can purge anything from one place.
 *
 * v2.8.70.3 — CONSENT GATE (the owner's rule): deleting SOMEBODY'S file
 * now needs that person's OK. The first click opens a consent request that
 * lands in the owner's portal (School notifications + My Storage); the
 * purge is refused with needsConsent until they press Accept. An accepted
 * request unlocks the delete and is completed (audited) with it.
 */
export async function POST(req: Request) {
  const admin = await guardPortalOrLmsAdmin("edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await req.json()) as { kind?: unknown; id?: unknown };
    const id = Number(body.id);
    const kind = body.kind as PurgeKind;
    if (!Number.isInteger(id) || id <= 0 || !isPurgeKind(kind)) {
      return NextResponse.json(
        { ok: false, error: "A file kind and id are required." },
        { status: 400 },
      );
    }

    // ── Consent gate ────────────────────────────────────────────────────
    const acceptedId = await findAcceptedRequestFor(kind, id);
    if (!acceptedId) {
      const declinedId = await findDeclinedRequestFor(kind, id);
      if (declinedId) {
        return NextResponse.json(
          {
            ok: false,
            needsConsent: true,
            status: "declined",
            error:
              "The owner declined this deletion — their decision stands, the file stays.",
          },
          { status: 403 },
        );
      }
      const pendingId = await findPendingRequestFor(kind, id);
      if (pendingId) {
        return NextResponse.json(
          {
            ok: false,
            needsConsent: true,
            status: "pending",
            error:
              "Waiting for the owner to accept — the delete unlocks the moment they do.",
          },
          { status: 403 },
        );
      }
      const created = await createPurgeRequest({
        kind,
        fileId: id,
        adminId: admin.id,
        adminName: admin.name,
      });
      if (!created.ok) {
        return NextResponse.json({ ok: false, error: created.error }, { status: 404 });
      }
      return NextResponse.json(
        {
          ok: false,
          needsConsent: true,
          status: "requested",
          requestId: created.requestId,
          error: `Approval request sent to ${created.ownerName} — the delete unlocks once they accept it in their portal.`,
        },
        { status: 403 },
      );
    }

    const result =
      kind === "submission"
        ? await purgeSubmissionFile(id)
        : kind === "chat"
          ? await purgeChatAttachment(id)
          : kind === "assignment"
            ? await purgeAssignmentFile(id)
            : kind === "material"
              ? await purgeMaterialFile(id)
              : await purgeNoticeFile(id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }

    await completePurgeRequest(acceptedId);
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "purge_lms_file",
      entity: kind === "chat" ? "lms_chat_message" : `lms_${kind}_file`,
      entityId: String(id),
    });

    return NextResponse.json({ ok: true, reclaimed: result.reclaimed });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not purge the file.",
      },
      { status: 500 },
    );
  }
}
