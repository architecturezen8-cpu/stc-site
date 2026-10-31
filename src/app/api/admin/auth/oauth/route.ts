import { NextResponse } from "next/server";
import {
  buildGoogleAuthorizeUrl,
  createPkcePair,
  publicOriginFromRequest,
  supabaseAuthConfigured,
} from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const VERIFIER_COOKIE = "stc_oauth_verifier";

/**
 * Admin Google sign-in START (the /api/admin/auth/oauth pair — the flow the
 * invite links and the older button component point at; /api/admin/auth/google
 * is the newer twin). Same battle-tested PKCE chain as the portal + google
 * routes: the verifier rides a short-lived httpOnly cookie and is exchanged at
 * the callback. `prompt=select_account` is forwarded so the Google account
 * chooser ALWAYS appears.
 *
 * v2.8.87.1 fix: this route used to destructure { authorizeUrl, verifier }
 * from a function that returns a string — the export set of an uncommitted
 * session, lost in a sandbox reset — so every visitor landed on
 * `Location: undefined`. Rebuilt on the working pattern.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = (path: string) =>
    new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });

  if (!supabaseAuthConfigured()) {
    return rel("/admin/login?error=oauth_unavailable");
  }

  const origin = publicOriginFromRequest(req, url.searchParams.get("origin"));
  const redirectTo = `${origin}/api/admin/auth/oauth/callback`;
  const { verifier, challenge } = createPkcePair();

  const authorizeUrl = new URL(
    buildGoogleAuthorizeUrl(redirectTo, { prompt: "select_account" }),
  );
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = rel(authorizeUrl.toString());
  response.cookies.set(VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes — consent never takes longer
  });
  return response;
}
