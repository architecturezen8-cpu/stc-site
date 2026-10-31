import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { ensureSiteEnv } from "@/lib/env-bootstrap";

/**
 * Minimal Supabase Auth helper for the Google OAuth PKCE flow.
 *
 * The portal signs users in through Supabase's hosted /auth/v1/authorize
 * endpoint with an S256 code challenge, then swaps the returned code at
 * /auth/v1/token?grant_type=pkce. No Supabase JS SDK needed server-side.
 */

ensureSiteEnv();

export function supabaseAuthConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || "").trim() &&
      (process.env.SUPABASE_ANON_KEY || "").trim(),
  );
}

/**
 * Admin-invite readiness — the invite flow drives the SERVICE_ROLE admin API
 * (creating users is beyond the anon key's power). Without the service key
 * the invite route degrades gracefully (503 "invites disabled"); Google
 * sign-in and the invite-LINK callback keep working on the anon key.
 */
export function supabaseAdminConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || "").trim() &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  );
}

export function supabaseProjectUrl(): string {
  return (process.env.SUPABASE_URL || "").trim();
}

function supabaseAnonKey(): string {
  return (process.env.SUPABASE_ANON_KEY || "").trim();
}

export type SupabaseIdentity = {
  supabaseUserId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
};

/**
 * Builds the hosted authorize URL.
 *
 * `prompt: "select_account"` is forwarded by Supabase to Google so the
 * account chooser ALWAYS appears — even when the browser still holds a
 * Google session from a previous sign-in. This is the documented
 * queryParams passthrough (same as signInWithOAuth options.queryParams).
 *
 * `max_auth_age=0` forces Google to re-verify the session on every round
 * trip, so a stale Google login never silently skips the chooser either.
 */
export function buildGoogleAuthorizeUrl(
  redirectTo: string,
  opts?: { prompt?: "select_account" | "consent" },
): string {
  const base = supabaseProjectUrl().replace(/\/+$/, "");
  const url = new URL(`${base}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  url.searchParams.set("max_auth_age", "0");
  if (opts?.prompt) url.searchParams.set("prompt", opts.prompt);
  return url.toString();
}

/** PKCE pair used with the hosted authorize endpoint (S256). */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

type SupabaseTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
};

function metaString(meta: Record<string, unknown> | undefined, key: string) {
  const value = meta?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Swaps a PKCE auth code for the user identity. Throws when Supabase
 * rejects the code (expired, wrong verifier, provider error).
 */
export async function exchangeSupabaseCode(
  code: string,
  verifier: string,
): Promise<SupabaseIdentity> {
  const base = supabaseProjectUrl().replace(/\/+$/, "");
  const res = await fetch(`${base}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey(),
      authorization: `Bearer ${supabaseAnonKey()}`,
    },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Supabase token exchange failed (${res.status}): ${detail.slice(0, 200)}`,
    );
  }

  const payload = (await res.json()) as SupabaseTokenResponse;
  const identity = identityFromSupabaseUser(payload.user);
  if (!identity) {
    throw new Error("Supabase token exchange returned no usable identity");
  }
  return identity;
}

/**
 * Supabase email-link verify (invite / magic-link / recovery) — the callback
 * receives ?token_hash=…&type=… and hands it here. Swaps the hash at
 * /auth/v1/verify and maps the verified user to the identity. Returns null
 * when Supabase rejects the hash (expired, already used) so the caller can
 * send the visitor back to the login banner.
 */
export async function verifySupabaseTokenHash(
  tokenHash: string,
  type: string,
): Promise<SupabaseIdentity | null> {
  const base = supabaseProjectUrl().replace(/\/+$/, "");
  const res = await fetch(`${base}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseAnonKey(),
      authorization: `Bearer ${supabaseAnonKey()}`,
    },
    body: JSON.stringify({ type, token_hash: tokenHash }),
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const payload = (await res.json().catch(() => null)) as SupabaseTokenResponse | null;
  return identityFromSupabaseUser(payload?.user) ?? null;
}

function identityFromSupabaseUser(
  user: SupabaseTokenResponse["user"],
): SupabaseIdentity | null {
  const email = (user?.email || "").trim().toLowerCase();
  if (!user?.id || !email) return null;

  const meta = user.user_metadata;
  const fullName =
    metaString(meta, "full_name") ||
    metaString(meta, "name") ||
    email.split("@")[0];
  const avatarUrl =
    metaString(meta, "avatar_url") || metaString(meta, "picture") || null;

  return {
    supabaseUserId: user.id,
    email,
    fullName,
    avatarUrl: avatarUrl || null,
  };
}

/**
 * Supabase admin invite — emails the invitee a sign-up link (service_role
 * required; see supabaseAdminConfigured). Resolves to the created user's id
 * when Supabase accepts, null when it refuses (existing email, provider
 * misconfigured, allow-list blocking the redirect) so the invite route can
 * surface a calm 502 instead of a stack trace.
 */
export async function inviteSupabaseUser(
  email: string,
  redirectTo: string,
): Promise<{ id?: string } | null> {
  const base = supabaseProjectUrl().replace(/\/+$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      email,
      email_confirm: false,
      // GoTrue honours the Site URL + allow-list for the emailed link;
      // redirectTo rides along for audits and future GoTrue versions.
      redirect_to: redirectTo,
    }),
    cache: "no-store",
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const payload = (await res.json().catch(() => null)) as { id?: string } | null;
  return payload ?? {};
}

/**
 * Resolves the public origin for OAuth redirects.
 *
 * Priority:
 *   1. PUBLIC_SITE_URL env pin — the sandbox proxy reports localhost:3000
 *      in Host headers, and a localhost redirect_to is rejected by the
 *      Supabase allowlist (the visitor then lands on the Site URL root
 *      with a dead ?code=). The pin makes EVERY flow — even ones that
 *      never received ?origin= — resolve to the allowlisted preview host.
 *   2. explicit ?origin= (the browser's real preview host)
 *   3. forwarded headers
 *   4. localhost fallback (dev only).
 * Only https/http absolute origins are accepted.
 */
export function publicOriginFromRequest(
  req: Request,
  fallback?: string | null,
): string {
  const candidates = [
    (process.env.PUBLIC_SITE_URL || "").trim() || null,
    new URL(req.url).searchParams.get("origin"),
    fallback,
    req.headers.get("x-forwarded-host")
      ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}`
      : null,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch {
      /* ignore malformed */
    }
  }
  return "http://localhost:3000";
}
