import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  LEGACY_PORTAL_COOKIE,
  OAUTH_CHOICE_COOKIE,
  OAUTH_ROLE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  destroyPortalSessionForRole,
  isPortalRole,
  portalCookieName,
} from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/**
 * Signs out ONE portal (v2.8.37.1). The body carries the portal's role —
 * only that role's session cookie + session row are destroyed. A teacher
 * signed in on the same browser stays signed in; the legacy shared cookie
 * is cleared only when it belonged to the signing-out role.
 * No role (very old clients) → clear whatever the legacy cookie holds.
 */
export async function POST(req: Request) {
  const store = await cookies();

  const body = (await req.json().catch(() => null)) as { role?: string } | null;
  const role = body?.role;

  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: { "cache-control": "no-store" } },
  );

  if (isPortalRole(role)) {
    const cleared = await destroyPortalSessionForRole(role, store);
    for (const name of cleared) response.cookies.delete(name);
  } else {
    /* Legacy fallback: destroy whatever the old shared cookie holds. */
    const { destroyPortalSessionByToken } = await import("@/lib/portal-auth");
    await destroyPortalSessionByToken(store.get(LEGACY_PORTAL_COOKIE)?.value);
    response.cookies.delete(LEGACY_PORTAL_COOKIE);
    for (const r of ["student", "teacher", "parent"] as const) {
      const token = store.get(portalCookieName(r))?.value;
      if (token) {
        await destroyPortalSessionByToken(token);
        response.cookies.delete(portalCookieName(r));
      }
    }
  }

  /* One-shot OAuth flow cookies are always cleaned up. */
  response.cookies.delete(OAUTH_CHOICE_COOKIE);
  response.cookies.delete(OAUTH_VERIFIER_COOKIE);
  response.cookies.delete(OAUTH_ROLE_COOKIE);
  return response;
}
