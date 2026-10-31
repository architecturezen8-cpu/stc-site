import { AdminShell } from "@/components/admin/admin-shell";
import { ThemeManager } from "@/components/admin/theme-manager";
import type { AdminTheme } from "@/components/admin/admin-shell";
import { requirePermission } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/cms";

export const dynamic = "force-dynamic";

const THEMES: AdminTheme[] = ["gold", "royal", "violet", "dark"];

export default async function AdminThemePage() {
  const admin = await requirePermission("theme", "read");
  const settings = await getSiteSettings("draft");
  const initialTheme: AdminTheme = THEMES.includes(settings.adminTheme as AdminTheme)
    ? (settings.adminTheme as AdminTheme)
    : "gold";

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
