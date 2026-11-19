import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.8 — LMS ADMIN SELF-SERVICE DETAILS
   (owner: "aya machan ewage acc eka haduwa haduwamai details mukuth adala
   owner ta edit karanna ba"). The studio's identity card was frozen since
   creation — this lets the signed-in admin update their own display name
   and the account-level phone. The login email stays read-only: it is
   the sign-in identity and the main office manages it.
   ──────────────────────────────────────────────────────────────────────── */

const PHONE_ALLOWED = /^[0-9+()\-\s]{0,30}$/;

function json(status: string, code: number) {
  return NextResponse.json({ ok: false, status }, { status: code });
}

export async function POST(req: Request) {
  const session = await getLmsAdminSession();
  if (!session) return json("unauthorized", 401);

  let body: { fullName?: unknown; phone?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json("bad_request", 400);
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
  if (fullName.length < 2 || fullName.length > 120) return json("bad_name", 400);

  let phone: string | null = null;
  if (typeof body.phone === "string") {
    const trimmed = body.phone.trim();
    if (trimmed.length > 0) {
      if (!PHONE_ALLOWED.test(trimmed)) return json("bad_phone", 400);
      phone = trimmed;
    }
  } else if (body.phone != null) {
    return json("bad_phone", 400);
  }

  await ensureSchemaExtras();

  try {
    await db
      .update(lmsPortalAccounts)
      .set({ fullName, phone })
      .where(eq(lmsPortalAccounts.id, session.accountId));

    await db.insert(adminAuditLogs).values({
      userId: null,
      action: "lms_admin_profile_updated",
      entity: "lms_portal_account",
      entityId: String(session.accountId),
      details: { via: "lms_admin_profile", fullName, phone },
    });

    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return json("server_error", 500);
  }
}
