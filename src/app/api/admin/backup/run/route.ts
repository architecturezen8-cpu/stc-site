import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { backupConfigured, dispatchBackup } from "@/lib/backup-store";

export const dynamic = "force-dynamic";

/**
 * v2.8.73.0 — POST "Backup now" from the Admin Studio → Backup section:
 * dispatches the store repo's daily-db-backup workflow (workflow_dispatch).
 * The studio polls GET /api/admin/backup until the run completes.
 */
export async function POST() {
  const admin = await guardApi("backup", "edit");
  if (admin instanceof NextResponse) return admin;

  if (!backupConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Backup store is not configured." },
      { status: 409 },
    );
  }

  try {
    const ok = await dispatchBackup();
    if (!ok) throw new Error("dispatch_failed");
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "backup_run_now",
      entity: "db_backup_store",
      entityId: process.env.DB_BACKUP_REPO ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not start the backup — try again." },
      { status: 500 },
    );
  }
}
