import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { ChatHub } from "@/components/portal/chat-hub";
import { requirePortal } from "@/lib/portal-auth";
import { chatUnreadBadge, studentChatThreads } from "@/lib/portal-questions";
import { getChatRetention } from "@/lib/chat-retention";

export const metadata: Metadata = {
  title: "Chat | Student Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.51.0 — the student's dedicated Chat section (the owner's "apita
 * baida ekata wenama chat section ekak hadanna"): every "Ask the teacher"
 * conversation in one place — unread badges, waiting-for-reply flags,
 * search and filters — so a teacher's reply is discovered here instead of
 * by walking into the assignment. Threads stay private: this page only
 * ever lists what portal-questions.ts proves the viewer may read.
 */
export default async function StudentChatPage() {
  const session = await requirePortal("student");
  const [threads, badge, retention] = await Promise.all([
    studentChatThreads(session.accountId),
    chatUnreadBadge("student", session.accountId),
    /* v2.8.70.1 — the auto-clear note (portal side of the new setting). */
    getChatRetention(),
  ]);

  const unread = threads.reduce((sum, t) => sum + t.unread, 0);
  const firstName = session.fullName.trim().split(/\s+/)[0] || "there";

  return (
    <PortalShell
      role="student"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/student" },
        { label: "Timetable", href: "/student/timetable" },
        { label: "Homework", href: "/student/homework" },
        { label: "Chat", href: "/student/chat", active: true, badge },
        { label: "Marks", href: "/student#marks" },
        { label: "Report card", href: "/student/report-card" },
        { label: "Notices", href: "/student#notices" },
        { label: "My Storage", href: "/student/storage" },
        { label: "Profile", href: "/student/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Ask · reply · stay caught up"
          firstName={firstName}
          secondaryLabel="Conversations"
          secondaryValue={
            threads.length > 0
              ? `${threads.length} · ${unread} unread`
              : "Nothing yet"
          }
          ctaLabel="Ask from a homework"
          ctaHref="/student/homework"
        />

        {retention.chatRetentionDays > 0 && (
          <p className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-2.5 text-[12.5px] text-[var(--pt-info-text)]">
            Messages older than {retention.chatRetentionDays} {retention.chatRetentionDays === 1 ? "day" : "days"} are
            removed automatically to keep conversations light
            {retention.fileRetentionDays > 0
              ? ` — files after ${retention.fileRetentionDays} ${retention.fileRetentionDays === 1 ? "day" : "days"}`
              : ""}
            .
          </p>
        )}

        <ChatHub role="student" initialThreads={threads} />
      </div>
    </PortalShell>
  );
}
