"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardList,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { studentAvatarFor } from "@/lib/student-avatar";
import {
  gradeChipClass,
  gradeForPct,
  gradeForScore,
  GRADE_LEGEND,
} from "@/lib/grades-shared";

/* ── types shared with the server page ─────────────────────────────────── */

export type TeacherClassSubjectOption = {
  csId: number;
  classId: number;
  className: string;
  subjectName: string;
  students: number;
};

export type TeacherAssessmentItem = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  term: string;
  maxScore: number;
  markedCount: number;
  totalCount: number;
  avgPct: number | null;
  createdLabel: string;
};

export type AssessmentMarkRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  score: number | null;
};

export type TeacherAssessmentDetail = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  term: string;
  maxScore: number;
  rows: AssessmentMarkRow[];
};

const TERM_PILLS = ["Term 1", "Term 2", "Term 3"];

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

/* ── the marks register for ONE assessment ─────────────────────────────── */

function seedDrafts(detail: TeacherAssessmentDetail) {
  const seed: Record<number, string> = {};
  for (const r of detail.rows) {
    seed[r.studentId] = r.score != null ? String(r.score) : "";
  }
  return seed;
}

function MarksRegister({
  detail,
  onChanged,
  onClosed,
}: {
  detail: TeacherAssessmentDetail;
  onChanged: () => void;
  onClosed: () => void;
}) {
  /* The parent mounts this panel with key={detail.id}, so a different
     assessment remounts it — the drafts seed straight from the fresh
     detail with NO cascading effect. */
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    seedDrafts(detail),
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3600);
    return () => clearTimeout(t);
  }, [flash]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return detail.rows;
    return detail.rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.admissionNo.toLowerCase().includes(q),
    );
  }, [detail.rows, query]);

  const markedCount = useMemo(
    () => detail.rows.filter((r) => (drafts[r.studentId] ?? "").trim() !== "").length,
    [detail.rows, drafts],
  );

  async function saveRegister() {
    if (saving) return;
    setSaving(true);
    setFlash(null);
    try {
      const marks = detail.rows.map((r) => {
        const raw = (drafts[r.studentId] ?? "").trim();
        return {
          studentId: r.studentId,
          score: raw === "" ? null : Number(raw),
        };
      });
      const res = await fetch(`/api/portal/assessments/${detail.id}/marks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marks }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        saved?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the marks.");
      }
      setFlash({ ok: true, text: `Register saved — ${json.saved ?? marks.length} marks recorded.` });
      onChanged();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the marks.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (deleting) return;
    if (!window.confirm(`Delete "${detail.title}" and all its marks? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/portal/assessments/${detail.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not delete the assessment.");
      }
      onClosed();
      onChanged();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not delete the assessment.",
      });
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-accent-text)]">
            {detail.className} · {detail.subjectName} · {detail.term}
          </p>
          <h3 className="mt-0.5 font-display text-[17px] font-semibold leading-snug text-[var(--pt-heading)]">
            {detail.title}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-[var(--pt-body)]">
            Out of {detail.maxScore} · leave a box empty to clear a mark
          </p>
          <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
            Grades: {GRADE_LEGEND}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[var(--pt-accent-soft)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--pt-accent-text)]">
            {markedCount}/{detail.rows.length} marked
          </span>
          <button
            type="button"
            onClick={onClosed}
            className="rounded-full border border-[var(--pt-border)] px-3 py-1 text-[10.5px] font-semibold text-[var(--pt-body)] transition-colors hover:bg-[var(--pt-panel-soft)]"
          >
            Close
          </button>
        </div>
      </div>

      <Flash flash={flash} />

      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pt-muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or admission number"
          className="h-9 w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] pl-8 pr-3 text-[12px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
        />
      </div>

      <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-0.5">
        {visible.map((row) => {
          const draft = drafts[row.studentId] ?? "";
          const parsed = Number(draft);
          const liveGrade =
            draft.trim() !== "" &&
            Number.isFinite(parsed) &&
            parsed >= 0 &&
            parsed <= detail.maxScore
              ? gradeForScore(parsed, detail.maxScore)
              : null;
          return (
            <div
              key={row.studentId}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 py-2"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--pt-accent-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={studentAvatarFor(row.admissionNo)} alt="" className="h-8 w-8 object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-[var(--pt-heading)]">
                  {row.fullName}
                </p>
                <p className="text-[10.5px] text-[var(--pt-body)]">{row.admissionNo}</p>
              </div>
              <span
                className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold sm:block ${
                  liveGrade ? gradeChipClass(liveGrade) : "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
                }`}
              >
                {liveGrade ?? "Unmarked"}
              </span>
              <input
                type="number"
                min={0}
                max={detail.maxScore}
                inputMode="numeric"
                value={draft}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [row.studentId]: e.target.value }))
                }
                placeholder="—"
                aria-label={`Mark for ${row.fullName} (out of ${detail.maxScore})`}
                className="h-9 w-20 shrink-0 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-2 text-center text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
              />
            </div>
          );
        })}
        {visible.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[var(--pt-body)]">
            No student matches that search.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void remove()}
          disabled={deleting}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--pt-danger-border,transparent)] bg-[var(--pt-danger-bg)] px-3 text-[11.5px] font-semibold text-[var(--pt-danger-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          Delete assessment
        </button>
        <button
          type="button"
          onClick={() => void saveRegister()}
          disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Save register
        </button>
      </div>
    </div>
  );
}

/* ── the page ──────────────────────────────────────────────────────────── */

export function TeacherMarks({
  options,
  initialAssessments,
}: {
  options: TeacherClassSubjectOption[];
  initialAssessments: TeacherAssessmentItem[];
}) {
  const [assessments, setAssessments] = useState(initialAssessments);
  const [csId, setCsId] = useState<number | "">(options[0]?.csId ?? "");
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [maxScore, setMaxScore] = useState("100");
  const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [detail, setDetail] = useState<TeacherAssessmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const registerRef = useRef<HTMLDivElement | null>(null);
  /* v2.8.61.0 — per-row delete in the LIST too (the owner: "test walath
     ehemai" — the register's delete button hid below the fold). */
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/assessments", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        assessments?: TeacherAssessmentItem[];
      };
      if (res.ok && json.ok && Array.isArray(json.assessments)) {
        setAssessments(json.assessments);
      }
    } catch {
      /* the list is refreshable — a silent miss is fine */
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/portal/assessments/${id}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: TeacherAssessmentDetail;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.detail) {
        throw new Error(json.error === "not_found" ? "Assessment not found." : "Could not load the register.");
      }
      setDetail(json.detail);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function openRegister(id: number) {
    void loadDetail(id);
    requestAnimationFrame(() => {
      registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* v2.8.61.0 — delete straight from the list (same endpoint + confirm as
     the register's own Delete assessment button). */
  async function removeAssessment(a: TeacherAssessmentItem) {
    if (deletingId != null) return;
    if (!window.confirm(`Delete "${a.title}" (${a.className} · ${a.subjectName}) and all its marks? This cannot be undone.`)) {
      return;
    }
    setDeletingId(a.id);
    try {
      const res = await fetch(`/api/portal/assessments/${a.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not delete the assessment.");
      }
      if (detail?.id === a.id) setDetail(null);
      setFlash({ ok: true, text: `Deleted "${a.title}".` });
      await refreshList();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not delete the assessment.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFlash(null);
    try {
      const res = await fetch("/api/portal/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classSubjectId: csId === "" ? undefined : csId,
          title,
          term,
          maxScore: maxScore.trim() === "" ? undefined : Number(maxScore),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the assessment.");
      }
      setTitle("");
      setMaxScore("100");
      setFlash({ ok: true, text: "Assessment created — enter the marks below." });
      await refreshList();
      if (json.id) openRegister(json.id);
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the assessment.",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <Flash flash={flash} />

      {/* Composer */}
      <section
        id="compose"
        className="scroll-mt-24 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <GraduationCap size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              New assessment
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              A term test, assignment mark or any scored piece of work for one
              of your classes.
            </p>
          </div>
        </div>

        {options.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--pt-border)] px-4 py-3 text-[12.5px] text-[var(--pt-body)]">
            Your teaching subjects are not set up yet — ask the school office
            to assign you classes, then record marks here.
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
                  Out of (max score)
                </span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  inputMode="numeric"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
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
                placeholder="e.g. Term 1 unit test — matter & measurement"
                className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 text-[13px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Term
              </span>
              <div className="flex gap-1.5">
                {TERM_PILLS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTerm(t)}
                    className={`h-9 rounded-full px-4 text-[11.5px] font-semibold transition-colors ${
                      term === t
                        ? "bg-[var(--pt-accent)] text-[var(--pt-on-accent)]"
                        : "border border-[var(--pt-border)] text-[var(--pt-body)] hover:bg-[var(--pt-panel-soft)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
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
                  <Plus size={13} />
                )}
                Create assessment
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Register drawer for the selected assessment */}
      <section
        ref={registerRef}
        className="scroll-mt-24 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5"
      >
        {detailLoading ? (
          <p className="flex items-center gap-2 py-6 text-[12.5px] text-[var(--pt-body)]">
            <Loader2 size={14} className="animate-spin" /> Opening the register…
          </p>
        ) : detail ? (
          <MarksRegister
            key={detail.id}
            detail={detail}
            onChanged={() => void refreshList()}
            onClosed={() => setDetail(null)}
          />
        ) : (
          <p className="py-6 text-center text-[12.5px] text-[var(--pt-body)]">
            Open an assessment below to enter its marks register.
          </p>
        )}
      </section>

      {/* Assessment list */}
      <section className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <ClipboardList size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              Your assessments
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              {assessments.length > 0
                ? "Tap one to open or correct its marks register."
                : "Nothing recorded yet."}
            </p>
          </div>
        </div>

        {assessments.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--pt-border-strong,var(--pt-border))] px-4 py-6 text-center text-[12.5px] text-[var(--pt-body)]">
            Create your first assessment above — the class register opens
            straight away.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {assessments.map((a) => {
              const isActive = detail?.id === a.id;
              return (
                <div
                  key={a.id}
                  className={`flex items-stretch gap-2 rounded-xl border px-3.5 py-3 transition-colors ${
                    isActive
                      ? "border-[var(--pt-accent)] bg-[var(--pt-accent-soft)]"
                      : "border-[var(--pt-border)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openRegister(a.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                          {a.title}
                        </p>
                        <p className="truncate text-[11px] text-[var(--pt-body)]">
                          {a.className} · {a.subjectName} · {a.term} · out of {a.maxScore} · {a.createdLabel}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full bg-[var(--pt-chip)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--pt-chip-text)]">
                          {a.markedCount}/{a.totalCount} marked
                        </span>
                        {a.avgPct != null ? (
                          <span className="rounded-full bg-[var(--pt-good-bg)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--pt-good-text)]">
                            avg {a.avgPct}% · {gradeForPct(a.avgPct)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                  {/* v2.8.61.0 — the delete door right on the row. */}
                  <button
                    type="button"
                    onClick={() => void removeAssessment(a)}
                    disabled={deletingId === a.id}
                    aria-label={`Delete ${a.title}`}
                    title="Delete this assessment and all its marks"
                    className="grid w-9 shrink-0 place-items-center self-stretch rounded-lg text-[var(--pt-body)] transition-colors hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)] disabled:opacity-50"
                  >
                    {deletingId === a.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
