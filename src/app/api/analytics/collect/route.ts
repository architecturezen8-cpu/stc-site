import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { analyticsPageviews } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.79.0 — the analytics collector (the ONLY public analytics endpoint).
 *
 * Receives the SiteTracker beacon: { path, ref }. Derives everything else
 * server-side and stores ONE row per page view:
 *   · path            — the public page (already filtered client-side)
 *   · referrer_host   — EXTERNAL referrer hostname only (internal navigations
 *                       and unparseable referrers store NULL)
 *   · visitor         — sha256(ip|user-agent|Colombo-day|fixed salt): counts
 *                       uniques per day WITHOUT storing an IP or a raw UA,
 *                       and rotates at midnight so nothing tracks a person
 *                       across days
 *   · device          — mobile | tablet | desktop (coarse UA sniff)
 *   · day             — the Asia/Colombo calendar day, "YYYY-MM-DD"
 *
 * ALWAYS answers 204 (even on failures) — analytics must never break a page,
 * never log an error a visitor could trigger, and never become a spam
 * amplifier. The middleware's general rate bucket (120/min/IP) bounds abuse.
 */

const VISITOR_SALT = "stc-analytics-v1";

/** Asia/Colombo calendar day as YYYY-MM-DD — the site's home timezone. */
function colomboDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function deviceFromUa(ua: string): string {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return "tablet";
  if (/mobi|iphone|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    let parsed: { path?: unknown; ref?: unknown } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return new NextResponse(null, { status: 204 });
    }

    const path = String(parsed.path ?? "").slice(0, 300);
    if (!path.startsWith("/") || path.startsWith("//")) {
      return new NextResponse(null, { status: 204 });
    }
    /* Drop query noise but keep the route shape. */
    const cleanPath = path.split("?")[0].slice(0, 300) || "/";

    const ua = req.headers.get("user-agent") ?? "";
    /* Bots / monitors / the site's own tooling never enter the numbers. */
    if (
      !ua ||
      /bot|crawler|spider|crawling|headless|lighthouse|uptime|monitor|preview|curl|wget|python-requests/i.test(
        ua,
      )
    ) {
      return new NextResponse(null, { status: 204 });
    }

    /* External referrer hostname only. */
    let referrerHost: string | null = null;
    const ref = String(parsed.ref ?? "");
    if (ref) {
      try {
        const host = new URL(ref).hostname.toLowerCase().slice(0, 120);
        const selfHost = (req.headers.get("host") ?? "").toLowerCase();
        if (host && host !== selfHost) referrerHost = host;
      } catch {
        referrerHost = null;
      }
    }

    const day = colomboDay();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const visitor = createHash("sha256")
      .update(`${ip}|${ua}|${day}|${VISITOR_SALT}`)
      .digest("hex");

    await ensureSchemaExtras();
    await db.insert(analyticsPageviews).values({
      path: cleanPath,
      referrerHost,
      visitor,
      device: deviceFromUa(ua),
      day,
    });
  } catch {
    /* swallowed by design — see the header comment */
  }
  return new NextResponse(null, { status: 204 });
}
