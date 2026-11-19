import { NextResponse } from "next/server";
import { findPortalAccountsForLogin, isPortalRole } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.10 — REGISTRATION STATUS POLL (owner: "acc ekak manual approve
   karama or reject karama adala acc eke approve eka enakan inna kena page
   eka refresh karanna ona naththan eka wenne na").

   The register form's waiting screen pings this every few seconds, so the
   moment the office approves or rejects, the SAME page flips to the honest
   state — no manual refresh. Public (no session yet), but deliberately
   TINY: it returns only the lifecycle status and — for a rejection — the
   reason the office typed. Nothing else about the account leaks.
   ──────────────────────────────────────────────────────────────────── */

export async function POST(req: Request) {
  let body: { role?: string; identifier?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, status: "none" }, { status: 200 });
  }

  const role = body.role;
  const identifier = (body.identifier || "").trim();
  if (!isPortalRole(role) || !identifier) {
    return NextResponse.json({ ok: true, status: "none" }, { status: 200 });
  }

  try {
    const candidates = await findPortalAccountsForLogin(identifier);
    const account = candidates.find((row) => row.role === role);
    if (!account) {
      return NextResponse.json({ ok: true, status: "none" }, { status: 200 });
    }
    return NextResponse.json(
      {
        ok: true,
        status: account.status,
        reason: account.status === "rejected" ? (account.rejectReason ?? null) : null,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: true, status: "none" }, { status: 200 });
  }
}
