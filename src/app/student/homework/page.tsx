import type { Metadata } from "next";
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
 */
export default async function StudentHomeworkListPage() {
  const session = await requirePortal("student");
  const [homework, chatBadge] = await Promise.all([
    getStudentHomework(session.accountId),
    chatUnreadBadge("student", session.accountId),
  ]);

  const pending = homework.filter((h) => h.status === "pending").length;
  const submitted = homework.filter((h) => h.status === "submitted").length;
  const graded = homework.filter((h) => h.status === "graded").length;

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
        { label: "Notices", href: "/student#notices" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Everything your teachers have set"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Thomian"}
          secondaryLabel="This Term"
          secondaryValue={
            homework.length > 0
              ? `${pending} pending · ${submitted} submitted · ${graded} graded`
              : "Nothing yet"
          }
          ctaLabel="Dashboard"
          ctaHref="/student"
        />

        <div className="pt-rise pt-d1">
          <Panel
            title="My Homework"
            subtitle={
              homework.length > 0
                ? `${homework.length} item${homework.length === 1 ? "" : "s"} · tap one to open it`
                : "The list fills in as teachers set work"
            }
          >
            {/* Status chips — the same visual language as attendance. */}
            {homework.length > 0 ? (
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
            <StudentHomework items={homework} variant="full" />
          </Panel>
        </div>
      </div>
    </PortalShell>
  );
}
