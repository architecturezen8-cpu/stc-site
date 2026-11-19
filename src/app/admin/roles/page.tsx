import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { adminAccessRequests, adminUsers } from "@/db/schema";
import { AdminShell } from "@/components/admin/admin-shell";
import { RolesManager } from "@/components/admin/roles-manager";
import { requirePermission } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  /* v2.9.12.3 — VIEW enters too (owner: "e section eka read only mode eke
     thiyenna one") — the manager hides every mutation for viewers. */
  const admin = await requirePermission("roles", "read");
  await ensureSchemaExtras();

  const users = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      avatar: adminUsers.avatar,
      active: adminUsers.active,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
      authProvider: adminUsers.authProvider,
      // v2.9.12.0 — per-account custom access JSON for the access editor.
      permissions: adminUsers.permissions,
    })
    .from(adminUsers)
    .orderBy(asc(adminUsers.id));

  const requests = await db
    .select()
    .from(adminAccessRequests)
    .orderBy(desc(adminAccessRequests.createdAt))
    .limit(200);

  return (
    <AdminShell
      user={admin}
      title="Role Management"
      subtitle="Admin accounts, roles and access requests"
    >
      <RolesManager
        currentUser={{ id: admin.id, role: admin.role, name: admin.name }}
        initialUsers={JSON.parse(JSON.stringify(users))}
        initialRequests={JSON.parse(JSON.stringify(requests))}
      />
    </AdminShell>
  );
}
