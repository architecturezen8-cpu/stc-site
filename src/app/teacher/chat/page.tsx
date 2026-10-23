import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { ChatHub } from "@/components/portal/chat-hub";
import { requirePortal } from "@/lib/portal-auth";
import { chatUnreadBadge, teacherChatThreads } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Chat | Teacher Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.51.0 — the teacher's dedicated Chat section: every student question
 * across the assignments this teacher set, in one place — unread badges,
 * "needs reply" flags, search by student/assignment, filters — so a
 * question is answered from here without opening the submissions register.
 * Threads stay private: this page only ever lists what portal-questions.ts
 * proves the viewer may read (their own class×subject ownership).
 */
export default async function TeacherChatPage() {
  const session = await requirePortal("teacher");
  const [threads, badge] = await Promise.all([
    teacherChatThreads(session.accountId),
    chatUnreadBadge("teacher", session.accountId),
  ]);

  const unread = threads.reduce((sum, t) => sum + t.unread, 0);
  const toAnswer = threads.filter((t) => t.needsReply).length;
  const firstName = session.fullName.trim().split(/\s+/)[0] || "there";

  return (
    <PortalShell
      role="teacher"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/teacher" },
        { label: "Attendance", href: "/teacher/attendance" },
        { label: "Assignments", href: "/teacher/assignments" },
        { label: "Chat", href: "/teacher/chat", active: true, badge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Answer questions · stay close to the class"
          firstName={firstName}
          secondaryLabel="Conversations"
          secondaryValue={
            threads.length > 0
              ? `${threads.length} · ${unread} unread · ${toAnswer} to answer`
              : "Nothing yet"
          }
          ctaLabel="Post new work"
          ctaHref="/teacher/assignments"
        />

        <ChatHub role="teacher" initialThreads={threads} />
      </div>
    </PortalShell>
  );
}
