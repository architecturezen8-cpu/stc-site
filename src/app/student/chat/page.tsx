import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { ChatHub } from "@/components/portal/chat-hub";
import { requirePortal } from "@/lib/portal-auth";
import { chatUnreadBadge, studentChatThreads } from "@/lib/portal-questions";

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
  const [threads, badge] = await Promise.all([
    studentChatThreads(session.accountId),
    chatUnreadBadge("student", session.accountId),
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
        { label: "Notices", href: "/student#notices" },
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

        <ChatHub role="student" initialThreads={threads} />
      </div>
    </PortalShell>
  );
}
