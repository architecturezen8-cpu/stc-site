import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { ClubsManager } from "@/components/admin/clubs-manager";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminClubsPage() {
  const admin = await requirePermission("pages", "read");
  return (
    <AdminShell
      user={admin}
      title="Clubs & Societies"
      subtitle="Society directory · crests · live on /clubs-societies"
      actions={
        <a
          href="/clubs-societies"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View page
        </a>
      }
    >
      <ClubsManager />
      <HowThisWorks
        points={[
          "Every club you add becomes a card on the public Clubs & Societies page with its description and details.",
          "A club's crest image is uploaded in Logos & Crests — the public card picks it up automatically.",
          "Marking a club NEW shows a small gold badge on the public page.",
        ]}
        tip="Categories for clubs are managed in Filters & Categories."
      />
    </AdminShell>
  );
}
