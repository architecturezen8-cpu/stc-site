import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAccessRequests, adminAuditLogs, adminUsers } from "@/db/schema";
import { guardApi, createAdminUser } from "@/lib/admin-auth";
import { isAdminRole } from "@/lib/admin-roles";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* Simple in-memory throttle for the PUBLIC submission endpoint: one request
   per email per 60 s (best-effort, resets on server restart). v2.8.59.1 —
   the map now prunes expired entries and caps itself, so a hostile burst of
   unique addresses can never grow it unbounded (it used to keep every key
   for the life of the process). */
const recent = new Map<string, number>();
const THROTTLE_MS = 60_000;
const RECENT_MAX_ENTRIES = 5_000;

function throttleRecord(email: string, now: number) {
  if (recent.size > RECENT_MAX_ENTRIES) {
    for (const [key, stamp] of recent) {
      if (now - stamp >= THROTTLE_MS) recent.delete(key);
      if (recent.size <= RECENT_MAX_ENTRIES) break;
    }
  }
  const last = recent.get(email) ?? 0;
  if (now - last < THROTTLE_MS) return false;
  recent.set(email, now);
  return true;
}

/** List access requests (Role Management — super_admin/admin only). */
export async function GET() {
  const session = await guardApi("roles", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const requests = await db
    .select()
    .from(adminAccessRequests)
    .orderBy(desc(adminAccessRequests.createdAt))
    .limit(200);

  return NextResponse.json({ requests });
}

/**
 * PUBLIC — submit an access request from /admin/request-access.
 * Always answers with a neutral success message (no account enumeration).
 */
export async function POST(request: Request) {
  await ensureSchemaExtras();

  const body = (await request.json().catch(() => null)) as
    | { name?: string; email?: string; reason?: string }
    | null;

  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const reason = body?.reason?.trim().slice(0, 600) ?? null;

  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please provide your name and a valid email." }, { status: 400 });
  }

  const now = Date.now();
  if (!throttleRecord(email, now)) {
    return NextResponse.json(
      { error: "Request already received — please wait a minute before trying again." },
      { status: 429 },
    );
  }

  // One pending request per email at a time.
  const pending = await db
    .select({ id: adminAccessRequests.id })
    .from(adminAccessRequests)
    .where(and(eq(adminAccessRequests.email, email), eq(adminAccessRequests.status, "pending")))
    .limit(1);

  if (pending.length === 0) {
    await db.insert(adminAccessRequests).values({ name, email, reason });
  }

  return NextResponse.json({ ok: true });
}

/** Approve or reject an access request. Approve creates the admin account. */
export async function PATCH(request: Request) {
  const session = await guardApi("roles", "edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await request.json().catch(() => null)) as
    | { id?: number; action?: "approve" | "reject"; role?: string; password?: string }
    | null;

  const id = Number(body?.id);
  const action = body?.action;
  if (!Number.isInteger(id) || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const [req] = await db
    .select()
    .from(adminAccessRequests)
    .where(eq(adminAccessRequests.id, id))
    .limit(1);
  if (!req) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (req.status !== "pending") {
    return NextResponse.json({ error: "This request was already reviewed." }, { status: 409 });
  }

  if (action === "reject") {
    await db
      .update(adminAccessRequests)
      .set({ status: "rejected", reviewedBy: session.id, reviewedAt: new Date() })
      .where(eq(adminAccessRequests.id, id));
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "access_request_rejected",
      entity: "admin_access_request",
      entityId: String(id),
    });
    return NextResponse.json({ ok: true });
  }

  // ---- approve ----
  const actorIsSuper = session.role === "super_admin";
  const role = body?.role ?? "";
  const password = body?.password ?? "";
  if (!isAdminRole(role)) {
    return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  }
  if ((role === "super_admin" || role === "admin") && !actorIsSuper) {
    return NextResponse.json(
      { error: "Only a Super Admin can create Super Admin or Admin accounts." },
      { status: 403 },
    );
  }
  if (password.length < 10) {
    return NextResponse.json(
      { error: "Temporary password must contain at least 10 characters." },
      { status: 400 },
    );
  }

  const dup = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, req.email))
    .limit(1);
  if (dup.length > 0) {
    return NextResponse.json(
      { error: "That email already has an admin account — reject the request instead." },
      { status: 409 },
    );
  }

  const user = await createAdminUser({
    name: req.name,
    email: req.email,
    password,
    role,
    actorId: session.id,
  });
  await db
    .update(adminAccessRequests)
    .set({ status: "approved", reviewedBy: session.id, reviewedAt: new Date() })
    .where(eq(adminAccessRequests.id, id));
  await db.insert(adminAuditLogs).values({
    userId: session.id,
    action: "access_request_approved",
    entity: "admin_access_request",
    entityId: String(id),
  });

  return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
}
