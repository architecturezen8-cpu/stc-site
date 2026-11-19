import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  verifyStudentRegistration,
  verifyTeacherRegistration,
  type VerificationOutcome,
} from "@/lib/verification";

/* ────────────────────────────────────────────────────────────────────────
   Admin → Registration Approvals — the office queue. Registrations the
   register matcher could NOT fully verify wait here as status="pending".

   GET   → pending accounts with their submitted verification snapshot
   POST  { id, action: "approve" | "reject" }
           approve → the register is RE-CHECKED against the snapshot the
             account submitted at sign-up (v2.9.15.0, the owner's core
             rule: manually approving a WRONG registration must never
             mark it verified):
               matched NOW  → status="active" + snapshot rewritten with
                              outcome:'approved' (honest Verified badge)
               NOT matched  → status="active" anyway (manual override) BUT
                              verificationState='unverified' is written
                              explicitly, so the profile shows UNVERIFIED —
                              never a green shield
             parents keep the simple approve (their verification anchors on
             the child's register row and is settled at sign-up).
           reject  → status="rejected" + active=false (blocked everywhere)
   ──────────────────────────────────────────────────────────────────────── */

export async function GET() {
  const denied = await guardPortalOrLmsAdmin("read");
  if (denied instanceof NextResponse) return denied;
  await ensureSchemaExtras();

  const rows = await db
    .select({
      id: lmsPortalAccounts.id,
      email: lmsPortalAccounts.email,
      role: lmsPortalAccounts.role,
      fullName: lmsPortalAccounts.fullName,
      verification: lmsPortalAccounts.verification,
      createdAt: lmsPortalAccounts.createdAt,
    })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.status, "pending"))
    .orderBy(desc(lmsPortalAccounts.id))
    .limit(300);

  return NextResponse.json({
    pending: rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      fullName: row.fullName,
      details: (() => {
        try {
          return row.verification ? (JSON.parse(row.verification) as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      })(),
      createdAt: row.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as {
    id?: number;
    action?: string;
    /* v2.9.15.10 — the office types WHY the registration is refused; the
       person sees it on their waiting screen and at sign-in. */
    reason?: string;
  } | null;

  const id = Number(body?.id);
  const action = body?.action ?? "";
  if (!Number.isInteger(id) || id <= 0 || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const rejectReason = (body?.reason || "").trim().slice(0, 500);

  const [account] = await db
    .select({
      id: lmsPortalAccounts.id,
      role: lmsPortalAccounts.role,
      verification: lmsPortalAccounts.verification,
    })
    .from(lmsPortalAccounts)
    .where(and(eq(lmsPortalAccounts.id, id), eq(lmsPortalAccounts.status, "pending")))
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: "That request is no longer pending." }, { status: 404 });
  }

  if (action === "approve") {
    /* Re-check the register with the details the account submitted at
       sign-up — the office's click is a manual override, never proof. */
    let snapshot: Record<string, unknown> | null = null;
    try {
      snapshot = account.verification
        ? (JSON.parse(account.verification) as Record<string, unknown>)
        : null;
    } catch {
      snapshot = null;
    }
    const field = (key: string): string => {
      const value = snapshot?.[key];
      return typeof value === "string" ? value : "";
    };

    const missingSnapshotOutcome: VerificationOutcome = {
      result: "pending",
      reason: "Verification snapshot missing — the register could not be re-checked",
      recordId: null,
    };

    let recheck: VerificationOutcome | null = null;
    if (account.role === "student") {
      recheck = snapshot
        ? await verifyStudentRegistration({
            admissionNo: field("admissionNo"),
            fullName: field("fullName"),
            className: field("className"),
            registerNo: field("registerNo"),
            fatherName: field("fatherName"),
            motherName: field("motherName"),
          })
        : missingSnapshotOutcome;
    } else if (account.role === "teacher") {
      recheck = snapshot
        ? await verifyTeacherRegistration({
            teacherId: field("teacherId"),
            fullName: field("fullName"),
            email: field("email"),
          })
        : missingSnapshotOutcome;
    }

    if (recheck) {
      const updateSet: Partial<typeof lmsPortalAccounts.$inferInsert> = {
        status: "active",
      };
      if (recheck.result === "approved") {
        /* Matched the register NOW — the snapshot earns its approved
           outcome (other submitted fields are preserved). */
        if (snapshot) {
          updateSet.verification = JSON.stringify({
            ...snapshot,
            outcome: "approved",
            recordId: recheck.recordId,
            reason: "register match",
          });
        }
      } else {
        /* Manual override on a register mismatch: the account still opens,
           but the classification is explicitly UNVERIFIED so the profile
           shows the amber badge — never Verified. The snapshot keeps its
           pending outcome + the fresh mismatch reason. */
        updateSet.verificationState = "unverified";
        if (snapshot) {
          updateSet.verification = JSON.stringify({
            ...snapshot,
            outcome: "pending",
            recordId: recheck.recordId,
            reason: recheck.reason,
          });
        }
      }
      await db.update(lmsPortalAccounts).set(updateSet).where(eq(lmsPortalAccounts.id, id));
    } else {
      /* Parents and other roles keep the simple approve — no matcher
         re-run, snapshot left exactly as submitted. */
      await db
        .update(lmsPortalAccounts)
        .set({ status: "active" })
        .where(eq(lmsPortalAccounts.id, id));
    }

    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "registration_approved",
      entity: "lms_portal_account",
      entityId: String(id),
      details: recheck
        ? { recheck: recheck.result, reason: recheck.reason }
        : { recheck: "skipped" },
    });

    return NextResponse.json({ ok: true, action });
  }

  await db
    .update(lmsPortalAccounts)
    .set({ status: "rejected", active: false, rejectReason: rejectReason || null })
    .where(eq(lmsPortalAccounts.id, id));

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "registration_rejected",
    entity: "lms_portal_account",
    entityId: String(id),
    /* v2.9.15.10 — the typed reason rides the audit trail so the office
       can always see what the person was told. */
    details: rejectReason ? { reason: rejectReason } : null,
  });

  return NextResponse.json({ ok: true, action });
}
