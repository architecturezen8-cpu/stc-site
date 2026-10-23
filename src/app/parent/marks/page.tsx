import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { ParentChildPickCard } from "@/components/portal/parent-child-ui";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getLinkedChildren } from "@/lib/portal-parent-children";

export const metadata: Metadata = {
  title: "Marks | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.46.0 — the parent Marks hub. One linked child routes straight to
 * their marks sheet; several children get a pick-a-child card wall.
 */
export default async function ParentMarksHubPage() {
  const session = await requirePortal("parent");
  const children = await getLinkedChildren(session.accountId);

  if (children.length === 1) {
    redirect(`/parent/marks/${children[0].studentId}`);
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
        { label: "Marks", href: "/parent/marks", active: true },
        { label: "Notices", href: "/parent#notices" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[860px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <div className="pt-rise">
          <Panel
            title="Marks"
            subtitle={children.length > 1 ? "Pick a child" : "Their published scores"}
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
                    href={`/parent/marks/${c.studentId}`}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="pt-rise pt-d2">
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
            <GraduationCap size={16} className="mt-0.5 shrink-0 text-[var(--pt-accent-text)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--pt-body)]">
              Every score a teacher publishes for the class assessments shows
              here — by term and by subject, with averages.{" "}
              <Link
                href="/parent"
                className="font-semibold text-[var(--pt-accent-text)] hover:underline"
              >
                Back to the dashboard
              </Link>
            </p>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
