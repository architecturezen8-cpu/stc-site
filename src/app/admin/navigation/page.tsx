import { AdminShell } from "@/components/admin/admin-shell";
import { NavigationManager } from "@/components/admin/navigation-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Navigation — Admin Studio",
};

/**
 * v2.9.0.0 — Admin Studio → Navigation: the admin-managed main menu
 * (navbar + mobile fullscreen menu). The visual editor writes through to
 * the same rows, so menu text and links have exactly one source of truth.
 */
export default async function AdminNavigationPage() {
  const admin = await requirePermission("navigation", "read");
  return (
    <AdminShell
      user={admin}
      title="Navigation"
      subtitle="The site menu — labels, links and order, live on save"
    >
      <NavigationManager />
    </AdminShell>
  );
}
