import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { TeacherMaterials } from "@/components/portal/teacher-materials";
import { HeroRow } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { getTeacherAssignmentOptions } from "@/lib/portal-assignments";
import { getTeacherMaterials } from "@/lib/portal-classroom";
import { chatUnreadBadge } from "@/lib/portal-questions";

export const metadata: Metadata = {
  title: "Materials | Teacher Portal · St. Thomas' College, Matale",
};

/**
 * PHASE 3.1-e — the teacher's materials hub: hand out notes, worksheets,
 * videos (N files + a link) to a class×subject. Students open everything
 * from the Class Materials panel on their dashboard.
 */
export default async function TeacherMaterialsPage() {
  const session = await requirePortal("teacher");
  const [options, materials, chatBadge] = await Promise.all([
    getTeacherAssignmentOptions(session.accountId),
    getTeacherMaterials(session.accountId),
    /* v2.8.51.0 — the Chat nav badge: unread student questions. */
    chatUnreadBadge("teacher", session.accountId),
  ]);

  const totalFiles = materials.reduce((sum, m) => sum + m.fileCount, 0);

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
        /* v2.8.51.0 — the dedicated Chat section with the unread badge */
        { label: "Chat", href: "/teacher/chat", badge: chatBadge },
        { label: "Marks", href: "/teacher/marks" },
        { label: "Report card", href: "/teacher/report-card" },
        { label: "Materials", href: "/teacher/materials", active: true },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher#timetable" },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Marking", href: "/teacher#marking" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Notes · worksheets · videos"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Teacher"}
          secondaryLabel="Materials"
          secondaryValue={
            materials.length > 0
              ? `${materials.length} shared · ${totalFiles} file${totalFiles === 1 ? "" : "s"}`
              : "Nothing shared yet"
          }
          ctaLabel="Share a material"
          ctaHref="#share"
        />

        <TeacherMaterials options={options} initialMaterials={materials} />
      </div>
    </PortalShell>
  );
}
