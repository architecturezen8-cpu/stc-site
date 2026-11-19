import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { StaffManager } from "@/components/admin/staff-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const admin = await requirePermission("staff", "read");
  return (
    <AdminShell
      user={admin}
      title="Faculty & Staff Directory"
      subtitle="Teachers, leadership & coaches · reorder with the arrows"
      actions={
        <a
          href="/staff"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View staff
        </a>
      }
    >
      <StaffManager />
      <HowThisWorks
        points={[
          "The teachers and leadership you add here appear on the public Staff page, grouped under their departments.",
          "Upload a photo, add a role, and the card appears in the directory — the arrows set the order visitors see.",
          "Marking someone NEW puts a small gold badge next to their name on the public page.",
        ]}
        tip="Departments are created with the New Department button — every department becomes its own group on the public page."
      />
    </AdminShell>
  );
}
