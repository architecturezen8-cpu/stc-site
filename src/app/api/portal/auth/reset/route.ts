import { NextResponse } from "next/server";
import { resetPortalPassword } from "@/lib/portal-password-reset";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.0 — D.1 step 2: code + new password. Consumes the one-time code,
 * replaces the password on EVERY active account bound to that email, kills
 * their live sessions and writes the audit trail. Failure shapes are
 * gentle and uniform ("invalid" / "expired" / "too_many_attempts" /
 * "bad_password") so the form can coach without leaking anything.
 */
export async function POST(req: Request) {
  let body: { email?: string; code?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const email = (body.email || "").trim();
  const code = (body.code || "").trim();
  const password = body.password || "";
  if (!email || !code || !password) {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  try {
    const result = await resetPortalPassword(email, code, password);
    if (result.status !== "ok") {
      return NextResponse.json({ ok: false, status: result.status }, { status: 200 });
    }
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, status: "server_error" }, { status: 200 });
  }
}
