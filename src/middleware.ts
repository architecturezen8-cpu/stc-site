import { NextResponse, type NextRequest } from "next/server";
import {
  getMaintenanceState,
  hasLiveLmsAdminSession,
  hasLiveMainAdminSession,
  LMS_ADMIN_SESSION_COOKIE_NAME,
  MAIN_ADMIN_SESSION_COOKIE_NAME,
} from "@/lib/maintenance";
import {
  BUCKET_API_GENERAL,
  BUCKET_FORM_POST,
  BUCKET_MEDIA_THUMB,
  clientIp,
  hitRateLimit,
  rateLimitedResponse,
} from "@/lib/rate-limit";

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
 *
 * v2.8.78.0 — GLOBAL RATE LIMITING (Phase 2.10 launch gap). Every NON-EXEMPT
 * API call passes a per-IP sliding-window bucket BEFORE the maintenance DB
 * read: 120/min general (dashboards poll several endpoints — never felt),
 * 300/min for media thumbnails (heavy pages load dozens), and 8/10 min for
 * the three PUBLIC form POSTs (the spam surface). The exempt /api/admin/* +
 * /api/lms-admin/* prefixes keep their own in-route failed-attempt limiters,
 * so a bucket here would double-count; auth routes are covered there.
 * Pages are never limited (a school behind one NAT must not break).
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

/* v2.8.78.0 — the public form endpoints (the spam surface). POSTs only.
   v2.8.85.0 — /api/forms joins the same bucket: every custom-form upload +
   submit POST from the public Special Forms hub is anonymous traffic. */
const PUBLIC_FORM_PATHS = ["/api/contact", "/api/admissions", "/api/appointments", "/api/forms"];

/**
 * Global API rate limiting (v2.8.78.0). Returns a 429 response when the
 * caller's bucket is over its limit, or null to continue.
 */
function applyGlobalRateLimit(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return null;

  if (pathname === "/api/media/thumb") {
    const retry = hitRateLimit(BUCKET_MEDIA_THUMB, clientIp(req));
    return retry > 0 ? rateLimitedResponse(retry) : null;
  }
  if (
    req.method === "POST" &&
    PUBLIC_FORM_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const retry = hitRateLimit(BUCKET_FORM_POST, clientIp(req));
    return retry > 0 ? rateLimitedResponse(retry) : null;
  }
  const retry = hitRateLimit(BUCKET_API_GENERAL, clientIp(req));
  return retry > 0 ? rateLimitedResponse(retry) : null;
}

/* v2.8.98.0 — VISUAL DRAFT HEADER. When a public page is opened with one of
   the editor/preview flags, the request is stamped `x-visual-draft: 1` so
   server components (VisualBlockSections) can render DRAFT blocks for the
   signed-in admin. Without this, a block added from the visual editor never
   appeared on the page until Publish — the owner's report: "add karana ewa
   site eke show wenne na". Admin/API paths never receive the stamp. */
function visualDraftHeaders(req: NextRequest): Headers | undefined {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return undefined;
  const flagged =
    searchParams.get("visualEditor") === "1" ||
    searchParams.get("cmsPreview") === "1" ||
    searchParams.get("cmsEditor") === "1";
  if (!flagged) return undefined;
  const headers = new Headers(req.headers);
  headers.set("x-visual-draft", "1");
  return headers;
}

/** NextResponse.next() that carries the visual-draft stamp when present. */
function passWithDraft(req: NextRequest, draftHeaders: Headers | undefined): NextResponse {
  return draftHeaders
    ? NextResponse.next({ request: { headers: draftHeaders } })
    : NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: [
    // Everything except Next internals and static files (by extension).
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|mjs|map|woff|woff2|ttf|otf|eot|mp4|webm|mp3|txt|xml)$).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const draftHeaders = visualDraftHeaders(req);

  if (EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return passWithDraft(req, draftHeaders);
  }

  /* v2.8.78.0 — rate limit BEFORE the maintenance DB read so a flood cannot
     buy database work. Exempt prefixes already returned above. */
  const limited = applyGlobalRateLimit(req);
  if (limited) return limited;

  const state = await getMaintenanceState();
  if (!state.enabled) return passWithDraft(req, draftHeaders);

  const lmsToken = req.cookies.get(LMS_ADMIN_SESSION_COOKIE_NAME)?.value;
  if (await hasLiveLmsAdminSession(lmsToken)) return passWithDraft(req, draftHeaders);

  const adminToken = req.cookies.get(MAIN_ADMIN_SESSION_COOKIE_NAME)?.value;
  if (await hasLiveMainAdminSession(adminToken)) return passWithDraft(req, draftHeaders);

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
