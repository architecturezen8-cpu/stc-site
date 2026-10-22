import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { ParentChildPickCard } from "@/components/portal/parent-child-ui";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getParentChildrenReportCards } from "@/lib/portal-report-card";

export const metadata: Metadata = {
  title: "Report card | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.62.0 — the parent Report card hub, mirroring the Marks hub: one
 * linked child routes straight to their sheets; several children get the
 * pick-a-child wall with each child's published sheet count.
 */
export default async function ParentReportCardHubPage() {
  const session = await requirePortal("parent");
  const childCards = await getParentChildrenReportCards(session.accountId);

  if (childCards.length === 1) {
    redirect(`/parent/report-card/${childCards[0].child.studentId}`);
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
        /* v2.8.62.0 — the digital terminal report card */
        { label: "Report card", href: "/parent/report-card", active: true },
        { label: "Notices", href: "/parent#notices" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[860px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <div className="pt-rise">
          <Panel
            title="Report card"
            subtitle={
              childCards.length > 1
                ? "Pick a child"
                : "Their certified terminal examination sheets"
            }
          >
            {childCards.length === 0 ? (
              <EmptyNote>
                Your children appear here once the school office links them to
                your parent account.
              </EmptyNote>
            ) : (
              <div className="space-y-3">
                {childCards.map(({ child, cards }) => (
                  <div key={child.studentId} className="space-y-2">
                    <ParentChildPickCard
                      child={child}
                      href={`/parent/report-card/${child.studentId}`}
                    />
                    {cards.length > 0 ? (
                      <p className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-[var(--pt-muted)]">
                        <ScrollText size={12} aria-hidden="true" />
                        Certified for{" "}
                        {cards.map((c, i) => (
                          <span key={c.cardId} className="font-semibold text-[var(--pt-accent-text)]">
                            {c.year}
                            {i < cards.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </p>
                    ) : (
                      <p className="px-1 text-[11px] text-[var(--pt-muted)]">
                        No certified report card yet — the Principal certifies sheets before they appear here.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </PortalShell>
  );
}
