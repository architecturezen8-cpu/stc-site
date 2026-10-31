import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { StoragePanel } from "@/components/lms-admin/storage-panel";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.67.3 — D.3: the LMS Admin Studio's own Storage & Quotas page. Same
 * data as the website Admin's module (GET /api/admin/storage now serves
 * both), but the panel is studio-themed (--la-* tokens) and widened to
 * every role: students, teachers and parents in one place — caps settable
 * per person, per-person file drawers, the cleanup marks. Nothing is
 * deleted automatically anywhere in D.3; every purge is a confirmed click.
 */
export default async function LmsAdminStoragePage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  return (
    <LmsAdminShell
      session={session}
      active="storage"
      title="Storage & Quotas"
      subtitle="Teacher, student and parent storage in one place — nothing is deleted automatically."
    >
      <StoragePanel />
    </LmsAdminShell>
  );
}
