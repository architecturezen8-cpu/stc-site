"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ClipboardList,
  Info,
  Loader2,
  Send,
} from "lucide-react";
import {
  AttachmentUploader,
  FileChipList,
  FileCountBadge,
  LinkField,
  LinkRow,
  type AssignmentFileRef,
} from "@/components/portal/assignment-file-ui";
import {
  HomeworkQuestions,
  type HomeworkQuestionMessage,
} from "@/components/portal/student-homework-questions";
import type { StudentHomeworkItem } from "@/components/portal/student-homework";
import { gradeChipClass, gradeForScore } from "@/lib/grades-shared";
import { Users } from "lucide-react";

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
 * v2.8.44.0 — the full working page for one assignment (the owner asked for
 * a roomy, dedicated space instead of the dashboard popup: "ida madinam
 * wenama page ekakata redirect wela ethana assignment eka karanna.
 * galapeni ekak karanna"). Two-column on desktop — the workspace on the
 * left, a sticky assignment-info card on the right — and a clean stack on
 * mobile. Same submit rules as before: text OR files OR link, re-submit
 * until graded, then the locked graded view.
 *
 * v2.8.50.0 — Phase 2.1: a private "Ask the teacher" Q&A thread sits below
 * the workspace (server-fetched messages; the island posts new ones).
 */
export function HomeworkWorkArea({
  item: initial,
  questions,
}: {
  item: StudentHomeworkItem;
  questions: HomeworkQuestionMessage[];
}) {
  const [item, setItem] = useState(initial);
  const locked = item.status === "graded";
  const [text, setText] = useState(item.myText);
  const [files, setFiles] = useState<AssignmentFileRef[]>(item.myFiles);
  const [linkUrl, setLinkUrl] = useState(item.myLinkUrl);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  const hasContent = text.trim().length >= 2 || files.length > 0 || linkUrl.trim() !== "";
  /* Server-computed (v2.8.44.0) — the client island reads it as a pure value. */
  const duePassed = item.duePassed;

  async function submit() {
    if (saving || locked || !hasContent) return;
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/assignments/${item.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contentText: text,
          linkUrl: linkUrl.trim() || undefined,
          files: files.length > 0 ? files : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save your answer.");
      }
      const late =
        item.dueAt != null
          ? Date.now() > new Date(item.dueAt).getTime()
          : false;
      setItem({
        ...item,
        status: "submitted",
        myText: text,
        myFiles: files,
        myLinkUrl: linkUrl.trim(),
        isLate: late,
        submittedLabel: "Just now",
        // a re-submit clears the old feedback until the teacher re-grades
        feedback: "",
      });
      setFlash({
        ok: true,
        text: late
          ? "Submitted — after the due date, so it's marked LATE."
          : "Submitted — your teacher can see it now.",
      });
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save your answer.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
      {/* Back + header */}
      <div className="pt-rise">
        <Link
          href="/student"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
        >
          <ArrowLeft size={13} /> Back to dashboard
        </Link>

        <div className="mt-4 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 sm:p-7">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--pt-accent-text)]">
            {item.subject} · {item.className}
          </p>
          <h1 className="mt-2 font-display text-[22px] font-semibold leading-snug text-[var(--pt-heading)] sm:text-[28px]">
            {item.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${CHIP[item.status]}`}
            >
              {LABEL[item.status]}
            </span>
            {item.isLate && item.status !== "pending" ? (
              <span className="rounded-full bg-[var(--pt-danger-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-danger-text)]">
                Late
              </span>
            ) : null}
            {item.status !== "pending" && item.submittedLabel ? (
              <span className="text-[12px] text-[var(--pt-body)]">
                · submitted {item.submittedLabel}
              </span>
            ) : null}
            {/* v2.8.57.0 — Phase 4.1: the team chip — group work announces
                itself with the group name + the whole member list. */}
            {item.isGroup && item.groupName ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pt-accent-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-accent-text)]">
                <Users size={12} /> Group work — {item.groupName}
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-[var(--pt-body)]">
              <CalendarClock size={13} />
              Due {item.dueLabel}
            </span>
          </div>
          {item.isGroup && item.groupMembers.length > 0 ? (
            <p className="mt-2.5 text-[11.5px] text-[var(--pt-body)]">
              <span className="font-semibold text-[var(--pt-heading)]">Your team:</span>{" "}
              {item.groupMembers.map((m) => m.fullName).join(", ")}
              {" "}— one answer for the whole group; any member can write or
              attach it until the work is graded.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_330px]">
        {/* Workspace */}
        <div className="space-y-5">
          {item.instructions ? (
            <section
              aria-label="Instructions"
              className="pt-rise pt-d1 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 sm:p-7"
            >
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                <ClipboardList size={13} /> What to do
              </p>
              <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--pt-heading)]">
                {item.instructions}
              </p>
            </section>
          ) : null}

          {item.teacherFiles.length > 0 || item.linkUrl ? (
            <section
              aria-label="Teacher attachments"
              className="pt-rise pt-d2 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 sm:p-7"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                From your teacher
              </p>
              <div className="mt-3">
                <FileChipList files={item.teacherFiles} />
                {item.linkUrl ? <LinkRow url={item.linkUrl} /> : null}
              </div>
            </section>
          ) : null}

          {locked ? (
            <section
              aria-label="Graded result"
              className="pt-rise pt-d2 space-y-4 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 sm:p-7"
            >
              {item.myFiles.length > 0 || item.myLinkUrl ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                    What you submitted
                  </p>
                  <div className="mt-3">
                    <FileChipList files={item.myFiles} />
                    {item.myLinkUrl ? <LinkRow url={item.myLinkUrl} /> : null}
                  </div>
                </div>
              ) : null}
              {/* v2.8.56.0 — Phase 3.2: the score, its scale and the grade
                  letter (A/B/C/S/W) side by side. A graded row always has
                  a score, but the null-check keeps TypeScript honest. */}
              {/* v2.8.57.0 — Phase 4.1: the final mark = group score + own
                  adjustment, with the letter from the shared helper. */}
              {item.score != null ? (
                <div className="rounded-2xl bg-[var(--pt-good-bg)] px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-good-text)]">
                    Your score
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                    <p className="font-display text-4xl font-semibold text-[var(--pt-heading)]">
                      {(item.isGroup ? item.finalScore : item.score) ?? item.score}
                      <span className="text-[15px] font-medium text-[var(--pt-body)]">
                        {" "}/ {item.maxScore}
                      </span>
                    </p>
                    <span
                      className={`rounded-full px-3 py-1 font-display text-[15px] font-bold ${gradeChipClass(gradeForScore((item.isGroup ? item.finalScore : item.score) ?? 0, item.maxScore))}`}
                    >
                      Grade {gradeForScore((item.isGroup ? item.finalScore : item.score) ?? 0, item.maxScore)}
                    </span>
                  </div>
                  {item.isGroup && item.myAdjustment != null && item.myAdjustment !== 0 ? (
                    <p className="mt-1.5 text-[11.5px] text-[var(--pt-body)]">
                      Group {item.score} · your adjustment{" "}
                      {item.myAdjustment > 0 ? "+" : ""}
                      {item.myAdjustment}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {item.feedback ? (
                <div className="rounded-2xl bg-[var(--pt-panel-soft)] px-5 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                    Teacher&apos;s feedback
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--pt-heading)]">
                    {item.feedback}
                  </p>
                </div>
              ) : null}
              <p className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] px-5 py-3 text-[12.5px] text-[var(--pt-body)]">
                This work is graded and locked. Talk to your teacher if you
                think something is wrong.
              </p>
            </section>
          ) : (
            <section
              aria-label="Your answer"
              className="pt-rise pt-d2 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5 sm:p-7"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                {item.status === "submitted"
                  ? "Your answer — edit and re-submit any time until it's graded"
                  : "Your answer"}
              </p>
              {item.status === "pending" && duePassed ? (
                <p className="mt-3 rounded-xl bg-[var(--pt-warn-bg)] px-4 py-2.5 text-[12.5px] text-[var(--pt-warn-text)]">
                  The due date has passed — you can still submit, but it will
                  be marked late.
                </p>
              ) : null}

              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={5000}
                placeholder="Type your answer here — or attach files / a link below…"
                className="mt-3 w-full resize-y rounded-2xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 py-3.5 text-[14px] leading-relaxed text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
              />

              <div className="mt-3">
                <AttachmentUploader files={files} onChange={setFiles} disabled={saving} />
              </div>
              <div className="mt-2.5">
                <LinkField value={linkUrl} onChange={setLinkUrl} disabled={saving} />
              </div>

              {flash ? (
                <div
                  role="status"
                  className={`mt-3 rounded-xl px-4 py-3 text-[12.5px] ${
                    flash.ok
                      ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                      : "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
                  }`}
                >
                  {flash.text}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] text-[var(--pt-muted)]">
                  {!hasContent
                    ? "Write, attach a file, or add a link — any one is enough."
                    : `${files.length} file${files.length === 1 ? "" : "s"} · ${text.length}/5000`}
                </p>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving || !hasContent}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--pt-accent)] px-7 text-[13px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : item.status === "submitted" ? (
                    <Check size={14} />
                  ) : (
                    <Send size={14} />
                  )}
                  {item.status === "submitted" ? "Re-submit" : "Submit"}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Sticky info card */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start" aria-label="Assignment summary">
          <div className="pt-rise pt-d3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
              At a glance
            </p>
            <dl className="mt-3.5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-[var(--pt-body)]">Status</dt>
                <dd>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${CHIP[item.status]}`}
                  >
                    {LABEL[item.status]}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-[var(--pt-body)]">Subject</dt>
                <dd className="text-[12.5px] font-medium text-[var(--pt-heading)]">
                  {item.subject}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-[var(--pt-body)]">Class</dt>
                <dd className="text-[12.5px] font-medium text-[var(--pt-heading)]">
                  {item.className}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-[var(--pt-body)]">Due</dt>
                <dd className="text-[12.5px] font-medium text-[var(--pt-heading)]">
                  {item.dueLabel}
                </dd>
              </div>
              {item.status !== "pending" ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[12px] text-[var(--pt-body)]">Submitted</dt>
                  <dd className="text-[12.5px] font-medium text-[var(--pt-heading)]">
                    {item.submittedLabel}
                  </dd>
                </div>
              ) : null}
              {item.teacherFiles.length > 0 || item.linkUrl ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[12px] text-[var(--pt-body)]">Teacher gave</dt>
                  <dd className="text-[12.5px] font-medium text-[var(--pt-heading)]">
                    <FileCountBadge
                      count={item.teacherFiles.length}
                      hasLink={Boolean(item.linkUrl)}
                    />
                  </dd>
                </div>
              ) : null}
              {item.score != null ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[12px] text-[var(--pt-body)]">Score</dt>
                  <dd className="font-display text-[16px] font-semibold text-[var(--pt-accent-text)]">
                    {(item.isGroup ? item.finalScore : item.score) ?? item.score}/{item.maxScore} · {" "}
                    {gradeForScore((item.isGroup ? item.finalScore : item.score) ?? 0, item.maxScore)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          {!locked ? (
            <div className="pt-rise pt-d4 rounded-2xl border border-dashed border-[var(--pt-border-strong)] bg-[var(--pt-panel-soft)] p-5">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                <Info size={13} /> Good to know
              </p>
              <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
                <li>· Text, files or a link — any one of them counts as an answer.</li>
                <li>· You can re-submit as many times as you need until it&apos;s graded.</li>
                <li>· Re-submitting replaces your previous files and answer.</li>
              </ul>
            </div>
          ) : null}
        </aside>
      </div>

      {/* v2.8.50.0 — Phase 2.1: the private "Ask the teacher" thread */}
      <div className="mt-5">
        <HomeworkQuestions assignmentId={item.id} initialMessages={questions} />
      </div>
    </div>
  );
}
