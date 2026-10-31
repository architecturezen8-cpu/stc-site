import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { StudentHomework } from "@/components/portal/student-homework";
import { HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getStudentHomework } from "@/lib/portal-assignments";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Homework | Student Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.55.0 (owner item 5) — the student's homework gets its OWN page:
 * the full grid, every item, no dashboard squeeze. The dashboard keeps only
 * the urgent slice ("ikmanata iwara karanna ona homewors tika") and links
 * here; the nav's Homework pill lands here too.
 *
 * v2.8.61.0 — ?subject=<name> filters the list (the My Subjects tiles on
 * the dashboard link here per subject; the chip clears it in one tap).
 */
export default async function StudentHomeworkListPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const session = await requirePortal("student");
  const [homework, chatBadge, params] = await Promise.all([
    getStudentHomework(session.accountId),
    chatUnreadBadge("student", session.accountId),
    searchParams,
  ]);

  /* The tiles pass the exact subject name; match loosely on whitespace
     so a stray double-space in the timetable can't hide the work. */
  const subjectFilter = (params.subject || "").trim().toLowerCase();
  const visible = subjectFilter
    ? homework.filter(
        (h) => (h.subject || "").toLowerCase().replace(/\s+/g, " ") === subjectFilter,
      )
    : homework;

  const pending = visible.filter((h) => h.status === "pending").length;
  const submitted = visible.filter((h) => h.status === "submitted").length;
  const graded = visible.filter((h) => h.status === "graded").length;

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
        { label: "Homework", href: "/student/homework", active: true },
        { label: "Chat", href: "/student/chat", badge: chatBadge },
        { label: "Marks", href: "/student#marks" },
        { label: "Report card", href: "/student/report-card" },
        { label: "Notices", href: "/student#notices" },
        { label: "My Storage", href: "/student/storage" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Everything your teachers have set"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Thomian"}
          secondaryLabel="This Term"
          secondaryValue={
            visible.length > 0
              ? `${pending} pending · ${submitted} submitted · ${graded} graded`
              : "Nothing yet"
          }
          ctaLabel="Dashboard"
          ctaHref="/student"
        />

        <div className="pt-rise pt-d1">
          <Panel
            title={subjectFilter ? `${params.subject} — Homework` : "My Homework"}
            subtitle={
              visible.length > 0
                ? `${visible.length} item${visible.length === 1 ? "" : "s"} · tap one to open it`
                : subjectFilter
                  ? `No ${params.subject} work right now`
                  : "The list fills in as teachers set work"
            }
          >
            {/* Status chips — the same visual language as attendance. */}
            {visible.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[var(--pt-warn-bg)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--pt-warn-text)]">
                  Pending {pending}
                </span>
                <span className="rounded-full bg-[var(--pt-accent-soft)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--pt-accent-text)]">
                  Submitted {submitted}
                </span>
                <span className="rounded-full bg-[var(--pt-good-bg)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--pt-good-text)]">
                  Graded {graded}
                </span>
              </div>
            ) : null}
            {/* v2.8.61.0 — the subject chip + one-tap clear. */}
            {subjectFilter ? (
              <div className="mb-4">
                <Link
                  href="/student/homework"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-accent)] bg-[var(--pt-accent-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-accent-text)] transition-opacity hover:opacity-85"
                >
                  {params.subject}
                  <X size={11} aria-hidden="true" />
                  <span className="sr-only">Clear the subject filter</span>
                </Link>
              </div>
            ) : null}
            <StudentHomework items={visible} variant="full" />
          </Panel>
        </div>
      </div>
    </PortalShell>
  );
}
