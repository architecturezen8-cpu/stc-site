import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  ClipboardCheck,
  FileText,
  FileWarning,
  GraduationCap,
  Info,
  NotebookPen,
  Paperclip,
} from "lucide-react";
import { PortalShell } from "@/components/portal/portal-shell";
import { FileChipList, LinkRow } from "@/components/portal/assignment-file-ui";
import { requirePortal } from "@/lib/portal-auth";
import { gradeChipClass, gradeForScore } from "@/lib/grades-shared";
import {
  getLinkedChild,
  getParentChildHomeworkItem,
} from "@/lib/portal-parent-children";

export const metadata: Metadata = {
  title: "Homework | Parent Portal · St. Thomas' College, Matale",
};

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  submitted: "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]",
  graded: "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Not submitted yet",
  submitted: "Submitted",
  graded: "Graded",
};

/**
 * v2.8.46.0 — the READ-ONLY detail page for one of the child's
 * assignments: the teacher's brief, the child's answer (text, files,
 * link) and the grade. Mirrors the student workspace layout so parents
 * see exactly what their child sees — minus every control. The child id
 * AND assignment id are both re-verified against the parent's links.
 */
export default async function ParentHomeworkDetailPage({
  params,
}: {
  params: Promise<{ childId: string; assignmentId: string }>;
}) {
  const session = await requirePortal("parent");
  const { childId, assignmentId } = await params;

  const childNum = Number(childId);
  const assignNum = Number(assignmentId);
  const valid =
    Number.isInteger(childNum) && childNum > 0 && Number.isInteger(assignNum) && assignNum > 0;

  const [child, item] = await Promise.all([
    valid ? getLinkedChild(session.accountId, childNum) : Promise.resolve(null),
    valid
      ? getParentChildHomeworkItem(session.accountId, childNum, assignNum)
      : Promise.resolve(null),
  ]);
  const childFirst = child ? child.fullName.split(/\s+/)[0] : "Your child";
  const listHref = `/parent/homework/${childNum}`;

  return (
    <PortalShell
      role="parent"
      name={session.fullName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      nav={[
        { label: "Dashboard", href: "/parent" },
        { label: "Children", href: "/parent#children" },
        { label: "Homework", href: "/parent/homework", active: true },
        { label: "Marks", href: "/parent/marks" },
        { label: "Notices", href: "/parent#notices" },
        { label: "Profile", href: "/parent/profile" },
      ]}
    >
      {item ? (
        <div className="mx-auto max-w-[1240px] space-y-5 px-4 pb-12 pt-8 sm:px-6 sm:pt-10">
          <Link
            href={listHref}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-4 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
          >
            <ArrowLeft size={13} /> Back to {childFirst}&apos;s homework
          </Link>

          {/* header card */}
          <div className="pt-rise rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 sm:p-6">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--pt-accent-text)]">
              {item.subject} · {item.className}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display text-xl font-semibold tracking-[-0.01em] text-[var(--pt-heading)] sm:text-2xl">
                {item.title}
              </h1>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_CHIP[item.status]}`}
              >
                {STATUS_LABEL[item.status]}
              </span>
              {item.isLate ? (
                <span className="rounded-full bg-[var(--pt-danger-bg)] px-2.5 py-1 text-[10px] font-semibold text-[var(--pt-danger-text)]">
                  Late
                </span>
              ) : null}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--pt-body)]">
              <CalendarClock size={12} /> Due {item.dueLabel}
              {item.duePassed ? " — date passed" : ""}
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
            {/* left column */}
            <div className="space-y-5">
              {item.instructions ? (
                <div className="pt-rise pt-d1 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
                  <h2 className="flex items-center gap-2 font-display text-[14px] font-semibold text-[var(--pt-heading)]">
                    <NotebookPen size={15} className="text-[var(--pt-accent-text)]" /> What to do
                  </h2>
                  <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--pt-body)]">
                    {item.instructions}
                  </p>
                </div>
              ) : null}

              {item.teacherFiles.length > 0 || item.linkUrl ? (
                <div className="pt-rise pt-d2 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
                  <h2 className="flex items-center gap-2 font-display text-[14px] font-semibold text-[var(--pt-heading)]">
                    <Paperclip size={15} className="text-[var(--pt-accent-text)]" /> From the
                    teacher
                  </h2>
                  <div className="mt-3 space-y-3">
                    <FileChipList files={item.teacherFiles} />
                    {item.linkUrl ? <LinkRow url={item.linkUrl} /> : null}
                  </div>
                </div>
              ) : null}

              {/* the child's answer */}
              <div className="pt-rise pt-d3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
                <h2 className="flex items-center gap-2 font-display text-[14px] font-semibold text-[var(--pt-heading)]">
                  <FileText size={15} className="text-[var(--pt-accent-text)]" />{" "}
                  {childFirst}&apos;s answer
                </h2>
                {item.status === "pending" ? (
                  <p className="mt-3 rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-6 text-center text-[12.5px] text-[var(--pt-body)]">
                    Nothing submitted yet — the answer will appear here as soon
                    as {childFirst} submits.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {item.submittedLabel ? (
                      <p className="text-[11.5px] text-[var(--pt-body)]">
                        Submitted {item.submittedLabel}
                        {item.isLate ? " · after the due date" : ""}
                      </p>
                    ) : null}
                    {item.childText ? (
                      <p className="whitespace-pre-wrap rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4 text-[13.5px] leading-relaxed text-[var(--pt-body)]">
                        {item.childText}
                      </p>
                    ) : null}
                    {item.childFiles.length > 0 ? <FileChipList files={item.childFiles} /> : null}
                    {item.childLinkUrl ? <LinkRow url={item.childLinkUrl} /> : null}
                    {!item.childText &&
                    item.childFiles.length === 0 &&
                    !item.childLinkUrl ? (
                      <p className="text-[12.5px] text-[var(--pt-body)]">
                        The submission carries no text, files or link.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* grade */}
              <div className="pt-rise pt-d4 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
                <h2 className="flex items-center gap-2 font-display text-[14px] font-semibold text-[var(--pt-heading)]">
                  <GraduationCap size={15} className="text-[var(--pt-accent-text)]" /> Grade
                </h2>
                {item.score != null ? (
                  <div className="mt-3 space-y-3">
                    {/* v2.8.57.0 — Phase 4.1: the team's final mark for this
                        child (group score + own adjustment). */}
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                      <span className="font-display text-3xl font-bold text-[var(--pt-accent-text)]">
                        {(item.isGroup ? item.finalScore : item.score) ?? item.score}
                        <span className="text-[14px] font-medium text-[var(--pt-body)]">
                          {" "}/ {item.maxScore}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 font-display text-[13px] font-bold ${gradeChipClass(gradeForScore((item.isGroup ? item.finalScore : item.score) ?? 0, item.maxScore))}`}
                      >
                        Grade {gradeForScore((item.isGroup ? item.finalScore : item.score) ?? 0, item.maxScore)}
                      </span>
                    </div>
                    {item.isGroup && item.myAdjustment != null && item.myAdjustment !== 0 ? (
                      <p className="text-[11.5px] text-[var(--pt-body)]">
                        Group {item.score} · adjustment {item.myAdjustment > 0 ? "+" : ""}
                        {item.myAdjustment}
                      </p>
                    ) : null}
                    {item.feedback ? (
                      <p className="whitespace-pre-wrap rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4 text-[13px] leading-relaxed text-[var(--pt-body)]">
                        <span className="font-semibold text-[var(--pt-heading)]">
                          Teacher feedback:{" "}
                        </span>
                        {item.feedback}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-[var(--pt-body)]">
                    {item.status === "pending"
                      ? "Not graded yet — grading opens once the work is submitted."
                      : "Not graded yet — the teacher will review it soon."}
                  </p>
                )}
              </div>
            </div>

            {/* right rail */}
            <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
              <div className="pt-rise pt-d2 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
                <h3 className="font-display text-[13px] font-semibold text-[var(--pt-heading)]">
                  At a glance
                </h3>
                <dl className="mt-3 space-y-2.5 text-[12px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--pt-muted)]">Status</dt>
                    <dd className="font-semibold text-[var(--pt-heading)]">
                      {STATUS_LABEL[item.status]}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--pt-muted)]">Subject</dt>
                    <dd className="truncate font-semibold text-[var(--pt-heading)]">
                      {item.subject}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--pt-muted)]">Class</dt>
                    <dd className="font-semibold text-[var(--pt-heading)]">{item.className}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--pt-muted)]">Due</dt>
                    <dd className="font-semibold text-[var(--pt-heading)]">{item.dueLabel}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--pt-muted)]">Submitted</dt>
                    <dd className="truncate font-semibold text-[var(--pt-heading)]">
                      {item.submittedLabel || "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[var(--pt-muted)]">Score</dt>
                    <dd className="font-semibold text-[var(--pt-heading)]">
                      {item.score != null
                        ? `${(item.isGroup ? item.finalScore : item.score) ?? item.score}/${item.maxScore} · ${gradeForScore((item.isGroup ? item.finalScore : item.score) ?? 0, item.maxScore)}`
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="pt-rise pt-d3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-5">
                <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold text-[var(--pt-heading)]">
                  <Info size={13} className="text-[var(--pt-accent-text)]" /> Good to know
                </h3>
                <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-[var(--pt-body)]">
                  <li className="flex items-start gap-2">
                    <ClipboardCheck size={12} className="mt-0.5 shrink-0" />
                    This page is read-only — parents view, students submit.
                  </li>
                  <li className="flex items-start gap-2">
                    <NotebookPen size={12} className="mt-0.5 shrink-0" />
                    Re-submissions stay open until the teacher grades the work.
                  </li>
                  <li className="flex items-start gap-2">
                    <FileWarning size={12} className="mt-0.5 shrink-0" />
                    For changes, talk to the class teacher.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-10 sm:px-6">
          <div className="mx-auto max-w-md rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-8 text-center">
            <FileWarning size={30} className="mx-auto text-[var(--pt-muted)]" />
            <h1 className="mt-3 font-display text-lg font-semibold text-[var(--pt-heading)]">
              This homework isn&apos;t available
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--pt-body)]">
              It may have been removed, or it isn&apos;t set for your child&apos;s
              class.
            </p>
            <Link
              href="/parent/homework"
              className="mt-5 inline-flex h-10 items-center rounded-full bg-[var(--pt-accent)] px-6 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90"
            >
              Back to homework
            </Link>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
