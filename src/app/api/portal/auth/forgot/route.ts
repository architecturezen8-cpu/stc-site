import { NextResponse } from "next/server";
import { requestPortalPasswordReset } from "@/lib/portal-password-reset";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.0 — D.1 step 1: "I forgot my password."
 *
 * The answer is GENERIC on purpose: "sent", "no_email" (only for the
 * synthetic student identity domain — leaks nothing, since every such
 * address answers the same regardless of account existence) or
 * "rate_limited". Unknown emails get the same "sent" as known ones.
 * In development the response may carry devCode so sandbox QA can
 * complete the loop without reading mail — never in production.
 */
export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const email = (body.email || "").trim();
  if (!email) {
    return NextResponse.json({ ok: false, status: "bad_request" }, { status: 200 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  try {
    const result = await requestPortalPasswordReset(email, ip);
    return NextResponse.json(
      { ok: true, status: result.status, ...(result.devCode ? { devCode: result.devCode } : {}) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, status: "server_error" }, { status: 200 });
  }
}
