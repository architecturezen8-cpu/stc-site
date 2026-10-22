import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   Admin → Registration Approvals — the office queue. Registrations the
   register matcher could NOT fully verify wait here as status="pending".

   GET   → pending accounts with their submitted verification snapshot
   POST  { id, action: "approve" | "reject" }
           approve → status="active" (account opens)
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
  } | null;

  const id = Number(body?.id);
  const action = body?.action ?? "";
  if (!Number.isInteger(id) || id <= 0 || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const [account] = await db
    .select({ id: lmsPortalAccounts.id, role: lmsPortalAccounts.role })
    .from(lmsPortalAccounts)
    .where(and(eq(lmsPortalAccounts.id, id), eq(lmsPortalAccounts.status, "pending")))
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: "That request is no longer pending." }, { status: 404 });
  }

  if (action === "approve") {
    await db
      .update(lmsPortalAccounts)
      .set({ status: "active" })
      .where(eq(lmsPortalAccounts.id, id));
  } else {
    await db
      .update(lmsPortalAccounts)
      .set({ status: "rejected", active: false })
      .where(eq(lmsPortalAccounts.id, id));
  }

  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: action === "approve" ? "registration_approved" : "registration_rejected",
    entity: "lms_portal_account",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true, action });
}
