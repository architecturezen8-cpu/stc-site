import { NextResponse } from "next/server";
import {
  OAUTH_ROLE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  isPortalRole,
} from "@/lib/portal-auth";
import {
  buildGoogleAuthorizeUrl,
  createPkcePair,
  publicOriginFromRequest,
  supabaseAuthConfigured,
} from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

/**
 * Portal OAuth start: PKCE pair + role hint cookies, then straight to the
 * Supabase hosted authorize endpoint. `prompt=select_account` is forwarded
 * so Google ALWAYS shows the account chooser — signing out of the portal
 * never silently reuses the previous Google identity.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  /* Relative Location — the sandbox proxy reports localhost in Host headers,
     so absolute redirects from req.url leave the visitor stranded. */
  const rel = (path: string) =>
    new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });
  const roleParam = url.searchParams.get("role");

  if (!isPortalRole(roleParam)) {
    return rel("/login");
  }

  if (!supabaseAuthConfigured()) {
    return rel(`/login/${roleParam}?error=oauth_failed`);
  }

  const origin = publicOriginFromRequest(req, url.searchParams.get("origin"));
  const redirectTo = `${origin}/api/portal/auth/oauth/callback`;
  const { verifier, challenge } = createPkcePair();

  const authorizeUrl = new URL(
    buildGoogleAuthorizeUrl(redirectTo, { prompt: "select_account" }),
  );
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = rel(authorizeUrl.toString());

  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookieBase);
  response.cookies.set(OAUTH_ROLE_COOKIE, roleParam, cookieBase);
  return response;
}
