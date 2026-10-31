import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import {
  PendingVerificationsManager,
  type PendingRegistration,
} from "@/components/admin/pending-verifications-manager";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * LMS Admin → Registration Approvals — the office queue for
 * self-registrations the register matcher could not fully verify.
 * (Moved out of the website Admin Studio in v2.8.35.0 — module isolation.)
 */
export default async function LmsAdminRegistrationsPage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  const rows = await db
    .select({
      id: lmsPortalAccounts.id,
      email: lmsPortalAccounts.email,
      role: lmsPortalAccounts.role,
      fullName: lmsPortalAccounts.fullName,
      verification: lmsPortalAccounts.verification,
      createdAt: lmsPortalAccounts.createdAt,
    })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.status, "pending"))
    .orderBy(desc(lmsPortalAccounts.id))
    .limit(300);

  const pending: PendingRegistration[] = JSON.parse(
    JSON.stringify(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        fullName: row.fullName,
        details: (() => {
          try {
            return row.verification
              ? (JSON.parse(row.verification) as Record<string, unknown>)
              : null;
          } catch {
            return null;
          }
        })(),
        createdAt: row.createdAt.toISOString(),
      })),
    ),
  );

  return (
    <LmsAdminShell
      session={session}
      active="registrations"
      title="Registration Approvals"
      subtitle="Self-registrations waiting for the office"
    >
      <PendingVerificationsManager initialPending={pending} />
    </LmsAdminShell>
  );
}
