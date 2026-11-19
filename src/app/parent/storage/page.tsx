import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { MyStorage } from "@/components/portal/my-storage";
import { requirePortal } from "@/lib/portal-auth";
import { ensureParentPerson } from "@/lib/lms-identity";
import { getMyStorageParent } from "@/lib/student-storage";
import { listPurgeRequestsFor } from "@/lib/storage-consent";
import { PurgeConsentCards } from "@/components/portal/purge-consent-cards";

export const metadata: Metadata = {
  title: "My Storage | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.67.3 — D.3: the parent's storage page. Parents upload nothing today
 * — the view is an honest, friendly empty state (plus a cap readout for
 * the day the school enables parent uploads). The nav matches the parent
 * dashboard's items, with "My Storage" active.
 */
export default async function ParentStoragePage() {
  const session = await requirePortal("parent");
  const person = await ensureParentPerson(session.accountId);
  const data = person
    ? await getMyStorageParent(person.id)
    : { used: 0, capBytes: null, files: { submissions: [], chat: [] } };
  /* v2.8.70.3 — open storage-purge consent requests. */
  const consents = await listPurgeRequestsFor(session.accountId);

  const firstName = session.fullName.trim().split(/\s+/)[0] || "there";

  return (
    <PortalShell
      role="parent"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/parent" },
        { label: "Calendar", href: "#calendar" },
        { label: "Children", href: "#children" },
        { label: "Homework", href: "/parent/homework" },
        { label: "Marks", href: "/parent/marks" },
        { label: "Report card", href: "/parent/report-card" },
        { label: "Materials", href: "/parent/materials" },
        { label: "Notices", href: "/parent/notices" },
        { label: "Support", href: "#support" },
        { label: "My Storage", href: "/parent/storage", active: true },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Your files · your space"
          firstName={firstName}
          secondaryLabel="Space used"
          secondaryValue="0 MB"
          ctaLabel="Back to dashboard"
          ctaHref="/parent"
        />

        {/* v2.8.70.3 — the office's delete requests wait for YOUR OK. */}
        <PurgeConsentCards initial={consents} portalRole="parent" />

        <MyStorage role="parent" data={data} />
      </div>
    </PortalShell>
  );
}
