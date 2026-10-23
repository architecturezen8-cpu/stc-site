"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ClipboardList,
  Clock,
  Loader2,
  Lock,
  MessageCircleQuestion,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { studentAvatarFor } from "@/lib/student-avatar";
import { portalRoleHeaders } from "@/lib/portal-client";
import {
  gradeChipClass,
  gradeForScore,
  GRADE_LEGEND,
} from "@/lib/grades-shared";
import {
  AttachmentUploader,
  FileChipList,
  FileCountBadge,
  LinkField,
  LinkRow,
  type AssignmentFileRef,
} from "@/components/portal/assignment-file-ui";
import {
  ChatMessageList,
  type ChatMessageView,
} from "@/components/portal/chat-message-ui";
import { ChatComposer } from "@/components/portal/chat-composer";

/* ── types shared with the server page ─────────────────────────────────── */

export type TeacherClassSubjectOption = {
  csId: number;
  classId: number;
  className: string;
  subjectName: string;
  students: number;
};

export type TeacherAssignmentItem = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  instructions: string;
  dueLabel: string;
  postedLabel: string;
  submittedCount: number;
  gradedCount: number;
  students: number;
  fileCount: number;
  hasLink: boolean;
  unansweredQuestions: number;
};

export type AssignmentSubmissionRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  status: "pending" | "submitted" | "graded";
  isLate: boolean;
  contentText: string;
  submittedLabel: string;
  score: number | null;
  feedback: string;
  files: AssignmentFileRef[];
  linkUrl: string;
};

/* v2.8.50.0 — Phase 2.1: the private "Ask the teacher" threads (shapes
   mirror the server's portal-questions types). */
export type AssignmentQuestionMessage = ChatMessageView;

export type AssignmentTeacherThread = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  needsReply: boolean;
  messages: AssignmentQuestionMessage[];
};

/* v2.8.57.0 — Phase 4.1: group shapes (mirror the server's types). */
export type AssignmentGroupMemberRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  adjustment: number | null;
  finalScore: number | null;
};

export type AssignmentGroupSubmissionView = {
  status: "submitted" | "graded";
  contentText: string;
  submittedLabel: string;
  isLate: boolean;
  score: number | null;
  feedback: string;
  submittedByName: string;
  files: AssignmentFileRef[];
  linkUrl: string;
};

export type AssignmentGroupRow = {
  groupId: number;
  name: string;
  members: AssignmentGroupMemberRow[];
  submission: AssignmentGroupSubmissionView | null;
};

export type AssignmentGroupManagerRow = {
  groupId: number;
  name: string;
  memberIds: number[];
  hasSubmission: boolean;
};

export type AssignmentGroupManagerView = {
  maxScore: number;
  locked: boolean;
  groups: AssignmentGroupManagerRow[];
  ungrouped: { studentId: number; admissionNo: string; fullName: string }[];
};

export type TeacherAssignmentDetail = {
  id: number;
  classSubjectId: number;
  title: string;
  instructions: string;
  className: string;
  subjectName: string;
  dueLabel: string;
  /* v2.8.49.0 — raw instant + the server-local datetime-local value for
     the edit form (saves back to the exact same moment). */
  dueAt: string | null;
  dueAtInput: string;
  /* v2.8.56.0 — Phase 3.2: the mark ceiling for grade letters. */
  maxScore: number;
  files: AssignmentFileRef[];
  linkUrl: string;
  submissions: AssignmentSubmissionRow[];
  threads: AssignmentTeacherThread[];
  /* v2.8.57.0 — Phase 4.1: group rows when this is group work. */
  groups: AssignmentGroupRow[] | null;
};

/* ── small pieces ──────────────────────────────────────────────────────── */

const STATUS_CHIP: Record<AssignmentSubmissionRow["status"], string> = {
  pending: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  submitted: "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]",
  graded: "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
};

const STATUS_LABEL: Record<AssignmentSubmissionRow["status"], string> = {
  pending: "Not submitted",
  submitted: "Submitted",
  graded: "Graded",
};

