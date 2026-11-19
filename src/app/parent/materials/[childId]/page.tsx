import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  ParentChildHeader,
  ParentChildSwitcher,
} from "@/components/portal/parent-child-ui";
import { FileChipList, LinkRow } from "@/components/portal/assignment-file-ui";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getLinkedChildren } from "@/lib/portal-parent-children";
import { getParentChildMaterials } from "@/lib/portal-parent-classroom";

export const metadata: Metadata = {
  title: "Class Materials | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.77.0 — Phase 3.3: ONE linked child's class materials, read-only.
 * The child id is re-verified against the parent's own links on every
 * load; an unknown or un-linked id renders the friendly empty card.
 */
export default async function ParentChildMaterialsPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const session = await requirePortal("parent");
  const { childId } = await params;
  const numericId = Number(childId);
  const validId = Number.isInteger(numericId) && numericId > 0 ? numericId : -1;

  const [children, data] = await Promise.all([
    getLinkedChildren(session.accountId),
    validId > 0
      ? getParentChildMaterials(session.accountId, validId)
      : Promise.resolve(null),
  ]);
  const child = data?.child ?? null;
  const materials = data?.materials ?? [];

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
        { label: "Materials", href: "/parent/materials", active: true },
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
                crossLabel="View notices"
                crossHref={`/parent/notices/${child.studentId}`}
              />
            </div>

            <ParentChildSwitcher
              kids={children}
              activeStudentId={child.studentId}
              basePath="/parent/materials"
            />

            <div className="pt-rise pt-d1">
              <Panel
                title="Class materials"
                subtitle={`${child.fullName.split(/\s+/)[0]}'s class resources — read-only`}
              >
                {materials.length === 0 ? (
                  <EmptyNote>
                    Nothing has been shared with this class yet — materials the
                    teachers hand out appear here.
                  </EmptyNote>
                ) : (
                  <div className="pt-scrollbar max-h-[640px] space-y-2.5 overflow-y-auto pr-0.5">
                    {materials.map((m) => (
                      <article
                        key={m.id}
                        className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                              {m.title}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--pt-body)]">
                              <BookOpen size={10} /> {m.subject} · {m.whenLabel}
                            </p>
                          </div>
                        </div>
                        {m.linkUrl ? (
                          <div className="mt-2">
                            <LinkRow url={m.linkUrl} />
                          </div>
                        ) : null}
                        {m.files.length > 0 ? (
                          <div className="mt-2">
                            <FileChipList files={m.files} />
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </>
        ) : (
          <div className="pt-rise">
            <Panel title="Class materials" subtitle="Child not found">
              <EmptyNote>
                This child is not linked to your parent account. Pick a child
                from the dashboard instead.
              </EmptyNote>
            </Panel>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
