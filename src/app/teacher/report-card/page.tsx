import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { ReportCardEditor } from "@/components/portal/report-card-editor";
import { EmptyNote, HeroRow, Panel } from "@/components/portal/dashboard-widgets";
import { requirePortal } from "@/lib/portal-auth";
import { chatUnreadBadge } from "@/lib/portal-questions";
import {
  getReportCardForEdit,
  getTeacherClassStudents,
  getTeacherReportClasses,
  type TeacherClassStudent,
} from "@/lib/portal-report-card";

export const metadata: Metadata = {
  title: "Report card | Teacher Portal · St. Thomas' College, Matale",
};

/**
 * v2.8.62.0 — the DIGITAL TERMINAL REPORT CARD, teacher side.
 *
 * ?class=<classId>          → that class's roster with each student's sheet state
 * ?class=…&student=…        → the editor for that student's sheet (or its template)
 * neither                   → the wall of classes this teacher leads
 *
 * ONLY the class teacher of the class may reach past the class wall — the
 * lib guards every call and the page shows a calm note otherwise.
 */
export default async function TeacherReportCardPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; student?: string }>;
}) {
  const session = await requirePortal("teacher");
  const [classes, chatBadge, params] = await Promise.all([
    getTeacherReportClasses(session.accountId),
    chatUnreadBadge("teacher", session.accountId),
    searchParams,
  ]);

  const classId = Number(params.class);
  const classDetail =
    Number.isInteger(classId) && classId > 0
      ? await getTeacherClassStudents(session.accountId, classId)
      : null;

  /* Resolve the student to load: the URL's student when they're on this
     roster, otherwise the first student — the editor always opens on a
     real sheet or template. */
  let students: TeacherClassStudent[] = [];
  let cls: { id: number; name: string; grade: string; academicYear: string } | null = null;
  if (classDetail?.ok) {
    students = classDetail.data.students;
    cls = classDetail.data.class;
  }

  const studentId = Number(params.student);
  const wanted =
    Number.isInteger(studentId) && studentId > 0 && students.some((s) => s.studentId === studentId)
      ? studentId
      : (students[0]?.studentId ?? 0);
  const editResult =
    cls && wanted > 0 ? await getReportCardForEdit(session.accountId, cls.id, wanted) : null;

  const roster =
    cls && !editResult?.ok
      ? { cls, students }
      : null;

  const certifiedCount = students.filter((s) => s.cardStatus === "certified").length;
  const submittedCount = students.filter((s) => s.cardStatus === "submitted").length;
  const draftCount = students.filter((s) => s.cardStatus === "draft").length;

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
        /* v2.8.62.0 — the digital terminal report card */
        { label: "Report card", href: "/teacher/report-card", active: true },
        { label: "Materials", href: "/teacher/materials" },
        { label: "Notices", href: "/teacher/notices" },
        { label: "Timetable", href: "/teacher/timetable" },
        { label: "Classes", href: "/teacher#classes" },
        { label: "Marking", href: "/teacher#marking" },
        { label: "Profile", href: "/teacher/profile" },
      ]}
    >
      <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
        <HeroRow
          overline="Terminal examination · report cards"
          firstName={session.fullName.trim().split(/\s+/)[0] || "Teacher"}
          secondaryLabel="Sheets"
          secondaryValue={
            cls
              ? `${certifiedCount} certified · ${submittedCount} with the Principal · ${draftCount} draft · ${students.length} students`
              : classes.length > 0
                ? `${classes.length} class${classes.length === 1 ? "" : "es"} under your care`
                : "No classes yet"
          }
          ctaLabel={cls ? "Class roster" : classes[0] ? "Open a class" : "Dashboard"}
          ctaHref={cls ? `/teacher/report-card?class=${cls.id}` : classes[0] ? `/teacher/report-card?class=${classes[0].id}` : "/teacher"}
        />

        {!cls ? (
          <div className="pt-rise">
            <Panel
              title="Report cards"
              subtitle={
                classes.length > 0
                  ? "Pick one of your classes — you sign its sheets as class teacher"
                  : "The classes you lead as class teacher appear here"
              }
            >
              {classes.length === 0 ? (
                <EmptyNote>
                  You are not the class teacher of any class right now. Report
                  cards are signed by the class teacher — ask the office if
                  this is a mistake.
                </EmptyNote>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {classes.map((c) => (
                    <Link
                      key={c.id}
                      href={`/teacher/report-card?class=${c.id}`}
                      className="group rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4 transition-colors hover:border-[var(--pt-border-strong)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-display text-[15px] font-semibold text-[var(--pt-heading)]">
                          {c.name}
                        </p>
                        <ScrollText
                          size={16}
                          className="shrink-0 text-[var(--pt-muted)] transition-colors group-hover:text-[var(--pt-accent-text)]"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="mt-1 text-[11.5px] text-[var(--pt-muted)]">
                        Grade {c.grade}
                        {c.section ? ` · ${c.section}` : ""} · {c.academicYear} · {c.roll} student
                        {c.roll === 1 ? "" : "s"}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : editResult?.ok ? (
          <ReportCardEditor
            classDetail={{ class: cls, students }}
            initialEdit={editResult.data}
          />
        ) : roster ? (
          <div className="pt-rise">
            <Panel
              title={roster.cls.name}
              subtitle={
                roster.students.length > 0
                  ? "Choose a student to open their sheet"
                  : "No active students in this class yet"
              }
            >
              {roster.students.length === 0 ? (
                <EmptyNote>
                  Once the office enrolls students into {roster.cls.name}, their
                  report cards start here.
                </EmptyNote>
              ) : (
                <div className="space-y-2.5">
                  {roster.students.map((s) => (
                    <Link
                      key={s.studentId}
                      href={`/teacher/report-card?class=${roster.cls.id}&student=${s.studentId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3 transition-colors hover:border-[var(--pt-border-strong)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
                          {s.fullName}
                        </span>
                        <span className="block text-[10.5px] text-[var(--pt-muted)]">
                          Admission {s.admissionNo}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          s.cardStatus === "certified"
                            ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                            : s.cardStatus === "submitted"
                              ? "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                              : s.cardStatus === "draft"
                                ? "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
                                : "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                        }`}
                      >
                        {s.cardStatus === "certified"
                          ? "Certified"
                          : s.cardStatus === "submitted"
                            ? "With Principal"
                            : s.cardStatus === "draft"
                              ? "Draft"
                              : "No sheet"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </PortalShell>
  );
}
