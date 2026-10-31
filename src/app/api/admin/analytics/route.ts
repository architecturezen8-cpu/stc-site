import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { analyticsPageviews } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.79.0 — the analytics read API for /admin/analytics.
 *
 * guardApi("analytics") — audience numbers are for the owner/super_admin and
 * the admin role only (deliberately outside READABLE_CONTENT). Every figure
 * is computed over the Asia/Colombo calendar day strings, so the bucket
 * boundaries match what the collector stored. 30-day window, aggregated in
 * SQL (the table stays small at school-site traffic levels).
 */

const WINDOW_DAYS = 30;

function colomboDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "YYYY-MM-DD" ± N days (parsed at UTC noon — immune to DST). */
function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const admin = await guardApi("analytics", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const today = colomboDay();
  const since30 = addDays(today, -(WINDOW_DAYS - 1));
  const since7 = addDays(today, -6);
  const inWindow = gte(analyticsPageviews.day, since30);
  const uniques = sql<number>`count(distinct ${analyticsPageviews.visitor})`;

  const [totals30] = await db
    .select({ views: count(), uniques })
    .from(analyticsPageviews)
    .where(inWindow);

  const [totals7] = await db
    .select({ views: count(), uniques })
    .from(analyticsPageviews)
    .where(gte(analyticsPageviews.day, since7));

  const [totalsToday] = await db
    .select({ views: count(), uniques })
    .from(analyticsPageviews)
    .where(eq(analyticsPageviews.day, today));

  const dailyRows = await db
    .select({ day: analyticsPageviews.day, views: count(), uniques })
    .from(analyticsPageviews)
    .where(inWindow)
    .groupBy(analyticsPageviews.day);
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const series = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const day = addDays(today, i - (WINDOW_DAYS - 1));
    const found = byDay.get(day);
    return {
      day,
      label: day.slice(5),
      views: Number(found?.views ?? 0),
      uniques: Number(found?.uniques ?? 0),
    };
  });

  const topPaths = (
    await db
      .select({ path: analyticsPageviews.path, views: count(), uniques })
      .from(analyticsPageviews)
      .where(inWindow)
      .groupBy(analyticsPageviews.path)
      .orderBy(desc(count()))
      .limit(10)
  ).map((r) => ({ path: r.path, views: Number(r.views), uniques: Number(r.uniques) }));

  const referrers = (
    await db
      .select({ host: analyticsPageviews.referrerHost, views: count() })
      .from(analyticsPageviews)
      .where(and(inWindow, isNotNull(analyticsPageviews.referrerHost)))
      .groupBy(analyticsPageviews.referrerHost)
      .orderBy(desc(count()))
      .limit(8)
  ).map((r) => ({ host: r.host ?? "", views: Number(r.views) }));

  const devices = (
    await db
      .select({ device: analyticsPageviews.device, views: count() })
      .from(analyticsPageviews)
      .where(inWindow)
      .groupBy(analyticsPageviews.device)
      .orderBy(desc(count()))
  ).map((r) => ({ device: r.device, views: Number(r.views) }));

  const grandTotal = Number(totals30?.views ?? 0);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    today,
    totals: {
      viewsToday: Number(totalsToday?.views ?? 0),
      uniquesToday: Number(totalsToday?.uniques ?? 0),
      views7: Number(totals7?.views ?? 0),
      uniques7: Number(totals7?.uniques ?? 0),
      views30: grandTotal,
      uniques30: Number(totals30?.uniques ?? 0),
    },
    series,
    topPaths,
    referrers,
    devices,
  });
}
