import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ScrollText, Undo2 } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { ReportCardSheet } from "@/components/portal/report-card-sheet";
import { CertifyActions } from "@/components/portal/certify-actions";
import { requirePortal } from "@/lib/portal-auth";
import { getPrincipalQueue, getReportCardView } from "@/lib/portal-report-card";

export const metadata: Metadata = {
  title: "Certify report cards | Principal Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.63.0 — the Principal's certification desk.
 *
 * ?card=<id>  → the review room: the full sheet + Certify / Return actions.
 * otherwise   → the queue of submitted sheets + the recent certified list.
 *
 * Drafts NEVER appear here — a sheet exists for the Principal only from the
 * moment the class teacher hands it over. Students and parents receive the
 * sheet only after certification.
 */
export default async function PrincipalCertifyPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string }>;
}) {
  const session = await requirePortal("principal");
  const [queue, params] = await Promise.all([
    getPrincipalQueue(session.accountId),
    searchParams,
  ]);

  const cardId = Number(params.card);
  const review =
    Number.isInteger(cardId) && cardId > 0
      ? await getReportCardView(cardId, { role: "principal", accountId: session.accountId })
      : null;

  return (
    <PortalShell
      role="principal"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/principal" },
        { label: "Certify", href: "/principal/report-card", active: true },
        { label: "Signature", href: "/principal/signature" },
        { label: "Profile", href: "/principal/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        {review?.ok ? (
          <>
            <HeroRow
              overline={`Reviewing · ${review.card.cls.name} · ${review.card.year}`}
              firstName={review.card.student.fullName}
              secondaryLabel="State"
              secondaryValue={
                review.card.status === "submitted"
                  ? "Waiting for your certification"
                  : "Certified — visible to the family"
              }
              ctaLabel="Back to the queue"
              ctaHref="/principal/report-card"
            />

            <CertifyActions
              cardId={review.card.cardId}
              status={review.card.status}
              studentName={review.card.student.fullName}
              className={review.card.cls.name}
              year={review.card.year}
              hasSign={queue.hasSign}
              hasSeal={queue.hasSeal}
              certifiedByName={review.card.certifiedByName}
              certifiedAtLabel={review.card.certifiedAtLabel}
            />

            <ReportCardSheet card={review.card} />
          </>
        ) : (
          <>
            <HeroRow
              overline="Principal · report card certification"
              firstName={session.fullName.trim().split(/\s+/)[0] || "Principal"}
              secondaryLabel="Queue"
              secondaryValue={
                queue.counts.queue > 0
                  ? `${queue.counts.queue} sheet${queue.counts.queue === 1 ? "" : "s"} waiting`
                  : "Nothing waiting"
              }
              ctaLabel="Dashboard"
              ctaHref="/principal"
            />

            <Panel
              title="Waiting for certification"
              subtitle="Submitted by class teachers — students and parents see a sheet only after you certify it"
            >
              {queue.queue.length === 0 ? (
                <EmptyNote>
                  The queue is empty. Submitted report cards land here the moment
                  a class teacher sends them.
                </EmptyNote>
              ) : (
                <div className="space-y-2.5">
                  {queue.queue.map((item) => (
                    <Link
                      key={item.cardId}
                      href={`/principal/report-card?card=${item.cardId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5 transition-colors hover:border-[var(--pt-border-strong)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                          {item.studentName}
                        </span>
                        <span className="block text-[11px] text-[var(--pt-muted)]">
                          {item.className || item.grade} · {item.year} · Admission {item.admissionNo} ·
                          submitted {item.submittedAtLabel || "—"} · last saved {item.updatedLabel}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-3.5 py-1.5 text-[11.5px] font-bold text-[var(--pt-on-accent)]">
                        <ScrollText size={13} aria-hidden="true" />
                        Review
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Recently certified"
              subtitle="Sheets already carrying your signature and the college seal"
            >
              {queue.recent.length === 0 ? (
                <EmptyNote>Nothing certified yet.</EmptyNote>
              ) : (
                <div className="space-y-2">
                  {queue.recent.map((item) => (
                    <Link
                      key={item.cardId}
                      href={`/principal/report-card?card=${item.cardId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-2.5 transition-colors hover:border-[var(--pt-border-strong)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
                          {item.studentName} · {item.className} · {item.year}
                        </span>
                        <span className="block text-[10.5px] text-[var(--pt-muted)]">
                          Certified {item.certifiedAtLabel}
                          {item.certifiedByName ? ` · by ${item.certifiedByName}` : ""}
                        </span>
                      </span>
                      <CheckCircle2
                        size={15}
                        className="shrink-0 text-[var(--pt-good-text)]"
                        aria-hidden="true"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--pt-muted)]">
              <Undo2 size={12} aria-hidden="true" />
              Certified a sheet by mistake? Open it and use “Return with a note” — it goes
              back to the class teacher as a draft.
            </p>
          </>
        )}
      </div>
    </PortalShell>
  );
}
