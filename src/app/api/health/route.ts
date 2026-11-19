import { db } from "@/db";
import { sql } from "drizzle-orm";
import { APP_VERSION } from "@/lib/app-version";
import { getServerBootId } from "@/lib/server-boot";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    /* v2.9.14.6 — version + boot id ride along so the stale-page reloader
       can tell when an idle tab is being served by a dead process/build. */
    return Response.json({
      ok: true,
      version: APP_VERSION,
      boot: getServerBootId(),
    });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
