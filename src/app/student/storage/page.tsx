import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { MyStorage } from "@/components/portal/my-storage";
import { requirePortal } from "@/lib/portal-auth";
import { ensureStudentPerson } from "@/lib/lms-identity";
import { getMyStorageStudent } from "@/lib/student-storage";
import { chatUnreadBadge } from "@/lib/portal-questions";
import { listPurgeRequestsFor } from "@/lib/storage-consent";
import { PurgeConsentCards } from "@/components/portal/purge-consent-cards";

export const metadata: Metadata = {
  title: "My Storage | Student Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.67.3 — D.3: the student's own storage manager. Every submission file
 * and chat attachment they own, live + trashed, with the 500 MB (or custom)
 * cap up top. Delete = trash (stops counting instantly); Restore / Delete
 * forever live in the Trash tab. Nothing is ever removed automatically.
 */
export default async function StudentStoragePage() {
  const session = await requirePortal("student");
  const person = await ensureStudentPerson(session.accountId, session.email);
  const [data, badge, consents] = await Promise.all([
    person ? getMyStorageStudent(person.id) : null,
    chatUnreadBadge("student", session.accountId),
    /* v2.8.70.3 — open storage-purge consent requests. */
    listPurgeRequestsFor(session.accountId),
  ]);

  const firstName = session.fullName.trim().split(/\s+/)[0] || "there";

  return (
    <PortalShell
      role="student"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/student" },
        { label: "Timetable", href: "/student/timetable" },
        { label: "Homework", href: "/student/homework" },
        { label: "Chat", href: "/student/chat", badge },
        { label: "Marks", href: "/student#marks" },
        { label: "Report card", href: "/student/report-card" },
        { label: "Notices", href: "/student#notices" },
        { label: "My Storage", href: "/student/storage", active: true },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Your files · your space"
          firstName={firstName}
          secondaryLabel="Space used"
          secondaryValue={
            data
              ? `${(data.used / (1024 * 1024)).toFixed(1)} MB`
              : "—"
          }
          ctaLabel="Submit homework"
          ctaHref="/student/homework"
        />

        {/* v2.8.70.3 — the office's delete requests wait for YOUR OK. */}
        <PurgeConsentCards initial={consents} portalRole="student" />

        {data ? (
          <MyStorage role="student" data={data} />
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] px-5 py-10 text-center text-[12.5px] leading-relaxed text-[var(--pt-body)]">
            Your student record isn&apos;t linked yet, so there is no storage to show. Ask the
            office to link your admission number — files you submit in the meantime stay safe.
          </p>
        )}
      </div>
    </PortalShell>
  );
}
