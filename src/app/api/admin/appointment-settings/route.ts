import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  APPOINTMENT_DEPARTMENT_CATALOG,
  getPublishedAppointmentSettings,
  setAppointmentSettings,
  validateAppointmentSettings,
} from "@/lib/appointment-settings";

export const dynamic = "force-dynamic";

/**
 * v2.8.91.0 — the APPOINTMENT SETTINGS API (Admin Studio → Forms →
 * Appointments → "Form settings").
 *
 * GET  /api/admin/appointment-settings → { settings, catalog } — the
 *        published, currently-live values PLUS the four built-in cards
 *        (id + name + phone + …) so the dialog can prefill its per-card
 *        editors; guard forms.read.
 * PUT  /api/admin/appointment-settings body { settings } — validated then
 *        saved AND published in one step (the email-switches pattern), so
 *        the public form follows the office's rule immediately. Audited.
 */
export async function GET() {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;
  const settings = await getPublishedAppointmentSettings();
  return NextResponse.json({ ok: true, settings, catalog: APPOINTMENT_DEPARTMENT_CATALOG });
}

export async function PUT(req: Request) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await req.json()) as { settings?: unknown };
    const verdict = validateAppointmentSettings(body.settings);
    if (!verdict.ok) {
      return NextResponse.json({ error: verdict.error }, { status: 400 });
    }

    await setAppointmentSettings(verdict.settings, admin.id);

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_appointment_settings",
      entity: "site_settings",
      entityId: "appointment_settings",
      details: {
        slots: verdict.settings.timeSlots.length,
        maxPerDay: verdict.settings.maxPerDay,
        maxVisitors: verdict.settings.maxVisitors,
        allowWeekends: verdict.settings.allowWeekends,
        minDaysAhead: verdict.settings.minDaysAhead,
        cardsWithOwnTimes: Object.values(verdict.settings.departments).filter(
          (c) => c.timeSlots.length > 0,
        ).length,
      },
    });

    return NextResponse.json({ ok: true, settings: verdict.settings });
  } catch {
    return NextResponse.json(
      { error: "Unable to save the appointment settings." },
      { status: 400 },
    );
  }
}
