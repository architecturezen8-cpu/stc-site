import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { guardApi } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.88.0 — the EMAIL LOG (Admin Studio → System → Email Alerts).
 *
 * The owner: "hadissiye email eka giye naththan eka danaganna widiyak na
 * ne. ehema unoth loku aulak enawa. ekata api email alert section ekema
 * email log kiyala ekak damuda… fail unoth mokadda error eka kiyala ehema
 * show karannath option ekak danna one."
 *
 * GET → { ok, rows (latest 100 send attempts, newest first — to, kind,
 * reference, sent/failed, the failure REASON, time), totals (sent/failed
 * last 30 days) }. Guard: settings.read — the same wall as the switches
 * themselves (staff WITHOUT this permission see the per-row sent/failed
 * badges on the forms inbox instead).
 */
export async function GET() {
  const admin = await guardApi("settings", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const rows = await db
      .select()
      .from(emailLog)
      .orderBy(desc(emailLog.id))
      .limit(100);

    const totals = await db
      .select({
        status: emailLog.status,
        n: sql<number>`count(*)::int`,
      })
      .from(emailLog)
      .where(sql`${emailLog.createdAt} > now() - interval '30 days'`)
      .groupBy(emailLog.status);

    const sent30 = totals.find((t) => t.status === "sent")?.n ?? 0;
    const failed30 = totals.find((t) => t.status === "failed")?.n ?? 0;

    return NextResponse.json({ ok: true, rows, sent30, failed30 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the email log." },
      { status: 500 },
    );
  }
}
