import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, NotebookPen, Phone, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import {
  ChildCard,
  EmptyNote,
  HeroRow,
  ListRow,
  NoticeAttachments,
  Panel,
  PanelFooter,
  PerformanceChart,
  StatCards,
} from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getParentDashboard } from "@/lib/portal-dashboard";
import { colomboTodayKey, getParentCalendar } from "@/lib/portal-calendar";
import { PortalCalendar } from "@/components/portal/portal-calendar";
import { studentAvatarFor } from "@/lib/student-avatar";
import { gradeForPct } from "@/lib/grades-shared";

export const metadata: Metadata = {
  title: "Parent Dashboard | St. Thomas' College, Matale",
};

/**
 * Parent dashboard — v2.8.39.0 rebuild on the owner's reference structure:
 * rounded stat cards up top, the family chart, then each child as their own
 * avatar card (picture, class, attendance line, average mark) — plus
 * notices and support.
 *
 * v2.8.53.0 — Phase 2.2: the #calendar section (their children's due dates
 * + school events + class notices, no new tables).
 */
export default async function ParentDashboardPage() {
  const session = await requirePortal("parent");
  const [data, calendar] = await Promise.all([
    getParentDashboard(session.email, session.accountId, session.fullName),
    /* v2.8.53.0 — Phase 2.2: the calendar rows. */
    getParentCalendar(session.accountId),
  ]);

  const hasChart = data.weekly.some((v) => v > 0);
  const attendanceValues = data.children
    .map((c) => c.attendancePct)
    .filter((v): v is number => v != null);
  const marksValues = data.children
    .map((c) => c.marksAvgPct)
    .filter((v): v is number => v != null);
  const avgAttendance =
    attendanceValues.length > 0
      ? Math.round(
          attendanceValues.reduce((a, b) => a + b, 0) / attendanceValues.length,
        )
      : null;
  const avgMarks =
    marksValues.length > 0
      ? Math.round(marksValues.reduce((a, b) => a + b, 0) / marksValues.length)
      : null;

  return (
    <PortalShell
      role="parent"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/parent", active: true },
        { label: "Calendar", href: "#calendar" },
        { label: "Children", href: "#children" },
        { label: "Homework", href: "/parent/homework" },
        { label: "Marks", href: "/parent/marks" },
        { label: "Report card", href: "/parent/report-card" },
        { label: "Notices", href: "#notices" },
        { label: "Support", href: "#support" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Follow their journey here"
          firstName={data.firstName}
          secondaryLabel="My Children"
          secondaryValue={
            data.children.length > 0
              ? `${data.children.length} on the roll`
              : "Awaiting link"
          }
          ctaLabel="View Children"
          ctaHref="#children"
        />

        {/* Reference-style stat cards */}
        <StatCards
          stats={[
            {
              value: String(data.children.length),
              label: "Children",
              icon: <Users size={17} aria-hidden="true" />,
              href: "#children",
            },
            {
              value: avgAttendance != null ? `${avgAttendance}%` : "—",
              label: "Avg Attendance",
              icon: <UserRoundCheck size={17} aria-hidden="true" />,
              /* v2.8.61.0 — the two averages were dead cards; they land on
                  the children wall where every child's own numbers live. */
              href: "#children",
            },
            {
              value: avgMarks != null ? `${avgMarks}%` : "—",
              label: "Avg Marks",
              icon: <BookOpen size={17} aria-hidden="true" />,
              href: "#children",
            },
            {
              value: String(data.notices.length),
              label: "New Notices",
              icon: <ShieldCheck size={17} aria-hidden="true" />,
              href: "#notices",
            },
          ]}
        />

        {/* v2.8.53.0 — Phase 2.2: the portal calendar (their children's
            due dates + school events + class notices). */}
        <div id="calendar" className="pt-rise pt-d1 scroll-mt-24">
          <Panel title="Calendar" subtitle="Due dates · school events · notices">
            <PortalCalendar items={calendar} today={colomboTodayKey()} />
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
          {/* Children + support */}
          <div className="space-y-5">
            <div id="children" className="pt-rise pt-d1 scroll-mt-24 space-y-5">
              <Panel title="My Children" subtitle="On the school roll">
                {data.children.length === 0 ? (
                  <EmptyNote>
                    Your children appear here once the school office links them
                    to your parent account.
                  </EmptyNote>
                ) : (
                  <div className="space-y-3">
                    {data.children.map((c, i) => (
                      <ChildCard
                        key={c.admissionNo + i}
                        name={c.name}
                        avatarSrc={studentAvatarFor(c.admissionNo)}
                        badge={
                          c.attendancePct != null ? (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                c.attendancePct >= 90
                                  ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                                  : c.attendancePct >= 75
                                    ? "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
                                    : "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
                              }`}
                            >
                              {c.attendancePct}%
                            </span>
                          ) : undefined
                        }
                        lines={[
                          c.className
                            ? `${c.className} · Admission ${c.admissionNo}`
                            : `Admission ${c.admissionNo}`,
                          c.attendancePct == null
                            ? "Register not started"
                            : c.absences > 0
                              ? `${c.absences} absence${c.absences === 1 ? "" : "s"}${c.lastAbsentLabel ? ` · last ${c.lastAbsentLabel}` : ""}`
                              : "No absences so far",
                          c.marksAvgPct != null
                            ? `Average mark ${c.marksAvgPct}% · Grade ${gradeForPct(c.marksAvgPct)}`
                            : "Average mark —",
                        ]}
                        /* v2.8.46.0 — per-child deep links into the
                           read-only homework + marks views */
                        actions={
                          <div className="mt-2.5 flex items-center gap-2">
                            <Link
                              href={`/parent/homework/${c.studentId}`}
                              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 text-[10.5px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
                            >
                              <NotebookPen size={10} /> Homework
                            </Link>
                            <Link
                              href={`/parent/marks/${c.studentId}`}
                              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 text-[10.5px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
                            >
                              <BookOpen size={10} /> Marks
                            </Link>
                          </div>
                        }
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div id="support" className="pt-rise pt-d4 scroll-mt-24">
              <Panel title="Support" subtitle="We're here to help">
                <div className="space-y-2.5">
                  {/* v2.8.61.0 — the office row is a REAL phone link now
                      (the owner: icons that do nothing). tel: opens the
                      dialer on phones, Maps-free and honest. */}
                  <ListRow
                    icon={<Phone size={15} />}
                    title="School Office"
                    desc="For account changes, links and invitations."
                    meta={[
                      { icon: <Phone size={11} />, text: "Tap to call +94 66 222 0173" },
                    ]}
                    href="tel:+94662220173"
                  />
                  <ListRow
                    icon={<ShieldCheck size={15} />}
                    title="Safe & Invited"
                    desc="Only accounts invited by the school can sign in."
                    meta={[{ text: "Invite-only portal" }]}
                  />
                  <ListRow
                    icon={<BookOpen size={15} />}
                    title="Parent Handbook"
                    desc="Everything about the college year at a glance."
                    meta={[{ text: "Read soon" }]}
                  />
                </div>
              </Panel>
            </div>
          </div>

          {/* Performance + notices */}
          <div className="space-y-5">
            <div className="pt-rise pt-d2">
              <Panel
                title="Family Performance"
                subtitle="This term so far"
                action="period"
              >
                <PerformanceChart
                  points={data.weekly}
                  highlightIndex={hasChart ? 2 : -1}
                  chipValue={hasChart ? `${data.children.length} linked` : ""}
                  chipLabel="Children on your account"
                  emptyNote={
                    hasChart
                      ? undefined
                      : "Insights fill in as attendance and marks are recorded."
                  }
                />
              </Panel>
            </div>

            <div id="notices" className="pt-rise pt-d3 scroll-mt-24">
              <Panel title="School Notices" subtitle="From their classes">
                {data.notices.length === 0 ? (
                  <EmptyNote>
                    Notices from your children&apos;s classes will appear
                    here.
                  </EmptyNote>
                ) : (
                  <div className="pt-scrollbar max-h-[320px] space-y-2.5 overflow-y-auto pr-0.5">
                    {/* v2.8.59.0 — notice attachments ride under each row. */}
                    {data.notices.map((n, i) => (
                      <div
                        key={n.id ?? i}
                        className="rounded-xl border border-[var(--pt-border)] px-3.5 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                            {n.title}
                          </p>
                          <span className="shrink-0 text-[11px] text-[var(--pt-muted)]">
                            {n.whenLabel}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--pt-body)]">
                          {n.body}
                        </p>
                        <NoticeAttachments
                          noticeId={n.id}
                          linkUrl={n.linkUrl}
                          files={n.files}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="pt-rise pt-d5">
              <Panel title="Journey" subtitle="This academic year">
                {data.children.length === 0 ? (
                  <EmptyNote>
                    A year-at-a-glance for each child appears once they are
                    linked to your account.
                  </EmptyNote>
                ) : (
                  <PanelFooter
                    left={
                      <p className="text-[12.5px] text-[var(--pt-body)]">
                        {data.children.length} child
                        {data.children.length === 1 ? "" : "ren"} linked ·{" "}
                        {data.children
                          .map((c) => c.className ?? "class pending")
                          .join(", ")}
                      </p>
                    }
                    right={
                      <span className="rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--pt-chip-text)]">
                        {data.dateLabel}
                      </span>
                    }
                  />
                )}
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
