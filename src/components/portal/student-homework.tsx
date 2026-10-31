"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight, NotebookPen, Users } from "lucide-react";
import { FileCountBadge, type AssignmentFileRef } from "@/components/portal/assignment-file-ui";
import { gradeChipClass, gradeForScore } from "@/lib/grades-shared";

/* Mirrors src/lib/portal-assignments.ts StudentHomeworkItem — declared
   locally so this client island never pulls in the server-only module. */
export type StudentHomeworkItem = {
  id: number;
  title: string;
  instructions: string;
  subject: string;
  className: string;
  dueLabel: string;
  dueAt: string | null;
  duePassed: boolean;
  status: "pending" | "submitted" | "graded";
  isLate: boolean;
  myText: string;
  submittedLabel: string;
  score: number | null;
  /* v2.8.56.0 — Phase 3.2: the scale the score is out of. */
  maxScore: number;
  feedback: string;
  teacherFiles: AssignmentFileRef[];
  linkUrl: string;
  myFiles: AssignmentFileRef[];
  myLinkUrl: string;
  /* v2.8.57.0 — Phase 4.1: group work fields. */
  isGroup: boolean;
  groupName: string | null;
  groupMembers: { studentId: number; fullName: string; admissionNo: string }[];
  myAdjustment: number | null;
  finalScore: number | null;
};

const CHIP: Record<StudentHomeworkItem["status"], string> = {
  pending: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  submitted: "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]",
  graded: "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
};

const LABEL: Record<StudentHomeworkItem["status"], string> = {
  pending: "Pending",
  submitted: "Submitted",
  graded: "Graded",
};

/**
 * v2.8.44.0 — the Homework panel on the dashboard is now a pure LAUNCHER:
 * every row routes to the full working page at /student/homework/[id]
 * (the owner's call — the cramped popup sheet is gone; the assignment gets
 * a whole spacious page: instructions, teacher files, big answer box,
 * attachments, score + feedback). The list keeps the same compact visual
 * language — status chip, due line, paperclip badge, score.
 *
 * v2.8.55.0 (owner item 5) — the SAME list now renders on its own page:
 * variant="scroll" (the dashboard panel, max-h with an inner scrollbar —
 * the default) or variant="full" (the dedicated /student/homework page,
 * the whole list, no inner scroll).
 */
export function StudentHomework({
  items,
  variant = "scroll",
}: {
  items: StudentHomeworkItem[];
  variant?: "scroll" | "full";
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-8 text-center text-[12.5px] text-[var(--pt-body)]">
        No homework right now — new assignments land here the moment a
        teacher sets them.
      </p>
    );
  }

  return (
    <div
      className={`space-y-2.5 pr-0.5 ${
        variant === "scroll" ? "pt-scrollbar max-h-[320px] overflow-y-auto" : ""
      }`}
    >
      {items.map((a) => (
        <Link
          key={a.id}
          href={`/student/homework/${a.id}`}
          className="group block w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3 text-left transition-colors hover:border-[var(--pt-accent)]"
          aria-label={`Open ${a.title} — ${LABEL[a.status]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                {a.title}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10.5px] text-[var(--pt-body)]">
                <NotebookPen size={10} /> {a.subject}
                {a.isGroup && a.groupName ? (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-[var(--pt-accent-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--pt-accent-text)]">
                    <Users size={8} /> {a.groupName}
                  </span>
                ) : null}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${CHIP[a.status]}`}
              >
                {LABEL[a.status]}
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
