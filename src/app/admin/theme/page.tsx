import { eq } from "drizzle-orm";
import { AdminShell } from "@/components/admin/admin-shell";
import { ThemeManager } from "@/components/admin/theme-manager";
import type { AdminTheme } from "@/components/admin/admin-shell";
import { requirePermission } from "@/lib/admin-auth";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { getSiteSettings } from "@/lib/cms";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

const THEMES: AdminTheme[] = ["gold", "royal", "violet", "dark"];

/**
 * v2.9.10.0 — the initial theme is THIS admin's own saved choice (seeded
 * from the old global setting the first time), never another admin's.
 */
export default async function AdminThemePage() {
  const admin = await requirePermission("theme", "read");
  await ensureSchemaExtras();

  const [row] = await db
    .select({ theme: adminUsers.theme })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.id))
    .limit(1);

  let initialTheme: AdminTheme = "gold";
  if (row?.theme && THEMES.includes(row.theme as AdminTheme)) {
    initialTheme = row.theme as AdminTheme;
  } else {
    /* First visit — seed the view from the global setting this account was
       already seeing (the API GET does the same write-through seed). */
    const settings = await getSiteSettings("draft");
    if (THEMES.includes(settings.adminTheme as AdminTheme)) {
      initialTheme = settings.adminTheme as AdminTheme;
    }
  }

  return (
    <AdminShell
      user={admin}
      title="Theme"
      subtitle="Cinematic colour themes for your Admin Studio — pick your style"
    >
      <ThemeManager initialTheme={initialTheme} />
    </AdminShell>
  );
}
