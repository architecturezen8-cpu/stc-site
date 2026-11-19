import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormsManager, type FormsTab } from "@/components/admin/forms-manager";
import { FORM_FIELD_TYPE_LABELS } from "@/lib/form-builder";
import { FIXED_FORM_FIELD_TYPES } from "@/lib/form-extra-fields";
import { requirePermission } from "@/lib/admin-auth";
import type { AdminModule } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

const TABS: Record<
  FormsTab,
  { title: string; subtitle: string; livePath?: string; liveLabel?: string }
> = {
  "grade-6": {
    title: "Grade 6 Applications",
    subtitle: "Form management · grade 6 intake applications",
    livePath: "/admissions",
    liveLabel: "View admissions page",
  },
  alevel: {
    title: "A/L Applications",
    subtitle: "Form management · Advanced Level admission applications",
    livePath: "/admissions",
    liveLabel: "View admissions page",
  },
  contacts: {
    title: "Contact Messages",
    subtitle: "Form management · contact form inquiries",
    livePath: "/contact",
    liveLabel: "View contact page",
  },
  appointments: {
    title: "Appointments",
    subtitle: "Form management · department visit bookings",
    livePath: "/contact#appointments",
    liveLabel: "View appointments",
  },
  /* v2.8.85.0 — extra fields for the two FIXED forms. */
  customize: {
    title: "Customize Fixed Forms",
    subtitle: "Form management · extra fields for the contact + application forms",
    livePath: "/contact",
    liveLabel: "View contact page",
  },
};

/* v2.9.12.3 — each Form Management section guards ITSELF now (the coarse
   "forms" split 1:1 with the sidebar). */
const TAB_MODULE: Record<FormsTab, AdminModule> = {
  "grade-6": "forms-grade6",
  alevel: "forms-alevel",
  contacts: "forms-contacts",
  appointments: "forms-appointments",
  customize: "forms-customize",
};

export default async function AdminFormsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  const meta = TABS[tab as FormsTab];
  if (!meta) notFound();
  const admin = await requirePermission(TAB_MODULE[tab as FormsTab], "read");

  return (
    <AdminShell
      user={admin}
      title={meta.title}
      subtitle={meta.subtitle}
      actions={
        meta.livePath ? (
          <a
            href={meta.livePath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
          >
            {meta.liveLabel}
          </a>
        ) : undefined
      }
    >
      <FormsManager
        /* v2.8.85.0 — keyed by tab so the customize tab's hook-free editor
           and the inbox managers never share a mounted instance (the
           customize branch returns before any hook by design). */
        key={tab as FormsTab}
        tab={tab as FormsTab}
        extraTypeOptions={
          tab === "customize"
            ? FIXED_FORM_FIELD_TYPES.map((value) => ({
                value,
                label: FORM_FIELD_TYPE_LABELS[value],
              }))
            : undefined
        }
      />
    </AdminShell>
  );
}
