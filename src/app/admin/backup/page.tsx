import { AdminShell } from "@/components/admin/admin-shell";
import { BackupManager } from "@/components/admin/backup-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * v2.8.74.0 — Admin Studio → BACKUP. The owner's ask:
 * "main admin studio eke backup section eka hadala na ne. backup setting
 * okkoma admin studio eke backup section eken controll karanna puluwan
 * wenna ona" — the Supabase database backup (dump store:
 * novaartstorelk-alt/school-site-db-backups, private) is fully controlled
 * from here: on/off, frequency (daily / weekly / monthly / every 3 months /
 * yearly), schedule hour, retention sizes, "Backup now", dump downloads and
 * run history — plus the destination cards (GitHub store + Google Drive
 * mirror). super_admin only (module "backup").
 */
export default async function AdminBackupPage() {
  const admin = await requirePermission("backup", "edit");
  return (
    <AdminShell
      user={admin}
      title="Backup"
      subtitle="Database backups — students, staff and every site record, stored privately on schedule"
    >
      <BackupManager />
    </AdminShell>
  );
}
