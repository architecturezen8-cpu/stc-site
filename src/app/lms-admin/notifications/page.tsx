import { BellRing } from "lucide-react";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.0 — School Notifications (LMS Admin Studio side). The owner:
 * "aya lms-admin ekata ath messages danna puluwan wenna one" — the same
 * composer the website Admin uses, studio-themed; the audience switch
 * picks teachers / students / parents / everyone.
 */
export default async function LmsAdminNotificationsPage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  return (
    <LmsAdminShell
      session={session}
      active="notifications"
      title="School Notifications"
      subtitle="Post school-wide messages to students, teachers and parents"
    >
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--la-accent-soft)] text-[var(--la-accent-text)]">
          <BellRing size={17} aria-hidden="true" />
        </span>
        <p className="text-[12.5px] leading-relaxed text-[var(--la-muted)]">
          Notices posted here appear in the <strong>School notifications</strong> panel of every
          portal dashboard in the chosen audience. Class notices stay separate — this is the
          school-wide channel.
        </p>
      </div>
      <BroadcastComposer via="lms" />
    </LmsAdminShell>
  );
}
