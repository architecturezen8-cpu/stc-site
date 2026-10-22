import { NextResponse } from "next/server";
import { LMS_ADMIN_VERIFIER_COOKIE } from "@/lib/lms-admin-auth";
import {
  buildGoogleAuthorizeUrl,
  createPkcePair,
  publicOriginFromRequest,
  supabaseAuthConfigured,
} from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

/**
 * LMS Admin Google sign-in — PKCE start. Same hosted-authorize chain as the
 * portal, but the callback routes to the LMS Admin Studio and only accepts
 * identities that already hold an active lms_admin account.
 */
export async function GET(req: Request) {
  const rel = (path: string) =>
    new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });

  if (!supabaseAuthConfigured()) {
    return rel("/lms-admin/login?error=oauth_unconfigured");
  }

  const url = new URL(req.url);
  const origin = publicOriginFromRequest(req, url.searchParams.get("origin"));
  const redirectTo = `${origin}/api/lms-admin/auth/google/callback`;
  const { verifier, challenge } = createPkcePair();

  const authorizeUrl = new URL(
    buildGoogleAuthorizeUrl(redirectTo, { prompt: "select_account" }),
  );
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = rel(authorizeUrl.toString());
  response.cookies.set(LMS_ADMIN_VERIFIER_COOKIE, verifier, {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
