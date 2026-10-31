import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  FileWarning,
  GraduationCap,
  Layers,
  TrendingUp,
} from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  ParentChildHeader,
  ParentChildSwitcher,
} from "@/components/portal/parent-child-ui";
import { EmptyNote, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import {
  gradeChipClass,
  gradeForPct,
  gradeForScore,
} from "@/lib/grades-shared";
import {
  getLinkedChild,
  getLinkedChildren,
  getParentChildMarks,
} from "@/lib/portal-parent-children";

export const metadata: Metadata = {
  title: "Marks | Parent Portal · St. Thomas' College, Matale",
};

function pctChipClass(pct: number): string {
  if (pct >= 75) return "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]";
  if (pct >= 50) return "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]";
  return "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]";
}

/**
 * v2.8.46.0 — the linked child's full marks sheet: overall + per-term
 * averages, every published score (subject, assessment, term, score/max)
 * and a subject-averages breakdown. Read-only and re-guarded against the
 * parent's own links on every load.
 */
export default async function ParentChildMarksPage({
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
  const marks = child ? await getParentChildMarks(session.accountId, child.studentId) : null;
  const childFirst = child ? child.fullName.split(/\s+/)[0] : "your child";

  const bestSubject = marks?.subjects[0] ?? null;

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
        { label: "Report card", href: "/parent/report-card" },
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
                crossLabel="View homework"
                crossHref={`/parent/homework/${child.studentId}`}
              />
            </div>

            <ParentChildSwitcher
              kids={children}
              activeStudentId={child.studentId}
              basePath="/parent/marks"
            />

            {marks && marks.count > 0 ? (
              <>
                {/* summary stat cards */}
                <div className="pt-rise pt-d1 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
                      <TrendingUp size={11} /> Overall
                    </p>
                    <p className="mt-1.5 flex items-baseline gap-2 font-display text-2xl font-bold text-[var(--pt-heading)]">
                      {marks.overallPct != null ? `${marks.overallPct}%` : "—"}
                      {/* v2.8.56.0 — Phase 3.2: the overall grade letter. */}
                      {marks.overallPct != null ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${gradeChipClass(gradeForPct(marks.overallPct))}`}
                        >
                          {gradeForPct(marks.overallPct)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
                      <Layers size={11} /> Assessments
                    </p>
                    <p className="mt-1.5 font-display text-2xl font-bold text-[var(--pt-heading)]">
                      {marks.count}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
                      <GraduationCap size={11} /> Best subject
                    </p>
                    <p className="mt-1.5 truncate font-display text-[15px] font-bold leading-tight text-[var(--pt-heading)]">
                      {bestSubject ? bestSubject.subject : "—"}
                    </p>
                    {bestSubject ? (
                      <p className="text-[11px] font-semibold text-[var(--pt-accent-text)]">
                        avg {bestSubject.avgPct}%
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
                      <BarChart3 size={11} /> Terms
                    </p>
                    <p className="mt-1.5 font-display text-2xl font-bold text-[var(--pt-heading)]">
                      {marks.terms.length}
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
                  {/* term sections */}
                  <div className="space-y-5">
                    {marks.terms.map((term, ti) => (
                      <div
                        key={term.term}
                        className={`pt-rise pt-d${Math.min(ti + 2, 5)} rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="font-display text-[15px] font-semibold text-[var(--pt-heading)]">
                            {term.term}
                          </h2>
                          {term.avgPct != null ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${pctChipClass(term.avgPct)}`}
                            >
                              avg {term.avgPct}% · {gradeForPct(term.avgPct)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-2.5">
                          {term.rows.map((row) => (
                            <div
                              key={row.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
                                  {row.title}
                                </p>
                                <p className="mt-0.5 truncate text-[10.5px] text-[var(--pt-body)]">
                                  <BookOpen size={10} className="mr-1 inline" />
                                  {row.subject} · {row.whenLabel}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="text-[12.5px] font-bold text-[var(--pt-heading)]">
                                  {row.score}
                                  <span className="font-medium text-[var(--pt-muted)]">
                                    /{row.max}
                                  </span>
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gradeChipClass(gradeForScore(row.score, row.max))}`}
                                >
                                  {gradeForScore(row.score, row.max)} · {row.pct}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* right rail: subject averages */}
                  <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
                    <div className="pt-rise pt-d2 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
                      <h3 className="font-display text-[13px] font-semibold text-[var(--pt-heading)]">
                        Subject averages
                      </h3>
                      <div className="mt-3 space-y-2.5">
                        {marks.subjects.map((s) => (
                          <div key={s.subject} className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[12px] font-semibold text-[var(--pt-heading)]">
                                  {s.subject}
                                </p>
                                <p className="shrink-0 text-[11px] font-bold text-[var(--pt-accent-text)]">
                                  {s.avgPct}%
                                </p>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--pt-chip)]">
                                <div
                                  className="h-full rounded-full bg-[var(--pt-accent)]"
                                  style={{ width: `${Math.min(100, s.avgPct)}%` }}
                                />
                              </div>
                              <p className="mt-0.5 text-[10px] text-[var(--pt-muted)]">
                                {s.count} assessment{s.count === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-rise pt-d3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-5">
                      <h3 className="font-display text-[13px] font-semibold text-[var(--pt-heading)]">
                        Good to know
                      </h3>
                      <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-[var(--pt-body)]">
                        <li>
                          Only scores teachers have published are shown —
                          unmarked assessments wait until grading.
                        </li>
                        <li>
                          Averages are simple means of the percentage scores;
                          weightings come with the term report.
                        </li>
                        <li>
                          Questions about a mark? Talk to the subject teacher
                          via the class teacher.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="pt-rise pt-d1">
                <Panel
                  title="Marks"
                  subtitle={`${childFirst}'s published scores`}
                >
                  <EmptyNote>
                    No marks published yet — scores appear here the moment a
                    teacher grades {childFirst} on a class assessment.
                  </EmptyNote>
                </Panel>
              </div>
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
                Marks can only be viewed for children the school office has
                linked to your parent account.
              </p>
              <Link
                href="/parent/marks"
                className="mt-5 inline-flex h-10 items-center rounded-full bg-[var(--pt-accent)] px-6 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90"
              >
                Back to marks
              </Link>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
