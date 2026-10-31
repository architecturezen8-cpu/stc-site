import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { ParentChildPickCard } from "@/components/portal/parent-child-ui";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getLinkedChildren } from "@/lib/portal-parent-children";

export const metadata: Metadata = {
  title: "Class Notices | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.77.0 — Phase 3.3: the parent Class Notices hub. One linked child
 * routes straight to their list; several children get a pick-a-child
 * card wall (the same pattern as homework / marks / materials).
 */
export default async function ParentNoticesHubPage() {
  const session = await requirePortal("parent");
  const children = await getLinkedChildren(session.accountId);

  if (children.length === 1) {
    redirect(`/parent/notices/${children[0].studentId}`);
  }

  return (
    <PortalShell
      role="parent"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/parent" },
        { label: "Children", href: "/parent#children" },
        { label: "Homework", href: "/parent/homework" },
        { label: "Marks", href: "/parent/marks" },
        { label: "Report card", href: "/parent/report-card" },
        { label: "Materials", href: "/parent/materials" },
        { label: "Notices", href: "/parent/notices", active: true },
        { label: "My Storage", href: "/parent/storage" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[860px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <div className="pt-rise">
          <Panel
            title="Class notices"
            subtitle={children.length > 1 ? "Pick a child" : "Their class announcements"}
          >
            {children.length === 0 ? (
              <EmptyNote>
                Your children appear here once the school office links them to
                your parent account.
              </EmptyNote>
            ) : (
              <div className="space-y-3">
                {children.map((c) => (
                  <ParentChildPickCard
                    key={c.studentId}
                    child={c}
                    href={`/parent/notices/${c.studentId}`}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="pt-rise pt-d2">
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
            <Megaphone size={16} className="mt-0.5 shrink-0 text-[var(--pt-accent-text)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--pt-body)]">
              The FULL notice feed for your child&apos;s class — the dashboard
              only previews the three latest. Everything is read-only.
            </p>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
