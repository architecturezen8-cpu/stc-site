import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { LmsSetupManager } from "@/components/admin/lms-setup-manager";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * LMS Admin → LMS Setup — classes, subjects, teaching assignments and
 * enrollment (the master data behind the portals).
 * (Moved out of the website Admin Studio in v2.8.35.0 — module isolation.)
 */
export default async function LmsAdminManagePage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  return (
    <LmsAdminShell
      session={session}
      active="manage"
      title="LMS Setup"
      subtitle="Classes, subjects, teaching assignments and enrollment — the master data behind the portals"
    >
      <LmsSetupManager />
    </LmsAdminShell>
  );
}
