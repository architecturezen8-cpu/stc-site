import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionRow,
  loginAdminViaGoogle,
} from "@/lib/admin-auth";
import { exchangeSupabaseCode } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

const VERIFIER_COOKIE = "stc_admin_pkce";

/**
 * Admin Google sign-in CALLBACK.
 *
 * - verified Google email exists in admin_users + active → session + /admin
 * - unknown email → calm notice on the login page (never auto-provisions)
 * - disabled account → same page, distinct notice
 *
 * Every redirect uses a RELATIVE Location and every cookie is attached to
 * THIS response object (sandbox proxies report localhost in Host headers).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = (path: string) =>
    new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });

  const store = await cookies();
  const verifier = store.get(VERIFIER_COOKIE)?.value ?? "";

  const response = rel("/admin/login");
  response.cookies.delete(VERIFIER_COOKIE);

  const providerError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (providerError || !code) {
    return rel("/admin/login?error=google_failed");
  }

  let identity;
  try {
    identity = await exchangeSupabaseCode(code, verifier);
  } catch {
    return rel("/admin/login?error=google_failed");
  }

  let result;
  try {
    result = await loginAdminViaGoogle({
      email: identity.email,
      fullName: identity.fullName,
      avatarUrl: identity.avatarUrl,
    });
  } catch {
    return rel("/admin/login?error=google_failed");
  }

  if (result.status === "not_admin") {
    return rel(
      `/admin/login?error=google_not_admin&email=${encodeURIComponent(identity.email)}`,
    );
  }
  if (result.status === "inactive") {
    return rel(
      `/admin/login?error=google_disabled&email=${encodeURIComponent(identity.email)}`,
    );
  }

  const { token, expiresAt } = await createAdminSessionRow(result.user.id);
  response.cookies.set(ADMIN_COOKIE, token, adminSessionCookieOptions(expiresAt));
  response.headers.set("location", "/admin");
  return response;
}
