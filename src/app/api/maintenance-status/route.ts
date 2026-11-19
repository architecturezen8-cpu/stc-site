import { NextResponse } from "next/server";
import { getMaintenanceState } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

/**
 * v2.8.59.0 — the maintenance screen's LIVE heartbeat (the owner: "admin
 * maintenance mode eka off karama user page eka reload karath maintenance
 * page ekema ne inne. maintenance page eka live site eken off wenna ona").
 *
 * The /maintenance screen polls this endpoint every few seconds; the moment
 * an admin switches maintenance OFF, the visitor's tab reloads itself and
 * lands on the real site — no URL re-typing, no manual refresh.
 *
 * PUBLIC on purpose (no session): the whole point is that a locked-out
 * visitor must be able to ask "is the site back yet?". It leaks exactly one
 * boolean. The middleware exempt-prefix list lets it answer even while the
 * curtain is up (every other public API answers 503 under maintenance).
 */
export async function GET() {
  try {
    const state = await getMaintenanceState();
    return NextResponse.json(
      { enabled: state.enabled, updatedAt: state.updatedAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    /* fail open — never let the heartbeat itself lock anyone out */
    return NextResponse.json(
      { enabled: false, updatedAt: null },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
