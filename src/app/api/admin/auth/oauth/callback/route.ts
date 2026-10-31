import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  adminSessionCookieOptions,
  createAdminSessionRow,
  loginAdminViaSupabase,
} from "@/lib/admin-auth";
import {
  exchangeSupabaseCode,
  supabaseAuthConfigured,
  verifySupabaseTokenHash,
  type SupabaseIdentity,
} from "@/lib/supabase-auth";
import { ensureCmsSeed } from "@/lib/cms";

export const dynamic = "force-dynamic";

const VERIFIER_COOKIE = "stc_oauth_verifier";

/**
 * OAuth / invite-link callback — the /api/admin/auth/oauth pair's twin of the
 * google callback, PLUS the ?token_hash=… branch that accepts Supabase invite
 * emails (the Role Management invite flow redirects here).
 *  • ?code=…                → Google round-trip via Supabase (PKCE exchange)
 *  • ?token_hash=…&type=…   → Supabase email links (invite / recovery)
 * On success the identity is matched by email to an EXISTING admin_users row
 * (invite-only studio — never auto-provisioned), a session row is minted and
 * the admin cookie is attached to THIS response. All redirects RELATIVE.
 *
 * v2.8.87.1 fix: the committed version imported lib functions that never
 * existed, used identity.id instead of supabaseUserId and never minted a
 * session — every Google/invite finish bounced back to the login screen.
 */
export async function GET(req: Request) {
  const rel = (path: string) =>
    new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });

  const params = new URL(req.url).searchParams;

  // Supabase round-trips errors as ?error=…&error_description=…
  if (params.get("error")) return rel("/admin/login?error=oauth_failed");
  if (!supabaseAuthConfigured()) return rel("/admin/login?error=oauth_unavailable");

  const store = await cookies();
  let identity: SupabaseIdentity | null = null;

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  try {
    if (code) {
      const verifier = store.get(VERIFIER_COOKIE)?.value ?? "";
      if (!verifier) return rel("/admin/login?error=oauth_expired");
      identity = await exchangeSupabaseCode(code, verifier);
    } else if (tokenHash) {
      identity = await verifySupabaseTokenHash(
        tokenHash,
        params.get("type") ?? "invite",
      );
    } else {
      return rel("/admin/login?error=oauth_failed");
    }
  } catch {
    return rel("/admin/login?error=oauth_failed");
  }

  store.delete(VERIFIER_COOKIE);

  if (!identity) return rel("/admin/login?error=oauth_failed");

  let user;
  try {
    user = await loginAdminViaSupabase({
      email: identity.email,
      supabaseUserId: identity.supabaseUserId,
      fullName: identity.fullName,
      avatarUrl: identity.avatarUrl,
    });
  } catch {
    return rel("/admin/login?error=oauth_failed");
  }

  // The refused email goes back to the banner so the visitor immediately sees
  // WHICH Google account needs to be added in Role Management.
  if (!user) {
    return rel(
      `/admin/login?error=not_authorized&email=${encodeURIComponent(identity.email)}`,
    );
  }

  await ensureCmsSeed().catch(() => undefined);
  const { token, expiresAt } = await createAdminSessionRow(user.id);
  const response = rel("/admin");
  response.cookies.set(ADMIN_COOKIE, token, adminSessionCookieOptions(expiresAt));
  return response;
}
