import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  LMS_ADMIN_SESSION_COOKIE,
  createLmsAdminSessionRow,
  lmsAdminSessionCookieOptions,
  loginLmsAdminWithPassword,
} from "@/lib/lms-admin-auth";

export const dynamic = "force-dynamic";

/** LMS Admin — email + password sign-in. Issues the portal session cookie. */
export async function POST(req: Request) {
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
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  if (result.status !== "ok") {
    return NextResponse.json({ error: "Sign-in failed." }, { status: 400 });
  }

  const { token, expiresAt } = await createLmsAdminSessionRow(result.accountId);
  const cookieStore = await cookies();
  cookieStore.set(
    LMS_ADMIN_SESSION_COOKIE,
    token,
    lmsAdminSessionCookieOptions(expiresAt),
  );

  return NextResponse.json({ ok: true, redirect: "/lms-admin" });
}
