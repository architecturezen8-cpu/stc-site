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
  const user = payload.user;
  const email = (user?.email || "").trim().toLowerCase();
  if (!user?.id || !email) {
    throw new Error("Supabase token exchange returned no usable identity");
  }

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
