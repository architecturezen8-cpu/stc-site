import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { events, posts, staff } from "@/db/schema";

/**
 * Public endpoint — "New" content flags for the navbar indicators.
 * `news` is true while any news post or event carries the NEW badge,
 * `staff` while any staff member does. The navbar hangs the gold NEW
 * chip on the "Latest News" and "Staff" dropdown items respectively.
 */
export async function GET() {
  try {
    await ensureSchemaExtras();
    const [postRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(eq(posts.isNew, true));
    const [eventRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(eq(events.isNew, true));
    const [staffRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(staff)
      .where(eq(staff.isNew, true));

    return NextResponse.json({
      news: (postRow?.count ?? 0) > 0 || (eventRow?.count ?? 0) > 0,
      staff: (staffRow?.count ?? 0) > 0,
    });
  } catch {
    return NextResponse.json({ news: false, staff: false });
  }
}
