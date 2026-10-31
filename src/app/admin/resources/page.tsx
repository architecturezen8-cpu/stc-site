import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { ResourcesManager } from "@/components/admin/resources-manager";
import { requirePermission } from "@/lib/admin-auth";
import {
  RESOURCE_CATEGORIES_DEFAULT,
  ensureResourcesSchema,
  listOnlineResources,
  mergeResourceCategories,
} from "@/lib/resources";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const admin = await requirePermission("resources", "read");
  await ensureResourcesSchema().catch(() => undefined);
  let categories = RESOURCE_CATEGORIES_DEFAULT;
  try {
    const rows = await listOnlineResources();
    categories = mergeResourceCategories(rows);
  } catch {
    /* table just created — defaults are fine */
  }

  return (
    <AdminShell
      user={admin}
      title="Online Resources"
      subtitle="A dedicated library · every resource managed by category"
      actions={
        <a
          href="/resources"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View page
        </a>
      }
    >
      <ResourcesManager categories={categories} />
      <HowThisWorks
        points={[
          "Resources published here appear on the public Online Resources page, sorted by category.",
          "Add a title, pick the category and attach the file or link — students download it straight from the site.",
          "A resource stays available until you remove it — nothing expires by itself.",
        ]}
        tip="Categories are managed in Filters & Categories."
      />
    </AdminShell>
  );
}
