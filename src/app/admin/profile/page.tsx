import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProfileManager } from "@/components/admin/profile-manager";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const admin = await requireAdmin();
  await ensureSchemaExtras();
  const [user] = await db
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      email: adminUsers.email,
      role: adminUsers.role,
      avatar: adminUsers.avatar,
      authProvider: adminUsers.authProvider,
      lastLoginAt: adminUsers.lastLoginAt,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.id))
    .limit(1);

  return (
    <AdminShell
      user={admin}
      title="Profile"
      subtitle="Your sign-in details, profile photo and password"
    >
      <ProfileManager
        initial={{
          id: admin.id,
          name: user?.name ?? admin.name,
          email: user?.email ?? admin.email,
          role: user?.role ?? admin.role,
          avatar: user?.avatar ?? null,
          authProvider: user?.authProvider ?? "password",
          lastLoginAt: user?.lastLoginAt ? user.lastLoginAt.toISOString() : null,
          createdAt: user?.createdAt ? user.createdAt.toISOString() : null,
        }}
      />
    </AdminShell>
  );
}
