import type { Metadata } from "next";
import Link from "next/link";
import { FileWarning } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  ParentChildHeader,
  ParentChildSwitcher,
  ParentHomeworkList,
} from "@/components/portal/parent-child-ui";
import { Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import {
  getLinkedChild,
  getLinkedChildren,
  getParentChildHomework,
} from "@/lib/portal-parent-children";

export const metadata: Metadata = {
  title: "Homework | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.46.0 — ONE linked child's homework list, read-only. The child id
 * is re-verified against the parent's own links on every load; an
 * unknown or un-linked id lands on the friendly card below.
 */
export default async function ParentChildHomeworkPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const session = await requirePortal("parent");
  const { childId } = await params;
  const numericId = Number(childId);
  const validId = Number.isInteger(numericId) && numericId > 0 ? numericId : -1;

  const [children, child] = await Promise.all([
    getLinkedChildren(session.accountId),
    validId > 0 ? getLinkedChild(session.accountId, validId) : Promise.resolve(null),
  ]);
  const items = child ? await getParentChildHomework(session.accountId, child.studentId) : [];

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
        { label: "Materials", href: "/parent/materials" },
        { label: "Notices", href: "/parent/notices" },
        { label: "My Storage", href: "/parent/storage" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[860px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        {child ? (
          <>
            <div className="pt-rise">
              <ParentChildHeader
                child={child}
                crossLabel="View marks"
                crossHref={`/parent/marks/${child.studentId}`}
              />
            </div>

            <ParentChildSwitcher
              kids={children}
              activeStudentId={child.studentId}
              basePath="/parent/homework"
            />

            <div className="pt-rise pt-d1">
              <Panel
                title="Homework"
                subtitle={`${child.fullName.split(/\s+/)[0]}'s class work — read-only`}
              >
                <ParentHomeworkList items={items} childId={child.studentId} />
              </Panel>
            </div>
          </>
        ) : (
          <div className="pt-rise">
            <div className="mx-auto max-w-md rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-8 text-center">
              <FileWarning size={30} className="mx-auto text-[var(--pt-muted)]" />
              <h1 className="mt-3 font-display text-lg font-semibold text-[var(--pt-heading)]">
                This student isn&apos;t linked to your account
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--pt-body)]">
                Homework can only be viewed for children the school office has
                linked to your parent account.
              </p>
              <Link
                href="/parent/homework"
                className="mt-5 inline-flex h-10 items-center rounded-full bg-[var(--pt-accent)] px-6 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90"
              >
                Back to homework
              </Link>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
