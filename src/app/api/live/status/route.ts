import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { liveStreams } from "@/db/schema";

/**
 * Public endpoint polled by the navbar — is the school LIVE right now?
 *
 * Returns a minimal payload so polling stays cheap:
 *   live      → red blinking dot (a stream is in LIVE MODE)
 *   scheduled → green blinking dot (an upcoming scheduled stream)
 */
export async function GET() {
  try {
    const rows = await db
      .select({
        id: liveStreams.id,
        title: liveStreams.title,
        platform: liveStreams.platform,
        liveMode: liveStreams.liveMode,
        scheduledAt: liveStreams.scheduledAt,
      })
      .from(liveStreams)
      .orderBy(desc(liveStreams.liveMode), desc(liveStreams.scheduledAt))
      .limit(50);

    const onAir = rows.find((r) => r.liveMode);
    const now = new Date();
    const upcoming = rows.find(
      (r) => !r.liveMode && r.scheduledAt && r.scheduledAt > now,
    );

    return NextResponse.json({
      live: Boolean(onAir),
      scheduled: Boolean(upcoming),
      stream: onAir ? { id: onAir.id, title: onAir.title, platform: onAir.platform } : null,
    });
  } catch {
    return NextResponse.json({ live: false, scheduled: false, stream: null });
  }
}
