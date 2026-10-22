import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { ParentChildPickCard } from "@/components/portal/parent-child-ui";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getLinkedChildren } from "@/lib/portal-parent-children";

export const metadata: Metadata = {
  title: "Homework | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.46.0 — the parent Homework hub. One linked child routes straight
 * to their list; several children get a pick-a-child card wall.
 */
export default async function ParentHomeworkHubPage() {
  const session = await requirePortal("parent");
  const children = await getLinkedChildren(session.accountId);

  if (children.length === 1) {
    redirect(`/parent/homework/${children[0].studentId}`);
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
        { label: "Homework", href: "/parent/homework", active: true },
        { label: "Marks", href: "/parent/marks" },
        { label: "Report card", href: "/parent/report-card" },
        { label: "Notices", href: "/parent#notices" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[860px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <div className="pt-rise">
          <Panel
            title="Homework"
            subtitle={children.length > 1 ? "Pick a child" : "Follow their work"}
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
                    href={`/parent/homework/${c.studentId}`}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="pt-rise pt-d2">
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4">
            <NotebookPen size={16} className="mt-0.5 shrink-0 text-[var(--pt-accent-text)]" />
            <p className="text-[12.5px] leading-relaxed text-[var(--pt-body)]">
              This view is read-only — you see what was set, what your child
              submitted and the grade. Submissions are always made from the
              student&apos;s own portal.{" "}
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
