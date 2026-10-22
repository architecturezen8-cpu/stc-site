import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { popups } from "@/db/schema";

/**
 * Public endpoint — the currently active announcement popup.
 *
 * Only ONE popup surfaces at a time (the newest enabled one that is inside
 * its optional schedule window). Scheduling/permission checks stay here so
 * the client component stays dumb.
 */
export async function GET() {
  try {
    const now = new Date();

    const rows = await db
      .select()
      .from(popups)
      .where(eq(popups.enabled, true))
      .orderBy(desc(popups.updatedAt))
      .limit(20);

    const active = rows.find((row) => {
      if (row.startAt && row.startAt > now) return false;
      if (row.endAt && row.endAt < now) return false;
      return true;
    });

    if (!active) return NextResponse.json({ popup: null });

    return NextResponse.json({
      popup: {
        id: active.id,
        title: active.title,
        message: active.message,
        kind: active.kind,
        bannerUrl: active.bannerUrl,
        linkUrl: active.linkUrl,
        linkLabel: active.linkLabel,
        eventAt: active.eventAt ? active.eventAt.toISOString() : null,
        platform: active.platform,
        links: active.links ?? [],
        frequency: active.frequency,
        delayMs: active.delayMs,
      },
    });
  } catch {
    return NextResponse.json({ popup: null });
  }
}
