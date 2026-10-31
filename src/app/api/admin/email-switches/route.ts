import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  EMAIL_SWITCH_DEFS,
  getEmailSwitches,
  setEmailSwitches,
  validateEmailSwitches,
} from "@/lib/email-switches";
import { mailerConfigured } from "@/lib/mailer";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.87.0 — the owner's EMAIL SWITCHBOARD (the owner: "adminta control
 * eka thiyenna one — email yawanawada nadda kiyala on/off karanna").
 *
 * GET /api/admin/email-switches
 *   → { switches, defs, mailerConfigured } — the current on/off state,
 *     the display metadata, and whether the Mailjet keys are set at all.
 * PUT /api/admin/email-switches
 *   body { switches: { [key]: boolean } } — every known key must be a
 *   boolean (unknown keys ignored); security mail is NOT on this board and
 *   can never be turned off. Audited to admin_audit_logs.
 */
export async function GET() {
  const admin = await guardApi("settings", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();
  const switches = await getEmailSwitches();
  return NextResponse.json({
    switches,
    defs: EMAIL_SWITCH_DEFS,
    mailerConfigured: mailerConfigured(),
  });
}

export async function PUT(req: Request) {
  const admin = await guardApi("settings", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const body = (await req.json()) as { switches?: unknown };
    const verdict = validateEmailSwitches(body.switches);
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.error }, { status: 400 });
    }

    await setEmailSwitches(verdict.switches, admin.id);

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_email_switches",
      entity: "site_settings",
      entityId: "email_switches",
      details: {
        off: Object.entries(verdict.switches)
          .filter(([, on]) => !on)
          .map(([key]) => key),
      },
    });

    return NextResponse.json({ ok: true, switches: verdict.switches });
  } catch {
    return NextResponse.json({ error: "Unable to save the email switches." }, { status: 400 });
  }
}
