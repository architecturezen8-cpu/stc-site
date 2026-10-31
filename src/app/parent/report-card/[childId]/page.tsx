import type { Metadata } from "next";
import Link from "next/link";
import { FileWarning, ScrollText } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  ParentChildHeader,
  ParentChildSwitcher,
} from "@/components/portal/parent-child-ui";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { ReportCardSheet } from "@/components/portal/report-card-sheet";
import { requirePortal } from "@/lib/portal-auth";
import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";
import {
  getLinkedChild,
  getLinkedChildren,
} from "@/lib/portal-parent-children";
import {
  getParentChildrenReportCards,
  getReportCardView,
} from "@/lib/portal-report-card";

export const metadata: Metadata = {
  title: "Report card | Parent Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.62.0 — one linked child's report cards: the newest published sheet
 * renders below the year chips (?id=<cardId> picks a specific year). The
 * parent→child link is re-guarded on every load, and only PUBLISHED
 * sheets ever appear.
 */
export default async function ParentChildReportCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const session = await requirePortal("parent");
  const [{ childId }, query, brand] = await Promise.all([
    params,
    searchParams,
    getPortalBrandLogo("parent").catch(() => null),
  ]);
  const crestSrc = brand && brand.src ? stampLogoUrl(brand) : null;

  const numericId = Number(childId);
  const validId = Number.isInteger(numericId) && numericId > 0 ? numericId : -1;

  const [children, child] = await Promise.all([
    getLinkedChildren(session.accountId),
    validId > 0 ? getLinkedChild(session.accountId, validId) : Promise.resolve(null),
  ]);

  const childCards = await getParentChildrenReportCards(session.accountId);
  const mine = child ? childCards.find((entry) => entry.child.studentId === child.studentId) : null;
  const cards = mine?.cards ?? [];

  const wanted = Number(query.id);
  const activeCard =
    Number.isInteger(wanted) && wanted > 0 && cards.some((c) => c.cardId === wanted)
      ? wanted
      : (cards[0]?.cardId ?? 0);
  const view = activeCard > 0
    ? await getReportCardView(activeCard, { role: "parent", accountId: session.accountId })
    : null;

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
        { label: "Materials", href: "/parent/materials" },
        { label: "Notices", href: "/parent/notices" },
        { label: "My Storage", href: "/parent/storage" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
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
              basePath="/parent/report-card"
            />

            {cards.length === 0 ? (
              <div className="pt-rise pt-d1">
                <Panel
                  title="Report card"
                  subtitle={`${child.fullName.split(/\s+/)[0]}'s terminal examination sheets`}
                >
                  <EmptyNote>
                    No certified report card for {child.fullName.split(/\s+/)[0]} yet —
                    sheets appear here once the Principal certifies them.
                  </EmptyNote>
                </Panel>
              </div>
            ) : (
              <>
                {/* Year chips */}
                <div className="pt-rise pt-d1 flex flex-wrap gap-2">
                  {cards.map((c) => (
                    <Link
                      key={c.cardId}
                      href={`/parent/report-card/${child.studentId}?id=${c.cardId}`}
                      aria-current={c.cardId === activeCard ? "page" : undefined}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition-colors ${
                        c.cardId === activeCard
                          ? "border-[var(--pt-accent)] bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]"
                          : "border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
                      }`}
                    >
                      <ScrollText size={13} aria-hidden="true" />
                      {c.year} · {c.grade}
                      {c.className ? ` · ${c.className}` : ""}
                    </Link>
                  ))}
                </div>

                {view?.ok ? (
                  <div className="pt-rise pt-d2">
                    <ReportCardSheet card={view.card} crestSrc={crestSrc} />
                  </div>
                ) : (
                  <div className="pt-rise pt-d2">
                    <Panel title="Report card" subtitle="That sheet isn't available">
                      <EmptyNote>
                        This report card could not be opened — pick a year above.
                      </EmptyNote>
                    </Panel>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="pt-rise">
            <div className="mx-auto max-w-md rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-8 text-center">
              <FileWarning size={30} className="mx-auto text-[var(--pt-muted)]" />
              <h1 className="mt-3 font-display text-lg font-semibold text-[var(--pt-heading)]">
                This student isn&apos;t linked to your account
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--pt-body)]">
                Report cards can only be viewed for children the school office
                has linked to your parent account.
              </p>
              <Link
                href="/parent/report-card"
                className="mt-5 inline-flex h-10 items-center rounded-full bg-[var(--pt-accent)] px-6 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90"
              >
                Back to report cards
              </Link>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
