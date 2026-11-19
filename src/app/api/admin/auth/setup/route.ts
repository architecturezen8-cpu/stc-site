import { NextResponse } from "next/server";
import {
  adminSetupAvailable,
  createAdminSession,
  createFirstAdmin,
} from "@/lib/admin-auth";
import { ensureCmsSeed } from "@/lib/cms";
import { BUCKET_SETUP, clientIp, hitRateLimit } from "@/lib/rate-limit";

export async function GET() {
  return NextResponse.json({ available: await adminSetupAvailable() });
}

export async function POST(req: Request) {
  /* v2.8.78.0 — the one-time bootstrap mints the FIRST super admin, so even
     a closed setup endpoint gets a light all-attempts cap (10 / 10 min). */
  const retry = hitRateLimit(BUCKET_SETUP, `admin-setup:${clientIp(req)}`);
  if (retry > 0) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes." },
      { status: 429, headers: { "retry-after": String(Math.ceil(retry)) } },
    );
  }
  try {
    const { name, email, password, confirmPassword } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }
    const user = await createFirstAdmin({ name, email, password });
    await ensureCmsSeed();
    await createAdminSession(user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Setup failed." },
      { status: 400 },
    );
  }
}
