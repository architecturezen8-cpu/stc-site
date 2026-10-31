import { NextResponse } from "next/server";
import { desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adminNotifications } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getAdminSession } from "@/lib/admin-auth";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.88.0 — the SITE BELL's own feed (Admin Studio header).
 *
 * The owner: "appoinment, email send, applications, contact wage ewage
 * massage ekak awama mn admin eke bell icon eke show wenna dammoth hodai
 * ne. naththan danne na ne awada nadda kiyalawath."
 *
 * GET  → { ok, alerts (latest 30, newest first), unread, broadcasts? }.
 *        Alerts = new public form submissions + failed outgoing mails
 *        (admin_notifications). Broadcasts ride along best-effort for the
 *        roles the old bell already served (portal module read) — a role
 *        without that permission still gets its alerts instead of the old
 *        "Could not load notifications" wall (the front-desk complaint).
 *        Guard: ANY live main-admin session — the bell is chrome every
 *        signed-in staff member sees.
 * POST → mark every alert read (one global read; the office is a tiny
 *        team — called when the dropdown opens).
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchemaExtras();

  try {
    const [alerts, unreadRows] = await Promise.all([
      db
        .select()
        .from(adminNotifications)
        .orderBy(desc(adminNotifications.id))
        .limit(30),
      db
        .select({ id: adminNotifications.id })
        .from(adminNotifications)
        .where(isNull(adminNotifications.readAt)),
    ]);

    /* Best-effort broadcasts: the old bell feed, only for roles that may
       see it — never a wall in front of the alerts. liveOnly (v2.8.89.0):
       a scheduled notification rings the bell only at its go-live moment. */
    let broadcasts: unknown = null;
    try {
      const guard = await guardPortalOrLmsAdmin("read");
      if (!(guard instanceof NextResponse)) {
        const { listBroadcastsForAdmin } = await import("@/lib/school-broadcasts");
        broadcasts = await listBroadcastsForAdmin({ liveOnly: true });
      }
    } catch {
      broadcasts = null;
    }

    return NextResponse.json({
      ok: true,
      alerts,
      unread: unreadRows.length,
      broadcasts,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the notifications." },
      { status: 500 },
    );
  }
}

export async function POST() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  await ensureSchemaExtras();

  try {
    await db
      .update(adminNotifications)
      .set({ readAt: new Date() })
      .where(isNull(adminNotifications.readAt));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not mark the notifications read." },
      { status: 500 },
    );
  }
}
