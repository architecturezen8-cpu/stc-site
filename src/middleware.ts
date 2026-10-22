import { NextResponse, type NextRequest } from "next/server";
import {
  getMaintenanceState,
  hasLiveLmsAdminSession,
  hasLiveMainAdminSession,
  LMS_ADMIN_SESSION_COOKIE_NAME,
  MAIN_ADMIN_SESSION_COOKIE_NAME,
} from "@/lib/maintenance";

/**
 * MAINTENANCE GATE (v2.8.38.0, ownership moved in v2.8.39.0)
 *
 * Maintenance mode is toggled from the MAIN Admin Studio → Settings
 * (/admin/settings). When it is ON:
 *  · every PAGE visit is redirected to /maintenance,
 *  · every non-exempt API call answers 503,
 *  · EXCEPT visitors carrying a live lms_admin OR main-admin session cookie —
 *    both teams keep a live preview while they work ("kohomada kiyala
 *    balaganna ba" — the editor must always see the result).
 *
 * Fail-open: any DB error lets the request through. A broken site is worse
 * than a curtain that slips.
 *
 * Exempt paths (never gated): the maintenance screen itself, both admin
 * studios + their auth APIs, and the maintenance toggle APIs. The website
 * Admin Studio's APIs (/api/admin/*) are fully exempt so its editors keep
 * SAVING content while the curtain is up — every route there is
 * session-guarded anyway, so anonymous callers still get 401.
 * /api/media/file is ALSO exempt (v2.8.42.0): the maintenance screen itself
 * renders the CMS crest through it, and gating it 503'd every image the
 * owner picked — the screen then silently fell back to the shield mark, so
 * "select karana image eka site eke adala thanata apply wenne na". The route
 * is a public, read-only byte server, so the exemption is safe.
 * Static assets never reach middleware (matcher).
 */

const EXEMPT_PREFIXES = [
  "/maintenance",
  "/lms-admin",
  "/api/lms-admin",
  "/api/admin/maintenance",
  "/api/admin",
  "/api/media/file",
  /* v2.8.59.0 — the maintenance screen's heartbeat: the ONLY public API
     that keeps answering while the curtain is up, so a visitor's tab can
     see "maintenance off" and reload itself back onto the live site. */
  "/api/maintenance-status",
  "/admin",
];

export const config = {
  runtime: "nodejs",
  matcher: [
    // Everything except Next internals and static files (by extension).
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|mjs|map|woff|woff2|ttf|otf|eot|mp4|webm|mp3|txt|xml)$).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const state = await getMaintenanceState();
  if (!state.enabled) return NextResponse.next();

  const lmsToken = req.cookies.get(LMS_ADMIN_SESSION_COOKIE_NAME)?.value;
  if (await hasLiveLmsAdminSession(lmsToken)) return NextResponse.next();

  const adminToken = req.cookies.get(MAIN_ADMIN_SESSION_COOKIE_NAME)?.value;
  if (await hasLiveMainAdminSession(adminToken)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Site is temporarily under maintenance.",
        maintenance: true,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  /* v2.8.59.0 — carry the ORIGINAL destination so the maintenance screen's
     revive poller can send the visitor BACK to the page they wanted the
     moment an admin lifts the curtain (no URL re-typing, no landing on
     /maintenance itself). */
  const from = pathname + (req.nextUrl.search || "");
  if (from !== "/maintenance") {
    url.searchParams.set("from", from);
  }
  return NextResponse.redirect(url);
}
