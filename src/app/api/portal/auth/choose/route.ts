import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  OAUTH_CHOICE_COOKIE,
  PORTAL_HOME,
  createPortalSessionRow,
  isPortalRole,
  portalCookieName,
  portalSessionCookieOptions,
} from "@/lib/portal-auth";
import { takePortalChoiceToken } from "@/lib/portal-choice";

export const dynamic = "force-dynamic";

/**
 * Burns the one-time chooser token and opens the chosen portal session.
 * 401 = token missing/expired, 400 = role missing, 403 = role not offered.
 */
export async function POST(req: Request) {
  let body: { role?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const role = body.role;
  if (!isPortalRole(role)) {
    return NextResponse.json(
      { ok: false, error: "Pick one of the portals shown." },
      { status: 400 },
    );
  }

  const store = await cookies();
  const token = store.get(OAUTH_CHOICE_COOKIE)?.value;
  const choice = token ? await takePortalChoiceToken(token) : null;
  if (!choice) {
    return NextResponse.json(
      { ok: false, error: "expired" },
      { status: 401 },
    );
  }

  if (!choice.roles.includes(role)) {
    return NextResponse.json(
      { ok: false, error: "not_allowed" },
      { status: 403 },
    );
  }

  const accounts = await import("@/lib/portal-auth").then((m) =>
    m.findPortalAccountsByEmail(choice.email),
  );
  const account = accounts.find((row) => row.role === role);
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "expired" },
      { status: 401 },
    );
  }

  const { token: sessionToken, expiresAt } = await createPortalSessionRow(
    account.id,
  );
  const response = NextResponse.json(
    { ok: true, redirect: PORTAL_HOME[role] },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
  response.cookies.set(
    portalCookieName(role),
    sessionToken,
    portalSessionCookieOptions(expiresAt),
  );
  response.cookies.delete(OAUTH_CHOICE_COOKIE);
  return response;
}
