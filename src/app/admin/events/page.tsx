import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { EventsManager } from "@/components/admin/events-manager";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const admin = await requirePermission("events", "read");
  return (
    <AdminShell
      user={admin}
      title="Events & Schedule"
      subtitle="Calendar schedule · live on news & home pages"
      actions={
        <a
          href="/news#events"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View calendar
        </a>
      }
    >
      <EventsManager />
      <HowThisWorks
        points={[
          "Events added here fill the public events calendar and the Upcoming Events lists around the site.",
          "Give each event a date — the site sorts and displays them in date order automatically.",
          "Past events keep themselves in the archive; nothing needs cleaning up.",
        ]}
        tip="Categories for events are managed in Filters & Categories."
      />
    </AdminShell>
  );
}
