import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FolderOpen,
  ScrollText,
  Search,
  Undo2,
} from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { ReportCardSheet } from "@/components/portal/report-card-sheet";
import { CertifyActions } from "@/components/portal/certify-actions";
import { requirePortal } from "@/lib/portal-auth";
import {
  getPrincipalCertifiedList,
  getPrincipalQueue,
  getReportCardView,
} from "@/lib/portal-report-card";

export const metadata: Metadata = {
  title: "Certify report cards | Principal Portal · St. Thomas' College, Matale",
};

/**
 * v2.9.16.0 — the Principal's certification desk.
 *
 * ?card=<id>        → the review room: the full sheet + Certify / Return actions.
 * ?view=certified   → the full certified register: every sheet carrying the
 *                     Principal's signature, filterable by year, class and
 *                     student search (the owner's "one place" ask).
 * otherwise         → the queue of submitted sheets + the recent certified list.
 *
 * Drafts NEVER appear here — a sheet exists for the Principal only from the
 * moment the class teacher hands it over. Students and parents receive the
 * sheet only after certification.
 */
export default async function PrincipalCertifyPage({
  searchParams,
}: {
  searchParams: Promise<{
    card?: string;
    view?: string;
    year?: string;
    classId?: string;
    q?: string;
  }>;
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

  /* ── The certified register (?view=certified) ───────────────────────── */
  const certifiedView = params.view === "certified";
  const yearFilter = params.year?.trim() ?? "";
  const classIdRaw = params.classId ? Number(params.classId) : NaN;
  const classIdFilter =
    Number.isInteger(classIdRaw) && classIdRaw > 0 ? classIdRaw : undefined;
  const qFilter = params.q?.trim() ?? "";
  const filtersActive = Boolean(yearFilter || classIdFilter || qFilter);

  /* The review room wins the page; the register only loads beside the queue. */
  const certified =
    certifiedView && !review?.ok
      ? await getPrincipalCertifiedList(session.accountId, {
          year: yearFilter || undefined,
          classId: classIdFilter,
          q: qFilter || undefined,
        })
      : null;

  return (
    <PortalShell
      role="principal"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/principal" },
        { label: "Certify", href: "/principal/report-card", active: !certifiedView },
        { label: "Certified", href: "/principal/report-card?view=certified", active: certifiedView },
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
              terms={review.card.terms.map((t) => ({
                term: t.term,
                verified: t.verified,
                verifiedAtLabel: t.verifiedAtLabel,
              }))}
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

            {/* ── v2.9.16.0 — the full certified register ───────────────────
                Collapsed by default; ?view=certified opens the filterable
                list of EVERY certified sheet (not just the recent 20). */}
            <Panel
              title="Certified reports"
              subtitle={
                certifiedView
                  ? "The full register — every sheet carrying your signature, filterable by year, class or student"
                  : "Every sheet carrying your signature — browse, filter, search"
              }
            >
              {certifiedView ? (
                certified?.ok ? (
                  <div className="space-y-3.5">
                    <form
                      method="get"
                      action="/principal/report-card"
                      className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5"
                    >
                      <input type="hidden" name="view" value="certified" />

                      <label className="sr-only" htmlFor="certified-year">
                        Year
                      </label>
                      <select
                        id="certified-year"
                        name="year"
                        defaultValue={yearFilter}
                        className="h-11 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[12.5px] font-medium text-[var(--pt-heading)]"
                      >
                        <option value="">All years</option>
                        {certified.years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>

                      <label className="sr-only" htmlFor="certified-class">
                        Class
                      </label>
                      <select
                        id="certified-class"
                        name="classId"
                        defaultValue={classIdFilter != null ? String(classIdFilter) : ""}
                        className="h-11 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[12.5px] font-medium text-[var(--pt-heading)]"
                      >
                        <option value="">All classes</option>
                        {certified.classes.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <label className="sr-only" htmlFor="certified-q">
                        Student name or admission number
                      </label>
                      <input
                        id="certified-q"
                        type="search"
                        name="q"
                        defaultValue={qFilter}
                        placeholder="Student name or admission no"
                        className="h-11 min-w-[180px] flex-1 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3.5 text-[12.5px] text-[var(--pt-heading)] placeholder:text-[var(--pt-muted)]"
                      />

                      <button
                        type="submit"
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--pt-accent)] px-4 text-[12.5px] font-bold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90"
                      >
                        <Search size={14} aria-hidden="true" />
                        Apply
                      </button>

                      {filtersActive ? (
                        <Link
                          href="/principal/report-card?view=certified"
                          className="inline-flex h-11 items-center rounded-xl border border-[var(--pt-border)] px-3.5 text-[12px] font-semibold text-[var(--pt-muted)] transition-colors hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)]"
                        >
                          Clear
                        </Link>
                      ) : null}
                    </form>

                    {certified.rows.length === 0 ? (
                      <EmptyNote>
                        {filtersActive
                          ? "No certified sheets match these filters. Try another year or class, or clear the search."
                          : "Nothing certified yet. Sheets land here the moment you certify them."}
                      </EmptyNote>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {certified.rows.map((item) => (
                            <Link
                              key={item.cardId}
                              href={`/principal/report-card?card=${item.cardId}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-2.5 transition-colors hover:border-[var(--pt-border-strong)]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
                                  {item.studentName} · {item.className || item.grade} · {item.year}
                                </span>
                                <span className="block text-[10.5px] text-[var(--pt-muted)]">
                                  Admission {item.admissionNo} · Certified {item.certifiedAtLabel}
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
                        <p className="text-[11px] text-[var(--pt-muted)]">
                          {filtersActive
                            ? `${certified.rows.length} of ${certified.total} certified sheet${certified.total === 1 ? "" : "s"} match the filters.`
                            : `All ${certified.total} certified sheet${certified.total === 1 ? "" : "s"}, newest first.`}
                          {certified.total > certified.rows.length
                            ? " Showing the newest 300 — narrow the filters to see the rest."
                            : ""}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <EmptyNote>
                    The certified register is unavailable right now. Please try
                    again in a moment.
                  </EmptyNote>
                )
              ) : (
                <Link
                  href="/principal/report-card?view=certified"
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-3 transition-colors hover:border-[var(--pt-border-strong)]"
                >
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-[var(--pt-heading)]">
                      {queue.counts.certified > 0
                        ? `${queue.counts.certified} certified sheet${queue.counts.certified === 1 ? "" : "s"} so far`
                        : "Nothing certified yet"}
                    </span>
                    <span className="block text-[10.5px] text-[var(--pt-muted)]">
                      Open the full list — filter by year or class, or search a student
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-3.5 py-1.5 text-[11.5px] font-bold text-[var(--pt-on-accent)]">
                    <FolderOpen size={13} aria-hidden="true" />
                    Browse all
                  </span>
                </Link>
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
