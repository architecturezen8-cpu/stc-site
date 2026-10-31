import { desc } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { AdminShell } from "@/components/admin/admin-shell";
import { PortalUsersManager } from "@/components/admin/portal-users-manager";
import { requirePermission } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * Portal Users — the back-office answer to "who manages Student / Teacher /
 * Parent logins?": create, pause, resume, reset passwords and delete portal
 * accounts, and see every self-registration as it happens.
 */
export default async function AdminPortalUsersPage() {
  const admin = await requirePermission("portal", "read");
  await ensureSchemaExtras();

  const users = await db
    .select({
      id: lmsPortalAccounts.id,
      email: lmsPortalAccounts.email,
      role: lmsPortalAccounts.role,
      fullName: lmsPortalAccounts.fullName,
      avatarUrl: lmsPortalAccounts.avatarUrl,
      active: lmsPortalAccounts.active,
      status: lmsPortalAccounts.status,
      passwordHash: lmsPortalAccounts.passwordHash,
      lastLoginAt: lmsPortalAccounts.lastLoginAt,
      createdAt: lmsPortalAccounts.createdAt,
    })
    .from(lmsPortalAccounts)
    .orderBy(desc(lmsPortalAccounts.id))
    .limit(500);

  return (
    <AdminShell
      user={admin}
      title="Portal Users"
      subtitle="Counts, Principal & LMS Admin accounts — the rest read-only (managed in the LMS Admin Studio)"
    >
      <PortalUsersManager
        initialUsers={JSON.parse(
          JSON.stringify(
            users.map((u) => ({
              id: u.id,
              email: u.email,
              role: u.role,
              fullName: u.fullName,
              avatarUrl: u.avatarUrl,
              active: u.active,
              status: u.status,
              hasPassword: Boolean(u.passwordHash),
              lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
              createdAt: u.createdAt.toISOString(),
            })),
          ),
        )}
      />
    </AdminShell>
  );
}
