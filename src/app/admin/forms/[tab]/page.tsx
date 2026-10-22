import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormsManager, type FormsTab } from "@/components/admin/forms-manager";
import { requirePermission } from "@/lib/admin-auth";

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
};

export default async function AdminFormsTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const admin = await requirePermission("forms", "read");
  const { tab } = await params;
  const meta = TABS[tab as FormsTab];
  if (!meta) notFound();

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
      <FormsManager tab={tab as FormsTab} />
    </AdminShell>
  );
}
