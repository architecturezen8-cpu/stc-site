import { AdminShell } from "@/components/admin/admin-shell";
import { FiltersManager } from "@/components/admin/filters-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminFiltersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const admin = await requirePermission("filters", "read");
  const { tab } = await searchParams;

  return (
    <AdminShell
      user={admin}
      title="Filters & Categories"
      subtitle="Manage the filter options shown on News, Campus Gallery, Events, Resources and Staff — rename, remove, merge and add"
    >
      <FiltersManager initialTab={tab} />
    </AdminShell>
  );
}
