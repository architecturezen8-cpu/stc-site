import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { PortalUsersPanel } from "@/components/lms-admin/portal-users-panel";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";

export const dynamic = "force-dynamic";

/**
 * LMS ADMIN STUDIO → Portal users (v2.8.67.2, owner request) — every
 * student / teacher / parent account in one read-mostly list: details and
 * emails are fine, passwords are NEVER shown or stored here. Teachers get a
 * backup password reset; students and parents are strictly read-only.
 *
 * The panel fetches its own list from /api/lms-admin/portal-users on mount,
 * so this page stays a thin guard + shell.
 */
export default async function LmsAdminPortalUsersPage() {
  const session = await requireLmsAdmin();

  return (
    <LmsAdminShell
      session={session}
      active="portal-users"
      title="Portal users"
      subtitle="Every portal account — students, teachers, parents, the principal and the LMS admins — details only, never passwords."
    >
      <PortalUsersPanel />
    </LmsAdminShell>
  );
}
