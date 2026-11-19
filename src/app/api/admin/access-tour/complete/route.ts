import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { requireAdminApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/**
 * v2.9.12.1 — NEW-ACCESS TOUR · completion stamp.
 *
 * The spotlight walk ("the admin gave you X — here's where it lives") fires
 * this when the account finishes OR skips it, clearing
 * admin_users.pending_tour so it never replays. Self-scoped: the session's
 * own row only — nobody can clear someone else's queue from here.
 */
export async function POST() {
  const session = await requireAdminApi();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchemaExtras();

  await db
    .update(adminUsers)
    .set({ pendingTour: null, updatedAt: new Date() })
    .where(eq(adminUsers.id, session.id));

  return NextResponse.json({ ok: true });
}