function Flash({ flash }: { flash: { ok: boolean; text: string } | null }) {
  if (!flash) return null;
  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-2.5 text-[12px] ${
        flash.ok
          ? "border-transparent bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
          : "border-transparent bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
      }`}
    >
      {flash.text}
    </div>
  );
}

/* ── the register drawer for ONE assignment ────────────────────────────── */

/* v2.8.57.0 — PHASE 4.1: the GROUP register + manager (Option B). One
   grade row per TEAM (any member submitted, the whole group reads it) with
   optional per-student adjustment deltas, plus the structure manager that
   locks the moment a team submits. */
function GroupRegister({
  detail,
  setFlash,
  onGraded,
  onSaved,
}: {
  detail: TeacherAssignmentDetail;
  setFlash: (f: { ok: boolean; text: string } | null) => void;
  onGraded: (assignmentId: number) => void;
  onSaved: () => void;
}) {
  const groups = detail.groups ?? [];
  const [manager, setManager] = useState<AssignmentGroupManagerView | null>(null);
  const [managerLoading, setManagerLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, { score: string; feedback: string; adjustments: Record<number, string> }>>(() => {
    const seed: Record<number, { score: string; feedback: string; adjustments: Record<number, string> }> = {};
    for (const g of groups) {
      const adjustments: Record<number, string> = {};
      for (const m of g.members) {
        adjustments[m.studentId] = m.adjustment != null ? String(m.adjustment) : "";
      }
      seed[g.groupId] = {
        score: g.submission?.score != null ? String(g.submission.score) : "",
        feedback: g.submission?.feedback ?? "",
        adjustments,
      };
    }
    return seed;
  });
  const [openText, setOpenText] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  /* v2.8.58.0 — the member picker is now a CHECKBOX multi-pick: tick every
     ungrouped student who belongs in this team and add them in ONE request
     ("ekkenek witharak nay, okkoma ekawara"). Single ticks still work —
     it is the same list. */
  const [pickOpen, setPickOpen] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const loadManager = useCallback(async (): Promise<AssignmentGroupManagerView | null> => {
    try {
      const res = await fetch(`/api/portal/assignments/${detail.id}/groups`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        manager?: AssignmentGroupManagerView;
      };
      if (res.ok && json.ok && json.manager) return json.manager;
    } catch {
      /* the manager is a tool panel — a silent miss is fine */
    }
    return null;
  }, [detail.id]);

  /* mount load through the fetch-continuation pattern (the React
     compiler lint: no setState reachable synchronously from the effect) */
  useEffect(() => {
    let alive = true;
    loadManager().then((m) => {
      if (!alive) return;
      if (m) setManager(m);
      setManagerLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [loadManager]);

  async function saveGroupGrade(groupId: number) {
    if (busyId != null) return;
    const draft = drafts[groupId] ?? { score: "", feedback: "", adjustments: {} };
    const group = groups.find((g) => g.groupId === groupId);
    if (!group) return;
    setBusyId(groupId);
    setFlash(null);
    try {
      const adjustments = group.members.map((m) => ({
        studentId: m.studentId,
        adjustment: (draft.adjustments[m.studentId] ?? "").trim(),
      }));
      const res = await fetch(`/api/portal/assignments/${detail.id}/grade-group`, {
        method: "POST",
        headers: { "content-type": "application/json", ...portalRoleHeaders("teacher") },
        body: JSON.stringify({
          groupId,
          score: draft.score.trim() === "" ? null : Number(draft.score),
          feedback: draft.feedback,
          adjustments,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not save the grade.");
      setFlash({ ok: true, text: `Grades saved for ${group.name}.` });
      onGraded(detail.id);
      onSaved();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the grade.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function groupAction(payload: {
    action: string;
    groupId?: number;
    name?: string;
    studentId?: number;
    studentIds?: number[];
  }) {
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/assignments/${detail.id}/groups`, {
        method: "POST",
        headers: { "content-type": "application/json", ...portalRoleHeaders("teacher") },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not save the change.");
      const fresh = await loadManager();
      if (fresh) setManager(fresh);
      onSaved();
      return true;
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the change.",
      });
      return false;
    }
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-6 text-center text-[12.5px] text-[var(--pt-body)]">
        This work is group work, but no teams are set up yet — the group
        manager below creates them.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {groups.map((g) => {
        const draft = drafts[g.groupId] ?? { score: "", feedback: "", adjustments: {} };
        const parsed = Number(draft.score);
        const liveGrade =
          draft.score.trim() !== "" &&
          Number.isFinite(parsed) &&
          parsed >= 0 &&
          parsed <= detail.maxScore
            ? gradeForScore(parsed, detail.maxScore)
            : null;
        const graded = g.submission?.status === "graded";
        return (
          <div
            key={g.groupId}
            className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3"
          >
            {/* v2.8.57.0 — flex-wrap: the name/subtitle truncate can dictate
                a wide min-content, so the chips wrap below on narrow screens
                instead of pushing the panel past the viewport. */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
                <Users size={14} />
              </span>
              <div className="min-w-0 flex-1">
                {renaming === g.groupId ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      maxLength={80}
                      aria-label={`New name for ${g.name}`}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-2.5 text-[12px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (await groupAction({ action: "rename", groupId: g.groupId, name: renameDraft })) {
                          setRenaming(null);
                          onSaved();
                        }
                      }}
                      className="h-8 rounded-lg bg-[var(--pt-accent)] px-2.5 text-[11px] font-semibold text-[var(--pt-on-accent)]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="h-8 rounded-lg border border-[var(--pt-border)] px-2.5 text-[11px] font-semibold text-[var(--pt-body)]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                      {g.name}
                      <span className="ml-1.5 text-[10.5px] font-medium text-[var(--pt-body)]">
                        {g.members.length} member{g.members.length === 1 ? "" : "s"}
                      </span>
                    </p>
                    <p className="truncate text-[10.5px] text-[var(--pt-body)]">
                      {g.submission
                        ? `submitted by ${g.submission.submittedByName}${g.submission.submittedLabel ? ` · ${g.submission.submittedLabel}` : ""}`
                        : "not submitted yet"}
                    </p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {g.submission?.isLate ? (
                  <span className="rounded-full bg-[var(--pt-warn-bg)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--pt-warn-text)]">
                    Late
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    graded
                      ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                      : g.submission
                        ? "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]"
                        : "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
                  }`}
                >
                  {graded && g.submission && g.submission.score != null
                    ? `Graded · ${gradeForScore(g.submission.score, detail.maxScore)}`
                    : g.submission
                      ? "Submitted"
                      : "Not submitted"}
                </span>
                {!manager?.locked && managerLoading === false ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Rename ${g.name}`}
                      onClick={() => {
                        setRenaming(g.groupId);
                        setRenameDraft(g.name);
                      }}
                      className="grid h-6 w-6 place-items-center rounded-md border border-[var(--pt-border)] text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${g.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${g.name}? Its members become ungrouped.`)) {
                          void groupAction({ action: "delete", groupId: g.groupId });
                        }
                      }}
                      className="grid h-6 w-6 place-items-center rounded-md border border-[var(--pt-border)] text-[var(--pt-body)] hover:text-[var(--pt-danger-text)]"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                ) : null}
              </div>
            </div>

            {/* members + final marks */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {g.members.map((m) => (
                <span
                  key={m.studentId}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--pt-chip-text)]"
                >
                  {m.fullName}
                  {graded && m.finalScore != null ? (
                    <span className="font-bold text-[var(--pt-heading)]">
                      → {m.finalScore} {gradeForScore(m.finalScore, detail.maxScore)}
                      {m.adjustment != null && m.adjustment !== 0 ? ` (${m.adjustment > 0 ? "+" : ""}${m.adjustment})` : ""}
                    </span>
                  ) : null}
                  {!manager?.locked && managerLoading === false ? (
                    <button
                      type="button"
                      aria-label={`Remove ${m.fullName} from ${g.name}`}
                      onClick={() => void groupAction({ action: "removeMember", groupId: g.groupId, studentId: m.studentId })}
                      className="text-[var(--pt-muted)] hover:text-[var(--pt-danger-text)]"
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
              {g.members.length === 0 ? (
                <span className="text-[10.5px] text-[var(--pt-muted)]">No members yet.</span>
              ) : null}
            </div>

            {/* the team's answer */}
            {g.submission ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setOpenText((cur) => (cur === g.groupId ? null : g.groupId))}
                  className="text-[11px] font-semibold text-[var(--pt-accent-text)] hover:underline"
                >
                  {openText === g.groupId
                    ? "Hide the answer"
                    : g.submission.files.length > 0
                      ? "Read the answer + files"
                      : "Read the answer"}
                </button>
                {openText === g.groupId ? (
                  <div className="mt-1.5 space-y-2">
                    <p className="whitespace-pre-wrap rounded-lg bg-[var(--pt-panel)] px-3 py-2 text-[12px] leading-relaxed text-[var(--pt-heading)]">
                      {g.submission.contentText || "—"}
                    </p>
                    {g.submission.files.length > 0 || g.submission.linkUrl ? (
                      <div className="space-y-1.5">
                        <FileChipList files={g.submission.files} />
                        {g.submission.linkUrl ? <LinkRow url={g.submission.linkUrl} /> : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* grade row */}
            <div className="mt-2.5 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={detail.maxScore}
                  inputMode="numeric"
                  value={draft.score}
                  disabled={!g.submission}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [g.groupId]: {
                        ...draft,
                        score: e.target.value,
                      },
                    }))
                  }
                  placeholder="Group score"
                  aria-label={`Group score for ${g.name} (out of ${detail.maxScore})`}
                  className="h-9 w-[96px] rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-2.5 text-[12px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)] disabled:opacity-60"
                />
                {liveGrade ? (
                  <span
                    aria-label={`Grade ${liveGrade}`}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gradeChipClass(liveGrade)}`}
                  >
                    {liveGrade}
                  </span>
                ) : null}
                <span className="hidden text-[10.5px] text-[var(--pt-muted)] sm:block">
                  /{detail.maxScore}
                </span>
              </div>
              <input
                value={draft.feedback}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [g.groupId]: { ...draft, feedback: e.target.value },
                  }))
                }
                placeholder="Feedback for the team (optional)"
                aria-label={`Feedback for ${g.name}`}
                className="h-9 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-2.5 text-[12px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
              />
              <button
                type="button"
                disabled={busyId === g.groupId || !g.submission}
                onClick={() => void saveGroupGrade(g.groupId)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 text-[11.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busyId === g.groupId ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                {graded ? "Update" : "Save"}
              </button>
            </div>

            {/* per-member adjustments — meaningful once the group is graded */}
            {graded ? (
              <div className="mt-2 rounded-lg bg-[var(--pt-panel)] p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
                  Per-student adjustments (± on top of {g.submission?.score})
                </p>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                  {g.members.map((m) => (
                    <label key={m.studentId} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--pt-body)]">
                        {m.fullName}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={(drafts[g.groupId]?.adjustments[m.studentId] ?? "").trim()}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [g.groupId]: {
                              ...(d[g.groupId] ?? { score: "", feedback: "", adjustments: {} }),
                              adjustments: {
                                ...(d[g.groupId]?.adjustments ?? {}),
                                [m.studentId]: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="±"
                        aria-label={`Adjustment for ${m.fullName}`}
                        className="h-8 w-16 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-2 text-center text-[11.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {/* v2.8.58.0 — add members: tick EVERY student who belongs in
                this team, then one "Add N" lands the whole batch (the old
                one-at-a-time select is gone). Only while the structure is
                open and someone is still ungrouped. */}
            {!manager?.locked && managerLoading === false && (manager?.ungrouped.length ?? 0) > 0 ? (
              <div className="mt-2">
                {pickOpen === g.groupId ? (
                  <div className="rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-[var(--pt-heading)]">
                        {manager?.ungrouped.length} student
                        {manager?.ungrouped.length === 1 ? "" : "s"} not in a group yet
                      </p>
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const all = manager?.ungrouped.every((u) => picked[u.studentId]) ?? false;
                            setPicked((p) => {
                              const next = { ...p };
                              for (const u of manager?.ungrouped ?? []) {
                                next[u.studentId] = !all;
                              }
                              return next;
                            });
                          }}
                          className="rounded-md border border-[var(--pt-border)] px-2 py-1 text-[10.5px] font-semibold text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPickOpen(null);
                            setPicked({});
                          }}
                          aria-label="Close the member picker"
                          className="grid h-6 w-6 place-items-center rounded-md border border-[var(--pt-border)] text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
                        >
                          ×
                        </button>
                      </span>
                    </div>
                    <div className="pt-scrollbar mt-2 max-h-[168px] space-y-0.5 overflow-y-auto pr-0.5">
                      {manager?.ungrouped.map((u) => (
                        <label
                          key={u.studentId}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-[var(--pt-panel-soft)]"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(picked[u.studentId])}
                            onChange={(e) =>
                              setPicked((p) => ({ ...p, [u.studentId]: e.target.checked }))
                            }
                            className="h-4 w-4 shrink-0 accent-[var(--pt-accent)]"
                            aria-label={`Add ${u.fullName} to ${g.name}`}
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={studentAvatarFor(u.admissionNo)}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--pt-heading)]">
                            {u.fullName}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-[var(--pt-muted)]">
                            {u.admissionNo}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={
                          busyId === g.groupId ||
                          !Object.values(picked).some(Boolean)
                        }
                        onClick={async () => {
                          const ids = Object.entries(picked)
                            .filter(([, on]) => on)
                            .map(([sid]) => Number(sid));
                          if (ids.length === 0) return;
                          if (
                            await groupAction({
                              action: "addMember",
                              groupId: g.groupId,
                              studentIds: ids,
                            })
                          ) {
                            setFlash({
                              ok: true,
                              text: `${ids.length} student${ids.length === 1 ? "" : "s"} added to ${g.name}.`,
                            });
                            setPickOpen(null);
                            setPicked({});
                            onSaved();
                          }
                        }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 text-[11px] font-semibold text-[var(--pt-on-accent)] disabled:opacity-50"
                      >
                        {busyId === g.groupId ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <UserPlus size={11} />
                        )}
                        {(() => {
                          const n = Object.values(picked).filter(Boolean).length;
                          return n > 0 ? `Add ${n} student${n === 1 ? "" : "s"}` : "Add selected";
                        })()}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPicked({});
                      setPickOpen(g.groupId);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-[var(--pt-border-strong)] px-3 text-[11px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
                  >
                    <UserPlus size={11} /> Add members
                  </button>
                )}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* the structure manager */}
      <div className="rounded-xl border border-dashed border-[var(--pt-border-strong)] p-3">
        {managerLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-[var(--pt-body)]">
            <Loader2 size={12} className="animate-spin" /> Loading the group manager…
          </p>
        ) : manager?.locked ? (
          <p className="text-[11.5px] text-[var(--pt-body)]">
            <Lock size={11} className="mr-1 inline" /> Groups are locked — a team
            has already submitted. Grades and adjustments stay editable.
          </p>
        ) : manager ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={80}
                placeholder={`New group name (e.g. Group ${manager.groups.length + 1})`}
                aria-label="New group name"
                className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[12px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
              />
              <button
                type="button"
                disabled={newGroupName.trim().length === 0}
                onClick={async () => {
                  if (await groupAction({ action: "create", name: newGroupName })) {
                    setNewGroupName("");
                    onSaved();
                  }
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3.5 text-[11.5px] font-semibold text-[var(--pt-on-accent)] disabled:opacity-50"
              >
                <Plus size={12} /> Add group
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] text-[var(--pt-muted)]">
              {manager.ungrouped.length} student{manager.ungrouped.length === 1 ? "" : "s"} not in a group yet
              {manager.groups.length > 0 ? ` · ${manager.groups.length} group${manager.groups.length === 1 ? "" : "s"}` : ""}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function seedDrafts(detail: TeacherAssignmentDetail) {
  const seed: Record<number, { score: string; feedback: string }> = {};
  for (const s of detail.submissions) {
    seed[s.studentId] = {
      score: s.score != null ? String(s.score) : "",
      feedback: s.feedback ?? "",
    };
  }
  return seed;
}

function SubmissionPanel({
  detail,
  options,
  onGraded,
  onSaved,
}: {
  detail: TeacherAssignmentDetail;
  options: TeacherClassSubjectOption[];
  onGraded: (assignmentId: number) => void;
  onSaved: () => void;
}) {
  const [query, setQuery] = useState("");
  /* The parent mounts this panel with key={detail.id}, so a new assignment
     remounts it — the drafts seed straight from the fresh detail with NO
     cascading effect. */
  const [drafts, setDrafts] = useState<
    Record<number, { score: string; feedback: string }>
  >(() => seedDrafts(detail));
  const [savingId, setSavingId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [openText, setOpenText] = useState<number | null>(null);

  /* v2.8.50.0 — Phase 2.1: the private Q&A threads. One thread open at a
     time; the reply lands through the same POST endpoint the student uses. */
  const [openQa, setOpenQa] = useState<number | null>(null);
  /* v2.8.57.0 — Phase 4.1: the door into group mode (the FIRST team flips
     this register to the group pen once the detail reloads). */
  const [groupSetupName, setGroupSetupName] = useState("");
  const [groupSetupBusy, setGroupSetupBusy] = useState(false);

  /* v2.8.49.0 — Phase 1.2: the edit form (seeded once per mount from the
     detail that is already in hand — no extra fetch needed). */
  const hasSubmissions = useMemo(
    () => detail.submissions.some((s) => s.status !== "pending"),
    [detail.submissions],
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editCsId, setEditCsId] = useState<number>(detail.classSubjectId);
  const [editTitle, setEditTitle] = useState(detail.title);
  const [editInstructions, setEditInstructions] = useState(detail.instructions);
  const [editDue, setEditDue] = useState(detail.dueAtInput);
  const [editFiles, setEditFiles] = useState<AssignmentFileRef[]>(detail.files);
  const [editLinkUrl, setEditLinkUrl] = useState(detail.linkUrl);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3600);
    return () => clearTimeout(t);
  }, [flash]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return detail.submissions;
    return detail.submissions.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNo.toLowerCase().includes(q),
    );
  }, [detail.submissions, query]);

  /* v2.8.50.0 — Phase 2.1: threads still waiting for this teacher's reply.
     (The panel's own header chips moved to the modal header in v2.8.58.0.) */
  const threadsByStudent = useMemo(
    () => new Map(detail.threads.map((t) => [t.studentId, t])),
    [detail.threads],
  );

  /* v2.8.51.0 — live thread state: opening a conversation re-fetches it
     through ?studentId= (which MARKS THE STUDENT'S MESSAGES READ) and the
     fresh messages override the register snapshot until the next reload. */
  const [qaLive, setQaLive] = useState<Record<number, AssignmentQuestionMessage[]>>({});
  const [qaLoadingId, setQaLoadingId] = useState<number | null>(null);
  const [deletingQaId, setDeletingQaId] = useState<number | null>(null);

  async function openQaThread(studentId: number) {
    setQaLoadingId(studentId);
    try {
      const res = await fetch(
        `/api/portal/assignments/${detail.id}/questions?studentId=${studentId}`,
        { cache: "no-store", headers: portalRoleHeaders("teacher") },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        thread?: { messages?: AssignmentQuestionMessage[] };
      };
      if (res.ok && json.ok && json.thread) {
        setQaLive((cur) => ({ ...cur, [studentId]: json.thread!.messages ?? [] }));
      }
    } catch {
      /* the register snapshot still shows */
    } finally {
      setQaLoadingId(null);
    }
  }

  async function deleteQaMessage(studentId: number, message: AssignmentQuestionMessage) {
    if (deletingQaId) return;
    setDeletingQaId(message.id);
    try {
      const res = await fetch(
        `/api/portal/assignments/${detail.id}/questions/${message.id}`,
        { method: "DELETE", headers: portalRoleHeaders("teacher") },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not delete the message.");
      }
      /* refresh the live copy — the deleted stub replaces the body in place */
      await openQaThread(studentId);
      setFlash({ ok: true, text: "Message deleted." });
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not delete the message.",
      });
    } finally {
      setDeletingQaId(null);
    }
  }

  /* v2.8.53.0 — the reply composer is the shared ChatComposer (ONE file may
     ride along with the reply — worksheet, marking scheme…), so the manual
     JSON sendReply is gone; the composer posts multipart and calls back. */

  async function saveGrade(row: AssignmentSubmissionRow) {
    if (savingId != null) return;
    const draft = drafts[row.studentId];
    if (!draft) return;
    setSavingId(row.studentId);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/assignments/${detail.id}/grade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: row.studentId,
          score: draft.score.trim() === "" ? null : draft.score.trim(),
          feedback: draft.feedback,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the grade.");
      }
      setFlash({ ok: true, text: `Graded ${row.fullName}.` });
      onGraded(detail.id);
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the grade.",
      });
    } finally {
      setSavingId(null);
    }
  }

  /* v2.8.49.0 — Phase 1.2: PATCH the edited fields, then let the parent
     refresh the list AND reload this register (key={detail.id} remounts
     the panel with the fresh values). */
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (savingEdit) return;
    setSavingEdit(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/assignments/${detail.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classSubjectId: editCsId,
          title: editTitle,
          instructions: editInstructions,
          dueAt: editDue.trim() === "" ? "" : editDue,
          linkUrl: editLinkUrl.trim(),
          files: editFiles,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the assignment.");
      }
      setFlash({ ok: true, text: "Assignment updated — the class sees the change now." });
      setEditOpen(false);
      onSaved();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the assignment.",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* v2.8.58.0 — the work's identity (class · subject · title · due ·
          counts) lives in the big modal's header now; the panel starts
          straight at the tools. */}
      {/* v2.8.49.0 — Phase 1.2: edit the posted work in place.
          v2.8.57.0 — flex-wrap so the locked note + button stack on narrow
          screens instead of forcing the panel past the viewport. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setEditOpen((cur) => !cur)}
          aria-expanded={editOpen}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--pt-border)] px-3 text-[11px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)]"
        >
          {editOpen ? <Lock size={11} /> : <Pencil size={11} />}
          {editOpen ? "Close the editor" : "Edit this work"}
        </button>
        {hasSubmissions ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--pt-muted)]">
            <Lock size={10} /> class locked — students already submitted
          </span>
        ) : null}
      </div>

      {editOpen ? (
        <form
          onSubmit={saveEdit}
          className="grid gap-3 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Class · Subject
                {hasSubmissions ? " — locked" : ""}
              </span>
              <select
                value={editCsId}
                disabled={hasSubmissions}
                onChange={(e) => setEditCsId(Number(e.target.value))}
                className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)] disabled:opacity-60"
              >
                {options.some((o) => o.csId === editCsId) ? null : (
                  <option value={editCsId}>
                    {detail.className} · {detail.subjectName}
                  </option>
                )}
                {options.map((o) => (
                  <option key={o.csId} value={o.csId}>
                    {o.className} · {o.subjectName} ({o.students})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Due
              </span>
              <input
                type="datetime-local"
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
              Title
            </span>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={160}
              className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
              Instructions
            </span>
            <textarea
              rows={3}
              value={editInstructions}
              onChange={(e) => setEditInstructions(e.target.value)}
              maxLength={2000}
              className="w-full resize-y rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 py-2.5 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
            />
          </label>
          <div className="rounded-xl border border-dashed border-[var(--pt-border-strong)] p-3">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
              Attachments (removing a file also removes the stored copy)
            </p>
            <AttachmentUploader files={editFiles} onChange={setEditFiles} disabled={savingEdit} />
            <div className="mt-2.5">
              <LinkField value={editLinkUrl} onChange={setEditLinkUrl} disabled={savingEdit} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="inline-flex h-10 items-center rounded-full border border-[var(--pt-border)] px-4 text-[12.5px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit || editTitle.trim().length < 3}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingEdit ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              Save changes
            </button>
          </div>
        </form>
      ) : null}

      {detail.instructions ? (
        <p className="rounded-xl bg-[var(--pt-panel-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--pt-body)]">
          {detail.instructions}
        </p>
      ) : null}

      {/* v2.8.56.0 — Phase 3.2: the scale + the letter bands, right where
          the marks are typed. */}
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
        Marks out of {detail.maxScore} · Grades: {GRADE_LEGEND}
      </p>

      {/* v2.8.43.0 — the attachments this work was posted with */}
      {detail.files.length > 0 || detail.linkUrl ? (
        <div className="space-y-1.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
            Attached to this assignment
          </p>
          <FileChipList files={detail.files} />
          {detail.linkUrl ? <LinkRow url={detail.linkUrl} /> : null}
        </div>
      ) : null}

      {/* v2.8.57.0 — Phase 4.1: GROUP work renders the team register; the
          classic per-student list stays for individual works. */}
      {detail.groups ? (
        <>
          <Flash flash={flash} />

          <GroupRegister
            detail={detail}
            setFlash={setFlash}
            onGraded={onGraded}
            onSaved={onSaved}
          />

          {/* the private Q&A threads stay per student even on group work —
              a compact list keeps every conversation reachable. */}
          <div className="space-y-1.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
              Ask-the-teacher threads
            </p>
            {detail.threads.length === 0 ? (
              <p className="text-[11.5px] text-[var(--pt-body)]">No questions yet.</p>
            ) : (
              detail.threads.map((t) => (
                <div
                  key={t.studentId}
                  className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-2.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const next = openQa === t.studentId ? null : t.studentId;
                      setOpenQa(next);
                      if (next != null) void openQaThread(t.studentId);
                    }}
                    aria-expanded={openQa === t.studentId}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--pt-accent-text)] hover:underline"
                  >
                    <MessageCircleQuestion size={12} />
                    {t.fullName} · {t.messages.length} message{t.messages.length === 1 ? "" : "s"}
                    {t.needsReply ? (
                      <span className="rounded-full bg-[var(--pt-warn-bg)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--pt-warn-text)]">
                        needs reply
                      </span>
                    ) : null}
                  </button>
                  {openQa === t.studentId ? (
                    <div className="mt-2 space-y-2.5">
                      <ChatMessageList
                        messages={qaLive[t.studentId] ?? t.messages}
                        viewerRole="teacher"
                        onDelete={(m) => void deleteQaMessage(t.studentId, m)}
                        deletingId={deletingQaId}
                      />
                      <ChatComposer
                        key={t.studentId}
                        role="teacher"
                        assignmentId={detail.id}
                        studentId={t.studentId}
                        compact
                        placeholder={`Reply to ${t.fullName} — only they see it…`}
                        ariaLabel={`Reply to ${t.fullName}`}
                        onSent={async () => {
                          await openQaThread(t.studentId);
                          setFlash({
                            ok: true,
                            text: "Reply sent — the student sees it on their page.",
                          });
                          onSaved();
                        }}
                        onError={(message) => setFlash({ ok: false, text: message })}
                      />
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <>
          {/* v2.8.57.0 — Phase 4.1: the door into group mode. */}
          <div className="rounded-xl border border-dashed border-[var(--pt-border-strong)] p-3">
            <p className="text-[11.5px] text-[var(--pt-body)]">
              <Users size={11} className="mr-1 inline" />
              Group work? Create the first team and this register switches to
              the group pen — one grade for the team, optional per-student
              adjustments, every member reads the same answer.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={groupSetupName}
                onChange={(e) => setGroupSetupName(e.target.value)}
                maxLength={80}
                placeholder="Group 1"
                aria-label="First group name"
                className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[12px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] sm:max-w-[240px]"
              />
              <button
                type="button"
                disabled={groupSetupBusy || groupSetupName.trim().length === 0}
                onClick={async () => {
                  if (groupSetupBusy || groupSetupName.trim().length === 0) return;
                  setGroupSetupBusy(true);
                  setFlash(null);
                  try {
                    const res = await fetch(`/api/portal/assignments/${detail.id}/groups`, {
                      method: "POST",
                      headers: { "content-type": "application/json", ...portalRoleHeaders("teacher") },
                      body: JSON.stringify({ action: "create", name: groupSetupName }),
                    });
                    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                    if (!res.ok || !json.ok) throw new Error(json.error || "Could not create the group.");
                    setGroupSetupName("");
                    onSaved();
                  } catch (cause) {
                    setFlash({
                      ok: false,
                      text: cause instanceof Error ? cause.message : "Could not create the group.",
                    });
                  } finally {
                    setGroupSetupBusy(false);
                  }
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3.5 text-[11.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {groupSetupBusy ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                Set up groups
              </button>
            </div>
          </div>

          <label className="flex h-10 items-center gap-2.5 rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-3.5">
            <Search size={13} className="shrink-0 text-[var(--pt-body)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a student by name or admission no…"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)]"
            />
          </label>

          <Flash flash={flash} />

          <div className="pt-scrollbar max-h-[430px] space-y-2 overflow-y-auto pr-0.5">
        {visible.map((row) => {
          const draft = drafts[row.studentId] ?? { score: "", feedback: "" };
          /* v2.8.50.0 — Phase 2.1: this student's private Q&A thread. */
          const threadFor = threadsByStudent.get(row.studentId);
          return (
            <div
              key={row.studentId}
              className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3"
            >
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={studentAvatarFor(row.admissionNo)}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                    {row.fullName}
                  </p>
                  <p className="truncate text-[10.5px] text-[var(--pt-body)]">
                    {row.admissionNo}
                    {row.status !== "pending" && row.submittedLabel
                      ? ` · ${row.submittedLabel}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {row.isLate && row.status !== "pending" ? (
                    <span className="rounded-full bg-[var(--pt-warn-bg)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--pt-warn-text)]">
                      Late
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_CHIP[row.status]}`}
                  >
                    {STATUS_LABEL[row.status]}
                    {row.status === "graded" && row.score != null
                      ? ` · ${gradeForScore(row.score, detail.maxScore)}`
                      : ""}
                  </span>
                </div>
              </div>

              {row.status !== "pending" ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenText((cur) => (cur === row.studentId ? null : row.studentId))
                    }
                    className="text-[11px] font-semibold text-[var(--pt-accent-text)] hover:underline"
                  >
                    {openText === row.studentId
                      ? "Hide the answer"
                      : row.files.length > 0
                        ? "Read the answer + files"
                        : "Read the answer"}
                  </button>
                  {openText === row.studentId ? (
                    <div className="mt-1.5 space-y-2">
                      <p className="whitespace-pre-wrap rounded-lg bg-[var(--pt-panel-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--pt-heading)]">
                        {row.contentText || "—"}
                      </p>
                      {row.files.length > 0 || row.linkUrl ? (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
                            Attached files
                          </p>
                          <FileChipList files={row.files} />
                          {row.linkUrl ? <LinkRow url={row.linkUrl} /> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* v2.8.50.0 — Phase 2.1: this student's private Q&A thread.
                  v2.8.51.0 — expanding it re-fetches through ?studentId= so
                  the student's messages get marked READ and the fresh copy
                  (delete stubs, ✓✓ ticks) renders via the shared bubbles. */}
              {threadFor ? (() => {
                const live = qaLive[row.studentId] ?? threadFor.messages;
                const alive = live.filter((m) => !m.deleted);
                const liveNeedsReply =
                  alive.length > 0
                    ? alive[alive.length - 1].authorRole === "student"
                    : false;
                return (
                <div className="mt-2.5 border-t border-dashed border-[var(--pt-border-strong)] pt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = openQa === row.studentId ? null : row.studentId;
                      setOpenQa(next);
                      if (next != null) void openQaThread(row.studentId);
                    }}
                    aria-expanded={openQa === row.studentId}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--pt-accent-text)] hover:underline"
                  >
                    <MessageCircleQuestion size={12} />
                    {openQa === row.studentId
                      ? "Hide the conversation"
                      : `Q&A · ${alive.length} message${alive.length === 1 ? "" : "s"}`}
                    {liveNeedsReply ? (
                      <span className="rounded-full bg-[var(--pt-warn-bg)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--pt-warn-text)]">
                        needs reply
                      </span>
                    ) : null}
                    {openQa === row.studentId && qaLoadingId === row.studentId ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : null}
                  </button>

                  {openQa === row.studentId ? (
                    <div className="mt-2 space-y-2.5">
                      <ChatMessageList
                        messages={live}
                        viewerRole="teacher"
                        onDelete={(m) => void deleteQaMessage(row.studentId, m)}
                        deletingId={deletingQaId}
                      />
                      <ChatComposer
                        key={row.studentId}
                        role="teacher"
                        assignmentId={detail.id}
                        studentId={row.studentId}
                        compact
                        placeholder={`Reply to ${row.fullName} — only they see it…`}
                        ariaLabel={`Reply to ${row.fullName}`}
                        onSent={async () => {
                          /* the fresh thread lands in the live copy (the
                             student's unread badge stays honest), then the
                             register reloads for the chips */
                          await openQaThread(row.studentId);
                          setFlash({
                            ok: true,
                            text: "Reply sent — the student sees it on their page.",
                          });
                          onSaved();
                        }}
                        onError={(message) => setFlash({ ok: false, text: message })}
                      />
                    </div>
                  ) : null}
                </div>
                );
              })() : null}

              <div className="mt-2.5 grid gap-2 sm:grid-cols-[auto_1fr_auto]">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={detail.maxScore}
                    inputMode="numeric"
                    value={draft.score}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [row.studentId]: { ...draft, score: e.target.value },
                      }))
                    }
                    placeholder="Score"
                    aria-label={`Score for ${row.fullName} (out of ${detail.maxScore})`}
                    className="h-9 w-[84px] rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-2.5 text-[12px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                  />
                  {(() => {
                    const parsed = Number(draft.score);
                    if (draft.score.trim() === "" || !Number.isFinite(parsed) || parsed < 0 || parsed > detail.maxScore) {
                      return null;
                    }
                    const letter = gradeForScore(parsed, detail.maxScore);
                    return (
                      <span
                        aria-label={`Grade ${letter}`}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gradeChipClass(letter)}`}
                      >
                        {letter}
                      </span>
                    );
                  })()}
                  <span className="hidden text-[10.5px] text-[var(--pt-muted)] sm:block">
                    /{detail.maxScore}
                  </span>
                </div>
                <input
                  value={draft.feedback}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [row.studentId]: { ...draft, feedback: e.target.value },
                    }))
                  }
                  placeholder="Feedback (optional)"
                  aria-label={`Feedback for ${row.fullName}`}
                  className="h-9 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-2.5 text-[12px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                />
                <button
                  type="button"
                  disabled={savingId === row.studentId || row.status === "pending"}
                  onClick={() => void saveGrade(row)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 text-[11.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {savingId === row.studentId ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  {row.status === "graded" ? "Update" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
        {visible.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[var(--pt-body)]">
            No student matches that search.
          </p>
        ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/* ── the page ──────────────────────────────────────────────────────────── */

export function TeacherAssignments({
  options,
  initialAssignments,
  focusAssignmentId,
}: {
  options: TeacherClassSubjectOption[];
  initialAssignments: TeacherAssignmentItem[];
  focusAssignmentId: number | null;
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [csId, setCsId] = useState<number | "">(options[0]?.csId ?? "");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  /* v2.8.43.0 — attachments for the assignment being composed */
  const [files, setFiles] = useState<AssignmentFileRef[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [detail, setDetail] = useState<TeacherAssignmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  /* v2.8.58.0 — the register opens in a BIG centred modal now (owner:
     "side eken podi wadi wage ne — loku popup ekak widiyata"). This is the
     assignment the modal is open for; null = closed. */
  const [registerFor, setRegisterFor] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const focusDone = useRef(false);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/portal/assignments/${id}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: TeacherAssignmentDetail;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.detail) {
        throw new Error(json.error === "not_found" ? "Assignment not found." : "Could not load the submissions.");
      }
      setDetail(json.detail);
    } catch (cause) {
      setDetail(null);
      setDetailError(cause instanceof Error ? cause.message : "Could not load the submissions.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openRegister = useCallback(
    (id: number) => {
      setRegisterFor(id);
      void loadDetail(id);
    },
    [loadDetail],
  );

  const closeRegister = useCallback(() => {
    setRegisterFor(null);
    setDetail(null);
    setDetailError(null);
  }, []);

  /* Modal behaviour: Escape closes, the page behind stops scrolling, the
     close button takes focus the moment the panel lands. */
  useEffect(() => {
    if (registerFor == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRegister();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, [registerFor, closeRegister]);

  /* Deep link from the dashboard marking queue: /teacher/assignments?focus=ID */
  useEffect(() => {
    if (focusDone.current || focusAssignmentId == null) return;
    focusDone.current = true;
    openRegister(focusAssignmentId);
  }, [focusAssignmentId, openRegister]);

  async function refreshList() {
    try {
      const res = await fetch("/api/portal/assignments", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        assignments?: TeacherAssignmentItem[];
      };
      if (res.ok && json.ok && Array.isArray(json.assignments)) {
        setAssignments(json.assignments);
      }
    } catch {
      /* the list is refreshable — a silent miss is fine */
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFlash(null);
    try {
      const res = await fetch("/api/portal/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classSubjectId: csId === "" ? undefined : csId,
          title,
          instructions,
          dueAt: dueAt || undefined,
          linkUrl: linkUrl.trim() || undefined,
          files: files.length > 0 ? files : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the assignment.");
      }
      setTitle("");
      setInstructions("");
      setDueAt("");
      setFiles([]);
      setLinkUrl("");
      setFlash({ ok: true, text: "Assignment posted — your class can see it now." });
      await refreshList();
      if (json.id) openRegister(json.id);
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the assignment.",
      });
    } finally {
      setCreating(false);
    }
  }

  /* v2.8.58.0 — the register modal's own header counts. */
  const headerCounts = detail
    ? {
        submitted: detail.submissions.filter((s) => s.status !== "pending").length,
        total: detail.submissions.length,
        graded: detail.submissions.filter((s) => s.status === "graded").length,
        toAnswer: detail.threads.filter((t) => t.needsReply).length,
      }
    : null;

  return (
    <div className="space-y-5">
      <Flash flash={flash} />

      {/* Composer */}
      <section className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <Plus size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              Post an assignment
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              It appears in the class&apos;s Homework list the moment you post it.
            </p>
          </div>
        </div>

        {options.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--pt-border)] px-4 py-3 text-[12.5px] text-[var(--pt-body)]">
            Your teaching subjects are not set up yet — ask the school office to
            assign you classes, then post work here.
          </p>
        ) : (
          <form onSubmit={create} className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                  Class · Subject
                </span>
                <select
                  value={csId}
                  onChange={(e) => setCsId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                >
                  {options.map((o) => (
                    <option key={o.csId} value={o.csId}>
                      {o.className} · {o.subjectName} ({o.students})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                  Due (optional)
                </span>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Title
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                placeholder="e.g. Chapter 5 — conservation of momentum worksheet"
                className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 text-[13px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Instructions (optional)
              </span>
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={2000}
                placeholder="What exactly should the students do?"
                className="w-full resize-y rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 py-2.5 text-[13px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
              />
            </label>

            {/* v2.8.43.0 — attach worksheets / videos / sheets to the work */}
            <div className="rounded-xl border border-dashed border-[var(--pt-border-strong)] p-3">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Attachments (optional)
              </p>
              <AttachmentUploader files={files} onChange={setFiles} disabled={creating} />
              <div className="mt-2.5">
                <LinkField value={linkUrl} onChange={setLinkUrl} disabled={creating} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating || csId === "" || title.trim().length < 3}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                Post to class
              </button>
            </div>
          </form>
        )}
      </section>

      {/* v2.8.58.0 — the list is FULL WIDTH now: tapping a card opens the
          big register modal instead of squeezing everything into a side
          column ("podi wadi wage ne"). */}
      <section className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <ClipboardList size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              My assignments
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              Tap one — the submissions register opens in a full window.
            </p>
          </div>
        </div>

        {assignments.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--pt-border)] px-4 py-8 text-center text-[12.5px] text-[var(--pt-body)]">
            Nothing posted yet — your first assignment shows up here.
          </p>
        ) : (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {assignments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => openRegister(a.id)}
                className="flex w-full flex-col rounded-xl border p-3.5 text-left transition-colors border-[var(--pt-border)] bg-[var(--pt-panel-soft)] hover:border-[var(--pt-accent)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                      {a.title}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] text-[var(--pt-body)]">
                      {a.className} · {a.subjectName}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      a.submittedCount === 0
                        ? "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
                        : "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
                    }`}
                  >
                    {a.submittedCount}/{a.students}
                  </span>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-[var(--pt-body)]">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={10} /> {a.dueLabel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={10} /> {a.gradedCount} graded
                  </span>
                  <FileCountBadge count={a.fileCount} hasLink={a.hasLink} />
                  {a.unansweredQuestions > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pt-warn-bg)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--pt-warn-text)]">
                      <MessageCircleQuestion size={10} /> {a.unansweredQuestions} to answer
                    </span>
                  ) : null}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* v2.8.58.0 — THE BIG REGISTER MODAL. A proper full window for the
          work: edit it, read every answer, set up groups, grade, reply —
          all in one comfortable surface. Escape / the backdrop / the X
          close it; the page behind stops scrolling while it is open. */}
      {registerFor != null ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="Submissions register"
        >
          <button
            type="button"
            aria-label="Close the register"
            onClick={closeRegister}
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
            tabIndex={-1}
          />
          <div className="pt-panel-shadow relative flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] sm:max-h-[92dvh] sm:max-w-4xl sm:rounded-3xl">
            {/* header */}
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--pt-border)] bg-[var(--pt-panel)] px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                {detail ? (
                  <>
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-accent-text)]">
                      {detail.className} · {detail.subjectName}
                    </p>
                    <h2 className="mt-0.5 truncate font-display text-[16px] font-semibold text-[var(--pt-heading)] sm:text-[17px]">
                      {detail.title}
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--pt-body)]">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={11} /> Due {detail.dueLabel}
                      </span>
                      <span className="rounded-full bg-[var(--pt-chip)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pt-chip-text)]">
                        {headerCounts?.submitted}/{headerCounts?.total} in
                      </span>
                      <span className="rounded-full bg-[var(--pt-good-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pt-good-text)]">
                        {headerCounts?.graded} graded
                      </span>
                      {headerCounts && headerCounts.toAnswer > 0 ? (
                        <span className="rounded-full bg-[var(--pt-warn-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pt-warn-text)]">
                          {headerCounts.toAnswer} to answer
                        </span>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
                    Submissions register
                  </h2>
                )}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeRegister}
                aria-label="Close the register"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
              >
                <X size={15} />
              </button>
            </div>

            {/* body */}
            <div className="pt-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
              {detailLoading ? (
                <div className="flex h-40 items-center justify-center gap-2 text-[12.5px] text-[var(--pt-body)]">
                  <Loader2 size={15} className="animate-spin" /> Loading the register…
                </div>
              ) : detailError ? (
                <div className="space-y-3">
                  <p className="rounded-xl bg-[var(--pt-danger-bg)] px-4 py-3 text-[12.5px] text-[var(--pt-danger-text)]">
                    {detailError}
                  </p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={closeRegister}
                      className="inline-flex h-9 items-center rounded-full border border-[var(--pt-border)] px-4 text-[12px] font-semibold text-[var(--pt-heading)] hover:border-[var(--pt-accent)]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : detail ? (
                <SubmissionPanel
                  key={detail.id}
                  detail={detail}
                  options={options}
                  onGraded={() => {
                    /* refresh the list AND re-pull the register so the
                       freshly graded row flips to "Graded" in place */
                    void refreshList();
                    if (detail) void loadDetail(detail.id);
                  }}
                  onSaved={() => {
                    /* the edit changed the work itself / group structure */
                    void refreshList();
                    if (detail) void loadDetail(detail.id);
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

