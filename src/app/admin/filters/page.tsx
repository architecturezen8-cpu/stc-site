import { AdminShell } from "@/components/admin/admin-shell";
import { FiltersManager } from "@/components/admin/filters-manager";
import { HowThisWorks } from "@/components/admin/how-this-works";
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
      <HowThisWorks
        points={[
          "The filter buttons visitors tap on News, Campus Gallery, Events, Resources and Staff are managed here.",
          "Renaming a category updates it everywhere at once — no need to fix pages one by one.",
          "Removing a category first asks where its items should move, so nothing is ever lost.",
        ]}
        tip="Add new categories with the Add button — they appear on the public filter buttons immediately."
      />
    </AdminShell>
  );
}
