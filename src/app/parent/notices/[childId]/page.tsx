import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  ParentChildHeader,
  ParentChildSwitcher,
} from "@/components/portal/parent-child-ui";
import {
  EmptyNote,
  NoticeAttachments,
  Panel,
} from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getLinkedChildren } from "@/lib/portal-parent-children";
import { getParentChildNotices } from "@/lib/portal-parent-classroom";

export const metadata: Metadata = {
  title: "Class Notices | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.77.0 — Phase 3.3: ONE linked child's class notices, read-only,
 * FULL feed (the dashboard preview caps at 3). The child id is
 * re-verified against the parent's own links on every load; attachments
 * open through the audience-checked notice file route (parents were
 * already allowed there).
 */
export default async function ParentChildNoticesPage({
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
      ? getParentChildNotices(session.accountId, validId)
      : Promise.resolve(null),
  ]);
  const child = data?.child ?? null;
  const notices = data?.notices ?? [];

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
        {child ? (
          <>
            <div className="pt-rise">
              <ParentChildHeader
                child={child}
                crossLabel="View materials"
                crossHref={`/parent/materials/${child.studentId}`}
              />
            </div>

            <ParentChildSwitcher
              kids={children}
              activeStudentId={child.studentId}
              basePath="/parent/notices"
            />

            <div className="pt-rise pt-d1">
              <Panel
                title="Class notices"
                subtitle={`${child.fullName.split(/\s+/)[0]}'s class announcements — read-only`}
              >
                {notices.length === 0 ? (
                  <EmptyNote>
                    No class notices yet — anything the class teacher posts
                    lands here.
                  </EmptyNote>
                ) : (
                  <div className="pt-scrollbar max-h-[640px] space-y-2.5 overflow-y-auto pr-0.5">
                    {notices.map((n) => (
                      <article
                        key={n.id}
                        className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                              {n.title}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-[var(--pt-body)]">
                              <Megaphone size={10} /> {n.whenLabel}
                            </p>
                          </div>
                        </div>
                        {n.body ? (
                          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--pt-body)]">
                            {n.body}
                          </p>
                        ) : null}
                        {n.linkUrl || n.files.length > 0 ? (
                          <div className="mt-2">
                            <NoticeAttachments
                              noticeId={n.id}
                              linkUrl={n.linkUrl}
                              files={n.files}
                            />
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
            <Panel title="Class notices" subtitle="Child not found">
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
