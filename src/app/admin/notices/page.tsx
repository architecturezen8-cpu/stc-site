import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { NoticesManager } from "@/components/admin/notices-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notice Board — Admin Studio",
};

export default async function AdminNoticesPage() {
  const admin = await requirePermission("news", "edit");
  return (
    <AdminShell
      user={admin}
      title="Notice Board"
      subtitle="Office announcements for the homepage strip and the /notices archive"
      actions={
        <a
          href="/notices"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View board
        </a>
      }
    >
      <NoticesManager />
      <HowThisWorks
        points={[
          "Notices you publish here appear on the scrolling strip on the home page and in the public Notice Board archive.",
          "Attach a file (PDF or image) and visitors can open it directly from the notice.",
          "The newest notice stays on top — older ones move down on their own.",
        ]}
        tip="Remove a notice the moment it is outdated — the home page strip updates instantly."
      />
    </AdminShell>
  );
}
