import type { Metadata } from "next";
import Link from "next/link";
import { Landmark, ScrollText, Stamp } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { PurgeConsentStrip } from "@/components/portal/purge-consent-cards";
import { requirePortal } from "@/lib/portal-auth";
import { getPrincipalQueue } from "@/lib/portal-report-card";
import { getBroadcastUnreadCount } from "@/lib/school-broadcasts";
import { isFreshPortalLogin } from "@/lib/fresh-login";
import { WelcomeBack } from "@/components/portal/welcome-back";

export const metadata: Metadata = {
  title: "Principal Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.63.0 — the PRINCIPAL PORTAL home.
 *
 * The certification desk at a glance: how many sheets wait for the
 * Principal's signature, what has been certified, and the two setup
 * facts that decide whether certification can happen at all (signature +
 * seal uploaded). The queue itself lives at /principal/report-card.
 */
export default async function PrincipalHomePage() {
  const session = await requirePortal("principal");
  const queue = await getPrincipalQueue(session.accountId);
  /* v2.8.70.0 — the School notifications badge + panel. */
  const [broadcastUnread, freshLogin] = await Promise.all([
    getBroadcastUnreadCount(session.accountId, "principal"),
    isFreshPortalLogin(session.accountId),
  ]);

  const setupReady = queue.hasSign && queue.hasSeal;

  return (
    <PortalShell
      role="principal"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      bellUnread={broadcastUnread}
      nav={[
        { label: "Dashboard", href: "/principal", active: true },
        { label: "Notifications", href: "/principal/notifications", badge: broadcastUnread },
        { label: "Certify", href: "/principal/report-card" },
        { label: "Signature", href: "/principal/signature" },
        { label: "Profile", href: "/principal/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        {/* v2.8.70.2 — welcome back on a fresh login (no personal storage). */}
        <WelcomeBack name={session.fullName} roleLabel="Principal Portal" theme="portal" freshLogin={freshLogin} storageKind="none" />
        <HeroRow
          overline="Principal · report card certification"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Principal"}
          secondaryLabel="Queue"
          secondaryValue={
            queue.counts.queue > 0
              ? `${queue.counts.queue} sheet${queue.counts.queue === 1 ? "" : "s"} waiting`
              : "Nothing waiting"
          }
          ctaLabel={queue.counts.queue > 0 ? "Open the queue" : "Certification"}
          ctaHref="/principal/report-card"
        />

        {/* v2.8.71.0 — storage-purge consent requests (the office asks before deleting). School notices live in the header bell + the Notifications page now. */}
        <PurgeConsentStrip portalRole="principal" />

        {/* Setup guard — certification is impossible without both stamps. */}
        {!setupReady ? (
          <div className="pt-rise rounded-2xl border border-[var(--pt-warn-border, var(--pt-border))] bg-[var(--pt-warn-bg)] p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--pt-warn-text)]">
              <Stamp size={14} aria-hidden="true" />
              One-time setup — upload your stamps before certifying
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
              Certifying places your signature and the college seal on the sheet
              automatically. Upload both once and every certification after that
              is a single click.
            </p>
            <Link
              href="/principal/signature"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-4 py-2 text-[12px] font-bold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90"
            >
              <Stamp size={13} aria-hidden="true" />
              Upload signature &amp; seal
            </Link>
          </div>
        ) : null}

        <div className="pt-rise grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Waiting for you",
              value: queue.counts.queue,
              hint: "sheets the class teachers have submitted",
            },
            {
              label: "Certified",
              value: queue.counts.certified,
              hint: "sheets carrying your signature & seal",
            },
            {
              label: "Returned for changes",
              value: queue.counts.returned,
              hint: "back with teachers, awaiting revision",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5"
            >
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
                {stat.label}
              </p>
              <p className="mt-1 font-display text-[28px] font-bold text-[var(--pt-heading)]">
                {stat.value}
              </p>
              <p className="mt-0.5 text-[11.5px] text-[var(--pt-muted)]">{stat.hint}</p>
            </div>
          ))}
        </div>

        <div className="pt-rise pt-d1">
          <Panel
            title="Certification desk"
            subtitle="Sheets reach students and parents only after you certify them"
          >
            {queue.queue.length === 0 ? (
              <EmptyNote>
                No sheets are waiting right now. When a class teacher submits a
                report card, it appears here for your review — nothing reaches
                the student or parents before your signature lands on it.
              </EmptyNote>
            ) : (
              <div className="space-y-2.5">
                {queue.queue.slice(0, 5).map((item) => (
                  <Link
                    key={item.cardId}
                    href={`/principal/report-card?card=${item.cardId}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3 transition-colors hover:border-[var(--pt-border-strong)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
                        {item.studentName} · {item.className || item.grade} · {item.year}
                      </span>
                      <span className="block text-[10.5px] text-[var(--pt-muted)]">
                        Submitted {item.submittedAtLabel || "—"}
                      </span>
                    </span>
                    <ScrollText
                      size={15}
                      className="shrink-0 text-[var(--pt-muted)]"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
                {queue.queue.length > 5 ? (
                  <Link
                    href="/principal/report-card"
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--pt-accent-text)] hover:underline"
                  >
                    <Landmark size={13} aria-hidden="true" />
                    See all {queue.queue.length} waiting sheets
                  </Link>
                ) : null}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </PortalShell>
  );
}
