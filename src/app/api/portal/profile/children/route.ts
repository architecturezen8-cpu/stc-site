import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsParentChildren, lmsParents } from "@/db/schema-lms";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import {
  ensureParentPerson,
  ensureStudentPersonByAdmissionNo,
} from "@/lib/lms-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.9.15.5 — SELF-SERVICE parent→child links from the profile page
 * (owner: "paren acc eka create karata passeth profile eken childrensla
 * link karanna option eka danna").
 *
 * Until now a parent account could only be linked to children at
 * registration time or by the office (LMS Admin Studio). Both still work,
 * but the PARENT can now also do it themselves from /parent/profile:
 *
 *   POST   { admissionNo } → link ONE child found on the school register
 *   DELETE { studentId }   → unlink a child currently linked to THIS account
 *
 * Safety rails:
 *   · parent-session only (getPortalSessionForRequest + role check);
 *   · the admission number must exist on the school register — the same
 *     bridge the registration flow and the office's link dialog use
 *     (ensureStudentPersonByAdmissionNo with accountId=null, so a parent
 *     can never steal the student's own account link);
 *   · up to 6 children per parent account (the registration cap);
 *   · every link/unlink is audited with a *_self action so the office can
 *     audit self-service changes separately from its own.
 */

/** Same cap the self-registration child rows use (v2.9.15.3). */
const MAX_CHILDREN = 6;

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Sign in to the Parent Portal first." },
    { status: 401 },
  );
}

/** Link a child (by admission number on the school register) to THIS parent account. */
export async function POST(request: Request) {
  const session = await getPortalSessionForRequest(request, ["parent"]);
  if (!session || session.role !== "parent") return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | { admissionNo?: unknown }
      | null;
    const admissionNo =
      typeof body?.admissionNo === "string" ? body.admissionNo.trim() : "";
    if (!admissionNo) {
      return NextResponse.json(
        { ok: false, error: "Type the child's admission number first." },
        { status: 400 },
      );
    }

    const child = await ensureStudentPersonByAdmissionNo(admissionNo, null);
    if (!child) {
      return NextResponse.json(
        {
          ok: false,
          error: "admission_not_found",
          message:
            "No student with that admission number is on the school register — check the number and try again.",
        },
        { status: 404 },
      );
    }

    const parent = await ensureParentPerson(session.accountId);
    if (!parent) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve the parent record for this account." },
        { status: 500 },
      );
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lmsParentChildren)
      .where(eq(lmsParentChildren.parentId, parent.id));
    if (count >= MAX_CHILDREN) {
      return NextResponse.json(
        {
          ok: false,
          error: "limit_reached",
          message: `Up to ${MAX_CHILDREN} children can be linked to one parent account — ask the school office for more.`,
        },
        { status: 400 },
      );
    }

    const [existing] = await db
      .select({ id: lmsParentChildren.id })
      .from(lmsParentChildren)
      .where(
        and(
          eq(lmsParentChildren.parentId, parent.id),
          eq(lmsParentChildren.studentId, child.id),
        ),
      )
      .limit(1);

    if (!existing) {
      await db
        .insert(lmsParentChildren)
        .values({ parentId: parent.id, studentId: child.id })
        .onConflictDoNothing();
      await db.insert(adminAuditLogs).values({
        userId: session.accountId,
        action: "portal_child_linked_self",
        entity: "lms_portal_account",
        entityId: String(session.accountId),
        details: {
          accountId: session.accountId,
          studentId: child.id,
          admissionNo: child.admissionNo,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      alreadyLinked: Boolean(existing),
      child: {
        studentId: child.id,
        fullName: child.fullName,
        admissionNo: child.admissionNo,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to link the child.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Unlink a child from THIS parent account (the link must belong to it). */
export async function DELETE(request: Request) {
  const session = await getPortalSessionForRequest(request, ["parent"]);
  if (!session || session.role !== "parent") return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | { studentId?: unknown }
      | null;
    const studentId = Number(body?.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Choose the child to unlink." },
        { status: 400 },
      );
    }

    const [parent] = await db
      .select({ id: lmsParents.id })
      .from(lmsParents)
      .where(eq(lmsParents.accountId, session.accountId))
      .limit(1);
    if (!parent) {
      return NextResponse.json(
        { ok: false, error: "This account has no parent record to unlink from." },
        { status: 404 },
      );
    }

    /* Ownership check first — only a link of THIS parent may be removed. */
    const [link] = await db
      .select({ id: lmsParentChildren.id })
      .from(lmsParentChildren)
      .where(
        and(
          eq(lmsParentChildren.parentId, parent.id),
          eq(lmsParentChildren.studentId, studentId),
        ),
      )
      .limit(1);
    if (!link) {
      return NextResponse.json(
        { ok: false, error: "That child is not linked to this account." },
        { status: 404 },
      );
    }

    await db.delete(lmsParentChildren).where(eq(lmsParentChildren.id, link.id));

    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: "portal_child_unlinked_self",
      entity: "lms_portal_account",
      entityId: String(session.accountId),
      details: { accountId: session.accountId, studentId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to unlink the child.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
