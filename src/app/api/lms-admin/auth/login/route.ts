import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  LMS_ADMIN_SESSION_COOKIE,
  createLmsAdminSessionRow,
  lmsAdminSessionCookieOptions,
  loginLmsAdminWithPassword,
} from "@/lib/lms-admin-auth";
import {
  BUCKET_AUTH_FAILS,
  clearAuthFailures,
  clientIp,
  peekRateLimit,
  recordAuthFailure,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** LMS Admin — email + password sign-in. Issues the portal session cookie. */
export async function POST(req: Request) {
  /* v2.8.78.0 — failed-attempt limiter (8 fails / 15 min per IP), the same
     posture /api/admin/auth/login has always had. This route lives under the
     middleware-exempt /api/lms-admin prefix, so in-route is the only cover. */
  const ip = clientIp(req);
  const retryAfter = peekRateLimit(BUCKET_AUTH_FAILS, `lms-admin:${ip}`);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait 15 minutes." },
      { status: 429, headers: { "retry-after": String(Math.ceil(retryAfter)) } },
    );
  }

  let body: { email?: string; password?: string } = {};
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email || "").trim();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const result = await loginLmsAdminWithPassword(email, password);

  if (result.status === "no_account") {
    recordAuthFailure(`lms-admin:${ip}`);
    return NextResponse.json(
      { error: "No LMS admin account exists for this email." },
      { status: 401 },
    );
  }
  if (result.status === "inactive") {
    return NextResponse.json({ error: "This account has been deactivated." }, { status: 403 });
  }
  if (result.status === "pending") {
    return NextResponse.json(
      { error: "This account is awaiting approval." },
      { status: 403 },
    );
  }
  if (result.status === "no_password") {
    return NextResponse.json(
      { error: "This account is Google-only — use the Google button below." },
      { status: 400 },
    );
  }
  if (result.status === "bad_password") {
    recordAuthFailure(`lms-admin:${ip}`);
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  if (result.status !== "ok") {
    return NextResponse.json({ error: "Sign-in failed." }, { status: 400 });
  }

  clearAuthFailures(`lms-admin:${ip}`);

  const { token, expiresAt } = await createLmsAdminSessionRow(result.accountId);
  const cookieStore = await cookies();
  cookieStore.set(
    LMS_ADMIN_SESSION_COOKIE,
    token,
    lmsAdminSessionCookieOptions(expiresAt),
  );

  return NextResponse.json({ ok: true, redirect: "/lms-admin" });
}
