import { NextResponse } from "next/server";
import {
  createPortalSessionRow,
  isPortalRole,
  loginPortalWithPassword,
  portalCookieName,
  portalSessionCookieOptions,
} from "@/lib/portal-auth";
import { resolvePortalLoginEmail } from "@/lib/verification";
import {
  BUCKET_AUTH_FAILS,
  clearAuthFailures,
  clientIp,
  peekRateLimit,
  recordAuthFailure,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Email + password portal sign-in. Returns HTTP 200 with {ok:false,status}
 * for every failure shape so the form can render a gentle inline message
 * instead of a scary error page.
 */
export async function POST(req: Request) {
  /* v2.8.78.0 — failed-attempt limiter (8 fails / 15 min per IP). This route
     answers its failures with HTTP 200 status phrases, so the limiter keeps
     that contract: a limited caller gets {ok:false,status:"rate_limited"}
     which the sign-in form renders with its own gentle message. */
  const ip = clientIp(req);
  if (peekRateLimit(BUCKET_AUTH_FAILS, `portal:${ip}`) > 0) {
    return NextResponse.json({ ok: false, status: "rate_limited" }, { status: 200 });
  }

  let body: { role?: string; email?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const role = body.role;
  /* Students may type their ADMISSION NUMBER in the email field — the same
     mapping used at registration turns it into their portal identity. */
  const email = resolvePortalLoginEmail(
    isPortalRole(role) ? role : "student",
    (body.email || "").trim(),
  );
  const password = body.password || "";

  if (!isPortalRole(role) || !email || !password) {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  try {
    const result = await loginPortalWithPassword(role, email, password);
    if (result.status !== "ok") {
      /* wrong_role carries the role the credentials DO open — the form
         offers a one-tap switch (re-verifying the same credentials).
         pending = verified against the register but awaiting office
         approval — the account must not open yet. */
      /* v2.8.78.0 — identity/password failures feed the attempt limiter. */
      if (result.status === "no_account" || result.status === "bad_password") {
        recordAuthFailure(`portal:${ip}`);
      }
      return NextResponse.json(
        result.status === "wrong_role"
          ? { ok: false, status: "wrong_role", role: result.otherRole }
          : { ok: false, status: result.status },
        { status: 200 },
      );
    }

    const { token, expiresAt } = await createPortalSessionRow(result.accountId);
    clearAuthFailures(`portal:${ip}`);
    /* v2.8.67.0 — mustChangePassword sends the login straight to
       /account/secure (teacher-issued temp password must be replaced). */
    const response = NextResponse.json(
      {
        ok: true,
        redirect: result.mustChangePassword ? "/account/secure" : result.redirect,
        mustChangePassword: result.mustChangePassword,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
    response.cookies.set(
      portalCookieName(role),
      token,
      portalSessionCookieOptions(expiresAt),
    );
    return response;
  } catch {
    return NextResponse.json({ ok: false, status: "server_error" }, { status: 200 });
  }
}
