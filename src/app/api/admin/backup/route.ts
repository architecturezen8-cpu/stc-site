import { NextResponse } from "next/server";
import { guardApi } from "@/lib/admin-auth";
import { backupStatus } from "@/lib/backup-store";

export const dynamic = "force-dynamic";

/**
 * v2.8.73.0 — GET the whole backup picture for the Admin Studio → Backup
 * section: settings (repo variables), the dump list, the recent Actions runs
 * and the last success time. super_admin only (module "backup").
 */
export async function GET() {
  const denied = await guardApi("backup", "read");
  if (denied instanceof NextResponse) return denied;

  try {
    const status = await backupStatus();
    return NextResponse.json({ ok: true, status });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not reach the backup store." },
      { status: 500 },
    );
  }
}
