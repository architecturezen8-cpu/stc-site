import type { Metadata } from "next";
import Link from "next/link";
import { FileWarning } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { HomeworkWorkArea } from "@/components/portal/student-homework-work";
import { requirePortal } from "@/lib/portal-auth";
import { getStudentHomework } from "@/lib/portal-assignments";
import { chatUnreadBadge, getStudentThread } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Homework | Student Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.44.0 — the full working page for ONE assignment (the owner's call:
 * dashboard rows now route here instead of opening the cramped popup —
 * "ida madinam wenama page ekakata redirect wela ethana assignment eka
 * karanna"). The item is picked from the SAME server list the dashboard
 * panel renders, so ownership is implicit: a student can only ever reach
 * work set for their own active enrollments, and an unknown/wrong id lands
 * on the friendly not-available card below.
 *
 * v2.8.50.0 — Phase 2.1: the page also carries the student's own private
 * "Ask the teacher" thread (server-fetched, same ownership checks).
 */
export default async function StudentHomeworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePortal("student");
  const [{ id }, homework, chatBadge] = await Promise.all([
    params,
    getStudentHomework(session.accountId),
    /* v2.8.51.0 — the Chat nav badge: unread teacher replies. */
    chatUnreadBadge("student", session.accountId),
  ]);

  const numericId = Number(id);
  const item =
    Number.isInteger(numericId) && numericId > 0
      ? homework.find((h) => h.id === numericId) ?? null
      : null;

  /* Phase 2.1 — the private Q&A thread for THIS assignment (only reached
     when the item itself is reachable, so enrollment is already proven). */
  const questions =
    item
      ? await getStudentThread(session.accountId, numericId).then((r) =>
          r.ok ? r.thread.messages : [],
        )
      : [];

  return (
    <PortalShell
      role="student"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/student" },
        { label: "Timetable", href: "/student/timetable" },
        { label: "Homework", href: "/student/homework", active: true },
        /* v2.8.51.0 — the dedicated Chat section with the unread badge */
        { label: "Chat", href: "/student/chat", badge: chatBadge },
        { label: "Marks", href: "/student#marks" },
        { label: "Report card", href: "/student/report-card" },
        { label: "Notices", href: "/student#notices" },
        { label: "My Storage", href: "/student/storage" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      {item ? (
        <HomeworkWorkArea item={item} questions={questions} />
      ) : (
        <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-10 sm:px-6">
          <div className="mx-auto max-w-md rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-8 text-center">
            <FileWarning size={30} className="mx-auto text-[var(--pt-muted)]" />
            <h1 className="mt-3 font-display text-lg font-semibold text-[var(--pt-heading)]">
              This homework isn&apos;t available
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--pt-body)]">
              It may have been removed, or it isn&apos;t set for your class.
              Check your homework list on the Homework page.
            </p>
            <Link
              href="/student/homework"
              className="mt-5 inline-flex h-10 items-center rounded-full bg-[var(--pt-accent)] px-6 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90"
            >
              Back to my homework
            </Link>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
