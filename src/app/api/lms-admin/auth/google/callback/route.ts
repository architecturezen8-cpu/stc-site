import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  LMS_ADMIN_SESSION_COOKIE,
  LMS_ADMIN_VERIFIER_COOKIE,
  createLmsAdminSessionRow,
  lmsAdminSessionCookieOptions,
  loginLmsAdminViaSupabase,
} from "@/lib/lms-admin-auth";
import { exchangeSupabaseCode } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

/**
 * Google → Supabase → LMS Admin callback.
 *
 * COOKIE DISCIPLINE (the portal-callback rule): every return path sends its
 * cookies on the response it ACTUALLY returns; Location stays RELATIVE.
 * Only an existing ACTIVE lms_admin row earns a session — Google never
 * mints LMS admin accounts.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const respond = (path: string) => {
    const res = new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });
    res.cookies.delete(LMS_ADMIN_VERIFIER_COOKIE);
    return res;
  };

  const store = await cookies();
  const verifier = store.get(LMS_ADMIN_VERIFIER_COOKIE)?.value ?? "";

  const providerError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) {
    return respond("/lms-admin/login?error=oauth_failed");
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return respond("/lms-admin/login?error=oauth_failed");
  }

  let identity;
  try {
    identity = await exchangeSupabaseCode(code, verifier);
  } catch {
    return respond("/lms-admin/login?error=oauth_failed");
  }

  let account;
  try {
    account = await loginLmsAdminViaSupabase(identity);
  } catch {
    return respond("/lms-admin/login?error=oauth_failed");
  }

  if (!account) {
    return respond(
      `/lms-admin/login?error=no_access&email=${encodeURIComponent(identity.email)}`,
    );
  }

  const { token, expiresAt } = await createLmsAdminSessionRow(account.accountId);
  const response = respond("/lms-admin");
  response.cookies.set(
    LMS_ADMIN_SESSION_COOKIE,
    token,
    lmsAdminSessionCookieOptions(expiresAt),
  );
  return response;
}
