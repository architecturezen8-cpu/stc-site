import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { MyStorage } from "@/components/portal/my-storage";
import { requirePortal } from "@/lib/portal-auth";
import { ensureTeacherPerson } from "@/lib/lms-identity";
import { getMyStorageTeacher } from "@/lib/student-storage";
import { chatUnreadBadge } from "@/lib/portal-questions";
import { listPurgeRequestsFor } from "@/lib/storage-consent";
import { PurgeConsentCards } from "@/components/portal/purge-consent-cards";

export const metadata: Metadata = {
  title: "My Storage | Teacher Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.67.3 — D.3: the teacher's own storage manager — assignment
 * attachments, material files, notice attachments and their own chat
 * files, live + trashed. Teachers have no default cap; a cap appears here
 * the moment the LMS office sets one. Delete = trash, Restore / Delete
 * forever in the Trash tab, chat attachments remove with a two-step purge.
 */
export default async function TeacherStoragePage() {
  const session = await requirePortal("teacher");
  const person = await ensureTeacherPerson(session.accountId);
  const [data, badge, consents] = await Promise.all([
    getMyStorageTeacher(session.accountId, person?.id ?? null),
    chatUnreadBadge("teacher", session.accountId),
    /* v2.8.70.3 — open storage-purge consent requests. */
    listPurgeRequestsFor(session.accountId),
  ]);

  const firstName = session.fullName.trim().split(/\s+/)[0] || "there";

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Attendance", href: "/teacher/attendance" },
        { label: "Assignments", href: "/teacher/assignments" },
        { label: "Chat", href: "/teacher/chat", badge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Report card", href: "/teacher/report-card" },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Classes", href: "/teacher#classes" },
        { label: "My Storage", href: "/teacher/storage", active: true },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Your files · your space"
          firstName={firstName}
          secondaryLabel="Space used"
          secondaryValue={`${(data.used / (1024 * 1024)).toFixed(1)} MB`}
          ctaLabel="Post new work"
          ctaHref="/teacher/assignments"
        />

        {/* v2.8.70.3 — the office's delete requests wait for YOUR OK. */}
        <PurgeConsentCards initial={consents} portalRole="teacher" />

        <MyStorage role="teacher" data={data} />
      </div>
    </PortalShell>
  );
}
