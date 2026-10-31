import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { adminAccessRequests, adminUsers } from "@/db/schema";
import { AdminShell } from "@/components/admin/admin-shell";
import { RolesManager } from "@/components/admin/roles-manager";
import { requirePermission } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const admin = await requirePermission("roles", "edit");
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
