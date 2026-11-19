import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsParentChildren, lmsParents, lmsPortalAccounts } from "@/db/schema-lms";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import {
  ensureParentPerson,
  ensureStudentPersonByAdmissionNo,
} from "@/lib/lms-identity";

export const dynamic = "force-dynamic";

/**
 * LMS ADMIN STUDIO → Portal users → Parent-child links (v2.9.15.0).
 *
 * The office can attach or detach a child to a parent portal account:
 *
 *   POST   { accountId, admissionNo } → link a register student to a parent account
 *   DELETE { accountId, studentId }   → unlink that child again
 *
 * Both go through the SAME register bridge the registration flow uses
 * (src/lib/lms-identity.ts), so the lms_students person row is found or
 * created on demand and the lms_parents row exists before a link is
 * written. Links live in lms_parent_children (unique parentId+studentId),
 * and every change is audited.
 */

function unauthorized() {
  return NextResponse.json(
    { error: "Sign in to the LMS Admin Studio first." },
    { status: 401 },
  );
}

/** Link a child (by admission number on the school register) to a parent account. */
export async function POST(request: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | { accountId?: unknown; admissionNo?: unknown }
      | null;
    const accountId = Number(body?.accountId);
    const admissionNo =
      typeof body?.admissionNo === "string" ? body.admissionNo.trim() : "";
    if (!Number.isInteger(accountId) || !admissionNo) {
      return NextResponse.json(
        { error: "Enter the parent account and the child's admission number." },
        { status: 400 },
      );
    }

    const [account] = await db
      .select({
        id: lmsPortalAccounts.id,
        role: lmsPortalAccounts.role,
        fullName: lmsPortalAccounts.fullName,
      })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, accountId))
      .limit(1);
    if (!account || account.role !== "parent") {
      return NextResponse.json(
        { error: "Children can only be linked to parent accounts." },
        { status: 400 },
      );
    }

    /* Same lookup the registration bridge uses: find the register row and
       resolve (or materialize) the lms_students person behind it. Passing
       accountId=null never steals the student's own account link. */
    const child = await ensureStudentPersonByAdmissionNo(admissionNo, null);
    if (!child) {
      return NextResponse.json(
        {
          error: "admission_not_found",
          message: "No student with that admission number is on the school register.",
        },
        { status: 404 },
      );
    }

    const parent = await ensureParentPerson(accountId);
    if (!parent) {
      return NextResponse.json(
        { error: "Unable to resolve the parent record for this account." },
        { status: 500 },
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
        action: "portal_child_linked",
        entity: "lms_portal_account",
        entityId: String(accountId),
        details: { accountId, studentId: child.id, admissionNo: child.admissionNo },
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Unlink a child from a parent account (the link must belong to that parent). */
export async function DELETE(request: Request) {
  const session = await getLmsAdminSession();
  if (!session) return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as
      | { accountId?: unknown; studentId?: unknown }
      | null;
    const accountId = Number(body?.accountId);
    const studentId = Number(body?.studentId);
    if (!Number.isInteger(accountId) || !Number.isInteger(studentId)) {
      return NextResponse.json(
        { error: "Enter the parent account and the child to unlink." },
        { status: 400 },
      );
    }

    const [account] = await db
      .select({ id: lmsPortalAccounts.id, role: lmsPortalAccounts.role })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, accountId))
      .limit(1);
    if (!account || account.role !== "parent") {
      return NextResponse.json(
        { error: "Children can only be unlinked from parent accounts." },
        { status: 400 },
      );
    }

    const [parent] = await db
      .select({ id: lmsParents.id })
      .from(lmsParents)
      .where(eq(lmsParents.accountId, accountId))
      .limit(1);
    if (!parent) {
      return NextResponse.json(
        { error: "This parent account has no parent record to unlink from." },
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
        { error: "That child is not linked to this parent." },
        { status: 404 },
      );
    }

    await db.delete(lmsParentChildren).where(eq(lmsParentChildren.id, link.id));

    await db.insert(adminAuditLogs).values({
      userId: session.accountId,
      action: "portal_child_unlinked",
      entity: "lms_portal_account",
      entityId: String(accountId),
      details: { accountId, studentId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to unlink the child.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
