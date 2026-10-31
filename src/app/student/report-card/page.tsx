import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { ReportCardSheet } from "@/components/portal/report-card-sheet";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { chatUnreadBadge } from "@/lib/portal-questions";
import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";
import { getReportCardView, getStudentReportCards } from "@/lib/portal-report-card";

export const metadata: Metadata = {
  title: "Report card | Student Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.62.0 — the student's DIGITAL TERMINAL REPORT CARD.
 *
 * Only PUBLISHED sheets of their own are ever listed or viewable (the
 * reader re-guards every call). ?id=<cardId> opens a specific year;
 * otherwise the newest year's sheet renders below the year chips.
 */
export default async function StudentReportCardPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const session = await requirePortal("student");
  const [cards, chatBadge, params, brand] = await Promise.all([
    getStudentReportCards(session.accountId, session.email),
    chatUnreadBadge("student", session.accountId),
    searchParams,
    getPortalBrandLogo("student").catch(() => null),
  ]);
  const crestSrc = brand && brand.src ? stampLogoUrl(brand) : null;

  const wanted = Number(params.id);
  const activeCard =
    Number.isInteger(wanted) && wanted > 0 && cards.some((c) => c.cardId === wanted)
      ? wanted
      : (cards[0]?.cardId ?? 0);
  const view = activeCard > 0
    ? await getReportCardView(activeCard, { role: "student", accountId: session.accountId })
    : null;

  return (
    <PortalShell
      role="student"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/student" },
        { label: "Calendar", href: "/student#calendar" },
        { label: "Timetable", href: "/student/timetable" },
        { label: "Homework", href: "/student/homework" },
        { label: "Chat", href: "/student/chat", badge: chatBadge },
        { label: "Marks", href: "/student#marks" },
        /* v2.8.62.0 — the digital terminal report card */
        { label: "Report card", href: "/student/report-card", active: true },
        { label: "Notices", href: "/student#notices" },
        { label: "My Storage", href: "/student/storage" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Terminal examination · school reports"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Thomian"}
          secondaryLabel="Reports"
          secondaryValue={
            cards.length > 0
              ? `${cards.length} certified · ${cards[0].year}`
              : "Nothing certified yet"
          }
          ctaLabel="Dashboard"
          ctaHref="/student"
        />

        {cards.length === 0 ? (
          <div className="pt-rise">
            <Panel
              title="Report card"
              subtitle="Your terminal examination sheets"
            >
              <EmptyNote>
                Your report card appears here once the Principal certifies it —
                check back after the terminal examination results are signed
                off.
              </EmptyNote>
            </Panel>
          </div>
        ) : (
          <>
            {/* Year chips */}
            <div className="pt-rise flex flex-wrap gap-2">
              {cards.map((c) => (
                <Link
                  key={c.cardId}
                  href={`/student/report-card?id=${c.cardId}`}
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
              <div className="pt-rise pt-d1">
                <ReportCardSheet card={view.card} crestSrc={crestSrc} />
              </div>
            ) : (
              <div className="pt-rise pt-d1">
                <Panel title="Report card" subtitle="That sheet isn't available">
                  <EmptyNote>
                    This report card could not be opened — pick a year above.
                  </EmptyNote>
                </Panel>
              </div>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}
