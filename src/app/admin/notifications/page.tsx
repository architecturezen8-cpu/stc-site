import { AdminShell } from "@/components/admin/admin-shell";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { FormActivityFeed } from "@/components/admin/form-activity-feed";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.0 — School Notifications (main admin side). The owner's ask:
 * "main admin dana site eka down karanawa me time eke maintenance walata
 * wage messages danna" — posts here land on every selected portal
 * dashboard's School notifications panel. The LMS admin posts from the
 * studio's own page; both share the same composer component and API.
 *
 * v2.8.84.0 — the owner's second ask on this section: "appoinment, contact
 * massage, grade 6 application, A/L admintion ekak wage dammama danne na ne
 * aluthin ekak dalada kiyala e nisa admin eke witharak notification walata
 * e feature ekath add karanna." The Form Activity feed now sits at the top
 * of this page: every appointment, contact message, Grade 6 and A/L
 * application appears the moment it lands, with a NEW dot while the office
 * has not acted on it, awaiting-action counts, a 60 s auto-poll and links
 * into each Form Management tab.
 */
export default async function AdminNotificationsPage() {
  const admin = await requirePermission("portal", "edit");
  return (
    <AdminShell
      user={admin}
      title="School Notifications"
      subtitle="New form submissions at a glance, plus school-wide messages to students, teachers and parents"
    >
      <div className="space-y-5">
        <FormActivityFeed />
        <BroadcastComposer via="site" />
      </div>
    </AdminShell>
  );
}
