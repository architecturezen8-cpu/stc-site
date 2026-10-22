import { NextResponse } from "next/server";
import { adminSetupAvailable, loginAdmin } from "@/lib/admin-auth";
import { ensureCmsSeed } from "@/lib/cms";

const globalForLogin = globalThis as typeof globalThis & {
  __stcLoginAttempts?: Map<string, { count: number; resetAt: number }>;
};
const attempts = globalForLogin.__stcLoginAttempts ?? new Map();
globalForLogin.__stcLoginAttempts = attempts;

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const record = attempts.get(ip);
    if (record && record.resetAt > now && record.count >= 8) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait 15 minutes." },
        { status: 429 },
      );
    }
    if (await adminSetupAvailable()) {
      return NextResponse.json(
        { error: "Complete first-time setup before signing in.", setup: true },
        { status: 409 },
      );
    }
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    const user = await loginAdmin(email, password);
    if (!user) {
      const current = attempts.get(ip);
      attempts.set(ip, {
        count: current && current.resetAt > now ? current.count + 1 : 1,
        resetAt: now + 15 * 60 * 1000,
      });
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }
    attempts.delete(ip);
    await ensureCmsSeed();
    return NextResponse.json({ success: true, name: user.name });
  } catch {
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
  }
}
