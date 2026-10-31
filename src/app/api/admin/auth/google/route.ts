import { NextResponse } from "next/server";
import {
  buildGoogleAuthorizeUrl,
  createPkcePair,
  publicOriginFromRequest,
  supabaseAuthConfigured,
} from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const VERIFIER_COOKIE = "stc_admin_pkce";

/**
 * Admin Google sign-in START — same PKCE chain as the portal flow, but the
 * callback only ever authenticates EXISTING admin_users rows (invite-only
 * studio; Google never mints admin accounts). `prompt=select_account` is
 * forwarded so the Google account chooser always appears.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = (path: string) =>
    new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });

  if (!supabaseAuthConfigured()) {
    return rel("/admin/login?error=google_unavailable");
  }

  const origin = publicOriginFromRequest(req, url.searchParams.get("origin"));
  const redirectTo = `${origin}/api/admin/auth/google/callback`;
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
    maxAge: 600,
  });
  return response;
}
