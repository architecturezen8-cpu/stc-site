import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { PopupsManager } from "@/components/admin/popups-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPopupsPage() {
  const admin = await requirePermission("popups", "read");
  return (
    <AdminShell
      user={admin}
      title="Announcement Popups"
      subtitle="Events · live streams · special messages — full control, on/off anytime"
      actions={
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View site
        </a>
      }
    >
      <PopupsManager />
      <HowThisWorks
        points={[
          "Pop-up messages that greet visitors — for events, live streams or special announcements.",
          "Turn any popup on or off anytime; OFF means it never shows.",
          "You decide which pages it appears on and how often the same visitor sees it.",
        ]}
        tip="A popup with a banner image looks best — pick one from the Media Library when creating it."
      />
    </AdminShell>
  );
}
