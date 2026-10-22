import Link from "next/link";
import { ArrowUpRight, CalendarClock, ChevronRight, NotebookPen, UserRound, Users } from "lucide-react";
import { FileCountBadge } from "@/components/portal/assignment-file-ui";
import { studentAvatarFor } from "@/lib/student-avatar";
import { gradeChipClass, gradeForScore } from "@/lib/grades-shared";
import type { ParentChildRef, ParentHomeworkItem } from "@/lib/portal-parent-children";

/* ── Child header ────────────────────────────────────────────────────── */

const CHIP =
  "inline-flex h-8 items-center gap-1 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 text-[11.5px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]";

/**
 * v2.8.46.0 — the child banner every parent homework/marks page opens
 * with, plus the cross-link to the sibling view (homework ⇄ marks).
 */
export function ParentChildHeader({
  child,
  crossLabel,
  crossHref,
}: {
  child: ParentChildRef;
  crossLabel: string;
  crossHref: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={studentAvatarFor(child.admissionNo)}
        alt={`${child.fullName}'s avatar`}
        className="h-12 w-12 shrink-0 rounded-full object-cover"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-semibold text-[var(--pt-heading)]">
          {child.fullName}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--pt-body)]">
          {child.className
            ? `${child.className} · Admission ${child.admissionNo}`
            : `Admission ${child.admissionNo}`}
        </p>
      </div>
      <Link href={crossHref} className={CHIP}>
        <ArrowUpRight size={13} /> {crossLabel}
      </Link>
    </div>
  );
}

/* ── Child switcher ──────────────────────────────────────────────────── */

/**
 * When a parent has more than one linked child, the homework/marks pages
 * show this pill row to hop between them. Rendered server-side — pills
 * are plain links.
 */
export function ParentChildSwitcher({
  kids,
  activeStudentId,
  basePath,
}: {
  kids: ParentChildRef[];
  activeStudentId: number;
  basePath: string;
}) {
  if (kids.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {kids.map((c) => {
        const active = c.studentId === activeStudentId;
        return (
          <Link
            key={c.studentId}
            href={`${basePath}/${c.studentId}`}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-[11.5px] font-semibold transition-colors ${
              active
                ? "bg-[var(--pt-accent)] text-[var(--pt-on-accent)]"
                : "border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] text-[var(--pt-body)] hover:border-[var(--pt-accent)]"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={studentAvatarFor(c.admissionNo)}
              alt=""
              className="h-5 w-5 rounded-full object-cover"
              loading="lazy"
            />
            {c.fullName.split(/\s+/)[0]}
          </Link>
        );
      })}
    </div>
  );
}

/* ── Homework launcher (read-only) ───────────────────────────────────── */

const HW_CHIP: Record<ParentHomeworkItem["status"], string> = {
  pending: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  submitted: "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]",
  graded: "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
};

const HW_LABEL: Record<ParentHomeworkItem["status"], string> = {
  pending: "Pending",
  submitted: "Submitted",
  graded: "Graded",
};

/**
 * v2.8.46.0 — the parent mirror of the student homework launcher.
 * Read-only: rows route to /parent/homework/[childId]/[assignmentId]
 * where the teacher's brief, the child's answer and the grade are laid
 * out — nothing here can be edited or submitted.
 */
export function ParentHomeworkList({
  items,
  childId,
}: {
  items: ParentHomeworkItem[];
  childId: number;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-8 text-center text-[12.5px] text-[var(--pt-body)]">
        No homework right now — anything the teachers set for the class lands
        here.
      </p>
    );
  }

  return (
    <div className="pt-scrollbar max-h-[560px] space-y-2.5 overflow-y-auto pr-0.5">
      {items.map((a) => (
        <Link
          key={a.id}
          href={`/parent/homework/${childId}/${a.id}`}
          className="group block w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3 text-left transition-colors hover:border-[var(--pt-accent)]"
          aria-label={`Open ${a.title} — ${HW_LABEL[a.status]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                {a.title}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-[var(--pt-body)]">
                <NotebookPen size={10} /> {a.subject}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1">
              {a.isLate ? (
                <span className="rounded-full bg-[var(--pt-danger-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--pt-danger-text)]">
                  Late
                </span>
              ) : null}
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${HW_CHIP[a.status]}`}
              >
                {HW_LABEL[a.status]}
              </span>
              <ChevronRight
                size={13}
                className="text-[var(--pt-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--pt-accent-text)]"
              />
            </span>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-[var(--pt-body)]">
            <CalendarClock size={10} /> Due {a.dueLabel}
            {a.teacherFiles.length > 0 || a.linkUrl ? (
              <span className="ml-1.5">
                <FileCountBadge count={a.teacherFiles.length} hasLink={Boolean(a.linkUrl)} />
              </span>
            ) : null}
            {a.score != null ? (
              <span className="ml-auto flex shrink-0 items-center gap-1.5 font-semibold text-[var(--pt-accent-text)]">
                Score {(a.isGroup ? a.finalScore : a.score) ?? a.score}/{a.maxScore}
                <span
                  className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${gradeChipClass(gradeForScore((a.isGroup ? a.finalScore : a.score) ?? 0, a.maxScore))}`}
                >
                  {gradeForScore((a.isGroup ? a.finalScore : a.score) ?? 0, a.maxScore)}
                </span>
              </span>
            ) : null}
          </p>
        </Link>
      ))}
    </div>
  );
}

/* ── Chooser card ────────────────────────────────────────────────────── */

/** One pick-a-child card for the /parent/homework and /parent/marks hubs. */
export function ParentChildPickCard({
  child,
  href,
}: {
  child: ParentChildRef;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-4 transition-colors hover:border-[var(--pt-accent)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={studentAvatarFor(child.admissionNo)}
        alt={`${child.fullName}'s avatar`}
        className="h-12 w-12 shrink-0 rounded-full object-cover"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[14px] font-semibold text-[var(--pt-heading)]">
          {child.fullName}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--pt-body)]">
          <UserRound size={10} className="mr-1 inline" />
          {child.className
            ? `${child.className} · Admission ${child.admissionNo}`
            : `Admission ${child.admissionNo}`}
        </p>
      </div>
      <ChevronRight
        size={15}
        className="shrink-0 text-[var(--pt-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--pt-accent-text)]"
      />
    </Link>
  );
}
