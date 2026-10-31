import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  BACKUP_FREQUENCIES,
  backupStatus,
  isDestination,
  patchSchedule,
  setVariable,
  type BackupFrequency,
} from "@/lib/backup-store";

export const dynamic = "force-dynamic";

/**
 * v2.8.74.0 — POST backup settings from the Admin Studio → Backup section
 * (owner: "backup setting okkoma admin studio eke backup section eken
 * controll karanna puluwan wenna ona"). Everything lands as repo VARIABLES
 * on the private store repo (+ one Contents commit when the schedule
 * (hour and/or frequency) changes — frequency picks the cron's day-part).
 * Every change is audited.
 *
 * Body: { enabled?, keepDaily?, keepMonthly?, scheduleHour?, frequency?,
 *         destination? }
 */
export async function POST(req: Request) {
  const admin = await guardApi("backup", "edit");
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as {
    enabled?: unknown;
    keepDaily?: unknown;
    keepMonthly?: unknown;
    scheduleHour?: unknown;
    frequency?: unknown;
    destination?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const keepDaily =
    body.keepDaily === undefined
      ? null
      : Number.parseInt(String(body.keepDaily), 10);
  const keepMonthly =
    body.keepMonthly === undefined
      ? null
      : Number.parseInt(String(body.keepMonthly), 10);
  const scheduleHour =
    body.scheduleHour === undefined || body.scheduleHour === null
      ? null
      : Number.parseInt(String(body.scheduleHour), 10);
  const frequency =
    body.frequency === undefined || body.frequency === null
      ? null
      : String(body.frequency);
  const destination =
    body.destination === undefined || body.destination === null
      ? null
      : String(body.destination);

  if (keepDaily !== null && (!Number.isFinite(keepDaily) || keepDaily < 7 || keepDaily > 730)) {
    return NextResponse.json(
      { ok: false, error: "Daily retention must be between 7 and 730 days." },
      { status: 400 },
    );
  }
  if (
    keepMonthly !== null &&
    (!Number.isFinite(keepMonthly) || keepMonthly < 30 || keepMonthly > 3650)
  ) {
    return NextResponse.json(
      { ok: false, error: "Monthly retention must be between 30 and 3650 days." },
      { status: 400 },
    );
  }
  if (scheduleHour !== null && (!Number.isFinite(scheduleHour) || scheduleHour < 0 || scheduleHour > 23)) {
    return NextResponse.json(
      { ok: false, error: "Schedule hour must be between 0 and 23." },
      { status: 400 },
    );
  }
  if (frequency !== null && !(BACKUP_FREQUENCIES as readonly string[]).includes(frequency)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Frequency must be one of: ${(BACKUP_FREQUENCIES as readonly string[]).join(", ")}.`,
      },
      { status: 400 },
    );
  }
  if (destination !== null && !isDestination(destination)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Destination must be one of: github, drive, both.",
      },
      { status: 400 },
    );
  }

  try {
    if (typeof body.enabled === "boolean") {
      const okv = await setVariable("DB_BACKUP_ENABLED", body.enabled ? "true" : "false");
      if (!okv) throw new Error("variable_write_failed");
    }
    if (keepDaily !== null) {
      const okv = await setVariable("DB_BACKUP_KEEP_DAILY", String(keepDaily));
      if (!okv) throw new Error("variable_write_failed");
    }
    if (keepMonthly !== null) {
      const okv = await setVariable("DB_BACKUP_KEEP_MONTHLY", String(keepMonthly));
      if (!okv) throw new Error("variable_write_failed");
    }
    if (frequency !== null) {
      const okv = await setVariable("DB_BACKUP_FREQUENCY", frequency as BackupFrequency);
      if (!okv) throw new Error("variable_write_failed");
    }
    if (destination !== null) {
      const okv = await setVariable("DB_BACKUP_DESTINATION", destination);
      if (!okv) throw new Error("variable_write_failed");
    }
    if (scheduleHour !== null || frequency !== null) {
      const okc = await patchSchedule({
        hour: scheduleHour ?? undefined,
        frequency: (frequency as BackupFrequency) ?? undefined,
      });
      if (!okc) throw new Error("cron_write_failed");
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "backup_settings_update",
      entity: "db_backup_store",
      entityId: JSON.stringify({
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        keepDaily: keepDaily ?? undefined,
        keepMonthly: keepMonthly ?? undefined,
        scheduleHour: scheduleHour ?? undefined,
        frequency: frequency ?? undefined,
        destination: destination ?? undefined,
      }).slice(0, 200),
    });

    const status = await backupStatus();
    return NextResponse.json({ ok: true, status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the backup settings — try again." },
      { status: 500 },
    );
  }
}
