import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { LmsRolloverManager } from "@/components/admin/lms-rollover-manager";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * LMS Admin → Academic year — the yearly promotion run: new-year classes,
 * class-teacher assignments, grade-11 (O/L) and grade-13 (A/L) graduations,
 * repeats and leavers — one guided, transactional wizard.
 */
export default async function LmsAdminPromotionPage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  return (
    <LmsAdminShell
      session={session}
      active="promotion"
      title="Academic Year Rollover"
      subtitle="Promote every class into the new year, assign class teachers, graduate the O/L and A/L leavers — one guided run each December or January"
    >
      <LmsRolloverManager />
    </LmsAdminShell>
  );
}
