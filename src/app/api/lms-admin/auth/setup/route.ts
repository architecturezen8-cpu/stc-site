import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  LMS_ADMIN_SESSION_COOKIE,
  createFirstLmsAdmin,
  createLmsAdminSessionRow,
  lmsAdminSessionCookieOptions,
  lmsAdminSetupAvailable,
} from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { BUCKET_SETUP, clientIp, hitRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Setup availability — TRUE only while zero lms_admin accounts exist. */
export async function GET() {
  return NextResponse.json({ available: await lmsAdminSetupAvailable() });
}

/** One-time creation of the FIRST LMS admin (closes permanently after). */
export async function POST(req: Request) {
  await ensureSchemaExtras();

  /* v2.8.78.0 — same light all-attempts cap as the main-admin setup route:
     the bootstrap mints the first studio account, so cap probing. */
  const retry = hitRateLimit(BUCKET_SETUP, `lms-setup:${clientIp(req)}`);
  if (retry > 0) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes." },
      { status: 429, headers: { "retry-after": String(Math.ceil(retry)) } },
    );
  }

  let body: {
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { name, email, password, confirmPassword } = body;
  if (!name || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords do not match." },
      { status: 400 },
    );
  }

  try {
    const account = await createFirstLmsAdmin({
      name,
      email,
      password,
    });

    const { token, expiresAt } = await createLmsAdminSessionRow(account.id);
    const cookieStore = await cookies();
    cookieStore.set(
      LMS_ADMIN_SESSION_COOKIE,
      token,
      lmsAdminSessionCookieOptions(expiresAt),
    );

    return NextResponse.json({ ok: true, redirect: "/lms-admin" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed." },
      { status: 400 },
    );
  }
}
