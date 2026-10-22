import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  OAUTH_CHOICE_COOKIE,
  OAUTH_ROLE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  PORTAL_HOME,
  createPortalSessionRow,
  isPortalRole,
  loginPortalViaSupabase,
  portalCookieName,
  portalSessionCookieOptions,
} from "@/lib/portal-auth";
import { issuePortalChoiceToken } from "@/lib/portal-choice";
import { exchangeSupabaseCode } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

/**
 * Google → Supabase → portal callback.
 *
 * COOKIE DISCIPLINE (this was the login bug): every return path must send
 * its cookies on the response it ACTUALLY returns. The old code set the
 * session/chooser cookie on a `response` object built at the top and then
 * `return rel(...)`ed a BRAND-NEW response for the redirect — the browser
 * never received the cookie, so a successful Google sign-in bounced back
 * to /login (single-role) or to an empty /login/choose (multi-role). The
 * admin callback never had this bug because it mutates ONE response.
 *
 * `respond(path)` therefore builds the final 303 with the PKCE cleanup
 * already attached; callers add their extra cookie to THAT object and
 * return it. Location stays RELATIVE (sandbox proxy reports
 * Host: localhost:3000; browsers resolve relative Locations against the
 * origin the address bar already shows).
 *
 * Routing by stored roles (the role card clicked is only a hint):
 *   0 accounts → /login/[hint]?error=not_registered  (calm amber notice)
 *   1 account  → direct session + portal home
 *   >1         → one-time chooser token → /login/choose
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const respond = (path: string) => {
    const res = new NextResponse(null, {
      status: 303,
      headers: { location: path, "cache-control": "no-store" },
    });
    /* PKCE + role-hint cookies are one-shot — clear them on EVERY exit. */
    res.cookies.delete(OAUTH_VERIFIER_COOKIE);
    res.cookies.delete(OAUTH_ROLE_COOKIE);
    res.cookies.delete(OAUTH_CHOICE_COOKIE);
    return res;
  };

  const store = await cookies();
  const verifier = store.get(OAUTH_VERIFIER_COOKIE)?.value ?? "";
  const roleHintRaw = store.get(OAUTH_ROLE_COOKIE)?.value ?? "";
  const roleHint = isPortalRole(roleHintRaw) ? roleHintRaw : "student";

  const providerError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) {
    return respond(`/login/${roleHint}?error=oauth_failed`);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return respond(`/login/${roleHint}?error=oauth_failed`);
  }

  let identity;
  try {
    identity = await exchangeSupabaseCode(code, verifier);
  } catch {
    return respond(`/login/${roleHint}?error=oauth_failed`);
  }

  const emailQuery = `email=${encodeURIComponent(identity.email)}`;

  let accounts;
  try {
    accounts = await loginPortalViaSupabase(identity);
  } catch {
    return respond(`/login/${roleHint}?error=oauth_failed`);
  }

  if (accounts.length === 0) {
    return respond(`/login/${roleHint}?error=not_registered&${emailQuery}`);
  }

  /* v2.8.33.0 — PENDING accounts (awaiting office approval) must never
     open a session or appear in the chooser. Active accounts only. */
  const active = accounts.filter((account) => (account.status ?? "active") !== "pending");
  const clickedRolePending = accounts.some(
    (account) => account.role === roleHint && (account.status ?? "active") === "pending",
  );

  if (active.length === 0) {
    return respond(
      clickedRolePending
        ? `/login/${roleHint}?error=pending`
        : `/login/${roleHint}?error=not_registered&${emailQuery}`,
    );
  }

  /* ROLE INTENT — the portal whose card the visitor clicked is the portal
     they WANT. If this Google identity holds an active account for that
     role, sign them straight into it (no chooser, even when other roles
     exist). Only when the selected role is missing do we show the
     wrong-portal notice page listing the roles they DO hold. */
  const matching = active.find((account) => account.role === roleHint);
  if (matching) {
    const { token, expiresAt } = await createPortalSessionRow(matching.id);
    const response = respond(PORTAL_HOME[roleHint]);
    response.cookies.set(
      portalCookieName(roleHint),
      token,
      portalSessionCookieOptions(expiresAt),
    );
    return response;
  }

  if (clickedRolePending) {
    return respond(`/login/${roleHint}?error=pending`);
  }

  const choiceToken = await issuePortalChoiceToken({
    email: identity.email,
    roles: active.map((account) => account.role).filter(isPortalRole),
  });
  const response = respond(
    `/login/choose?notice=wrong_portal&selected=${roleHint}`,
  );
  response.cookies.set(OAUTH_CHOICE_COOKIE, choiceToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
