"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, Eraser, X, RefreshCw, Sparkles } from "lucide-react";
import {
  TimetableGridView,
  type ActiveCell,
  type GridSlot,
} from "@/components/portal/timetable-grid-view";
import { portalRoleHeaders, type PortalRoleHint } from "@/lib/portal-client";
import type {
  TimetableClassOption,
  TimetableWeek,
} from "@/lib/portal-timetable";

/**
 * PHASE 3.1 (v2.8.54.0) — the timetable EDITOR island.
 * v2.8.55.0 — one island, TWO pens:
 * · the TEACHER portal (endpoint /api/portal/timetable + the x-portal-role
 *   hint) — classes this teacher teaches or lead are editable, the rest
 *   browse-only; and
 * · the LMS ADMIN studio (endpoint /api/admin/lms/timetable, no role hint)
 *   — the office holds the master pen for EVERY class (owner: "godak
 *   welawata eyane timetables create karanne").
 *
 * Pick a class → the week grid loads → tap any cell → the editor strip
 * fills in below the grid: subject (from the class's subject list), teacher
 * (defaults to the office-assigned one), room — Save upserts the lesson,
 * Clear makes the cell a free period. NEW: "Custom activity…" stores a
 * free-text period with NO subject (outside activities, assemblies — owner
 * item 2). The signed-in teacher's own lessons are ringed gold so
 * "මගේ පාඩම්" reads at a glance (the admin view rings nothing).
 */

type EditorState = {
  day: number;
  period: number;
  dayLabel: string;
  slot: GridSlot | null;
};

const DAY_LABELS: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
};

export function TimetableEditor({
  classes,
  meTeacherId,
  endpoint = "/api/portal/timetable",
  roleHint = "teacher",
}: {
  classes: TimetableClassOption[];
  /** The signed-in teacher's person id (rings THEIR lessons); null for the
      LMS admin — the studio view rings nobody. */
  meTeacherId: number | null;
  /** Where the editor fetches/posts. The teacher portal and the LMS admin
      studio share this component but never each other's endpoints. */
  endpoint?: string;
  /** Portal role hint for cookie disambiguation; null on the admin studio. */
  roleHint?: PortalRoleHint | null;
}) {
  const firstClass = classes[0]?.id ?? 0;
  const [classId, setClassId] = useState<number>(firstClass);
  /* The ownership pen (teacher side): only classes THIS teacher teaches or
     lead are editable — the server enforces the same rule on every write.
     The admin side passes every class editable. */
  const canEdit = classes.find((c) => c.id === classId)?.editable ?? false;
  const [week, setWeek] = useState<TimetableWeek | null>(null);
  /** The class id the loaded week belongs to — null while a fetch is in
      flight. `loading` is DERIVED (never set in an effect). */
  const [weekFor, setWeekFor] = useState<number | null>(null);
  const loading = weekFor !== classId;
  const [loadError, setLoadError] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  /** v2.8.55.0 — the "Custom activity…" mode: the cell carries a free-text
      name instead of a subject. */
  const [customMode, setCustomMode] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [room, setRoom] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyCell, setBusyCell] = useState<ActiveCell>(null);
  const [note, setNote] = useState<{ kind: "good" | "bad"; text: string } | null>(null);
  const [spinning, setSpinning] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  /* Stable per roleHint — the fetch effect can depend on it honestly. */
  const apiHeaders = useMemo(
    () => (roleHint ? portalRoleHeaders(roleHint) : {}),
    [roleHint],
  );

  /* Mount/class-switch fetch: EVERY setState lands in the fetch
     continuation — nothing synchronous in the effect body (house rule).
     Invalidations just clear weekFor; the effect does the rest. */
  useEffect(() => {
    if (weekFor === classId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${endpoint}?classId=${classId}`, {
          headers: apiHeaders,
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setWeek(null);
          setWeekFor(classId);
          setLoadError(
            res.status === 404
              ? "That class no longer exists."
              : "The timetable could not be loaded. Try again.",
          );
          return;
        }
        const data = (await res.json()) as TimetableWeek;
        if (cancelled) return;
        setWeek(data);
        setWeekFor(classId);
        setLoadError("");
      } catch {
        if (cancelled) return;
        setWeek(null);
        setWeekFor(classId);
        setLoadError("The timetable could not be loaded. Check the connection.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, weekFor, endpoint, apiHeaders]);

  /** Drop the loaded week — the effect refetches; the grid stays visible
      until fresh data lands. */
  function invalidate() {
    setWeekFor(null);
  }

  function refresh() {
    setSpinning(true);
    setTimeout(() => setSpinning(false), 650);
    invalidate();
  }

  function openCell(day: number, period: number) {
    if (!week || !canEdit) return;
    const slot =
      week.slots.find((s) => s.dayOfWeek === day && s.periodNo === period) ?? null;
    setEditor({ day, period, dayLabel: DAY_LABELS[day] ?? "Day", slot });
    setSubjectId(slot?.subjectId ?? null);
    /* A custom cell re-opens in custom mode with its name filled in. */
    const wasCustom = !slot?.subjectId && !!slot?.customLabel;
    setCustomMode(wasCustom);
    setCustomLabel(wasCustom ? (slot?.customLabel ?? "") : "");
    setTeacherId(slot?.teacherId ?? null);
    setRoom(slot?.room ?? "");
    setNote(null);
    /* The editor strip sits below the grid — bring it into view, honestly
       smooth (reduced-motion users get the native auto jump). */
    setTimeout(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      editorRef.current?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "nearest",
      });
    }, 30);
  }

  function pickSubject(value: string) {
    if (value === "custom") {
      setCustomMode(true);
      setSubjectId(null);
      setNote(null);
      return;
    }
    setCustomMode(false);
    setCustomLabel("");
    const parsed = value === "" ? null : Number(value);
    setSubjectId(parsed);
    /* Pre-pick the office-assigned teacher when the subject changes and the
       cell isn't already carrying an explicit teacher for THAT subject. */
    if (parsed != null && week) {
      const cs = week.subjects.find((s) => s.subjectId === parsed);
      if (cs?.teacherId) setTeacherId(cs.teacherId);
    }
  }

  async function save(clear: boolean) {
    if (!week || !editor || saving) return;
    if (!clear && customMode && !customLabel.trim()) {
      setNote({
        kind: "bad",
        text: "Give the activity a name — e.g. “Outside Activity”.",
      });
      return;
    }
    setSaving(true);
    setBusyCell({ day: editor.day, period: editor.period });
    setNote(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...apiHeaders },
        body: JSON.stringify({
          classId: week.class.id,
          dayOfWeek: editor.day,
          periodNo: editor.period,
          subjectId: clear || customMode ? null : subjectId,
          teacherId: clear ? null : teacherId,
          room: clear ? null : room,
          customLabel: clear || !customMode ? null : customLabel,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setNote({
          kind: "bad",
          text: data?.error || "The slot could not be saved. Try again.",
        });
        return;
      }
      setNote({
        kind: "good",
        text: clear
          ? `${editor.dayLabel} · Period ${editor.period} cleared — free period.`
          : `${editor.dayLabel} · Period ${editor.period} saved.`,
      });
      setEditor(null);
      invalidate();
    } catch {
      setNote({ kind: "bad", text: "The slot could not be saved. Check the connection." });
    } finally {
      setSaving(false);
      setBusyCell(null);
    }
  }

  if (classes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[var(--pt-border)] px-4 py-8 text-center text-[13px] text-[var(--pt-muted)]">
        Classes appear here once the office sets up this year&apos;s register.
      </p>
    );
  }

  const slotCount = week?.slots.length ?? 0;
  const saveDisabled = saving || (!customMode && subjectId == null);

  return (
    <div className="space-y-4">
      {/* Class picker + refresh */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="tt-class" className="sr-only">
          Choose the class
        </label>
        <select
          id="tt-class"
          value={classId}
          onChange={(e) => {
            setClassId(Number(e.target.value));
            setEditor(null);
            setNote(null);
          }}
          className="min-h-11 rounded-full border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-4 py-2 text-[13.5px] font-semibold text-[var(--pt-heading)] outline-none transition-colors focus:border-[var(--pt-accent)]"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.section ? ` · ${c.section}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh the timetable"
          className="grid h-11 w-11 place-items-center rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)] disabled:opacity-60"
        >
          <RefreshCw size={15} className={spinning ? "animate-spin" : ""} aria-hidden="true" />
        </button>
        {week ? (
          <span className="ml-auto rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--pt-chip-text)]">
            {week.class.name} · {slotCount} lesson{slotCount === 1 ? "" : "s"} this week
          </span>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="rounded-2xl bg-[var(--pt-info-bg)] px-4 py-3 text-[12.5px] text-[var(--pt-info-text)]">
          You can browse every class here, but only classes you teach or lead
          can be edited.
        </p>
      ) : null}

      {loadError && !loading ? (
        <p className="rounded-2xl border border-[var(--pt-warn-bg)] bg-[var(--pt-warn-bg)] px-4 py-3 text-[12.5px] text-[var(--pt-warn-text)]">
          {loadError}
        </p>
      ) : null}

      {/* Grid — stays mounted while a refresh lands (no flicker). */}
      {!week && loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--pt-muted)]">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Loading the week…
        </div>
      ) : week ? (
        <TimetableGridView
          slots={week.slots}
          myTeacherId={meTeacherId}
          onCellTap={canEdit ? openCell : undefined}
          activeCell={editor ? { day: editor.day, period: editor.period } : null}
          cellBusy={busyCell}
          editable={canEdit}
        />
      ) : null}

      {/* Legend */}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--pt-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-[rgb(234_179_8/0.45)] bg-[var(--pt-chip)]" />
            My lessons
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm border border-dashed border-[var(--pt-border)]" />
            Free — tap to add
          </span>
          <span>Tap any cell to edit it.</span>
        </div>
      ) : null}

      {/* Editor strip */}
      <div ref={editorRef}>
        {editor && week ? (
          <div className="rounded-2xl border border-[var(--pt-accent)] bg-[var(--pt-panel-soft)] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
                {editor.dayLabel} · Period {editor.period}
                {editor.slot?.subjectName || editor.slot?.customLabel ? (
                  <span className="ml-2 text-[12px] font-normal text-[var(--pt-muted)]">
                    editing “{editor.slot?.subjectName ?? editor.slot?.customLabel}”
                  </span>
                ) : (
                  <span className="ml-2 text-[12px] font-normal text-[var(--pt-muted)]">
                    free period
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setEditor(null)}
                aria-label="Close the editor"
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-panel)] hover:text-[var(--pt-heading)]"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="tt-subject"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]"
                >
                  Subject
                </label>
                <select
                  id="tt-subject"
                  value={customMode ? "custom" : subjectId ?? ""}
                  onChange={(e) => pickSubject(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-3 py-2 text-[13px] text-[var(--pt-heading)] outline-none transition-colors focus:border-[var(--pt-accent)]"
                >
                  <option value="">Free period</option>
                  {week.subjects.map((s) => (
                    <option key={s.csId} value={s.subjectId}>
                      {s.name}
                    </option>
                  ))}
                  {/* v2.8.55.0 — subject-less periods (owner item 2). */}
                  <option value="custom">Custom activity…</option>
                </select>
              </div>

              {customMode ? (
                <div className="sm:col-span-2">
                  <label
                    htmlFor="tt-custom"
                    className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]"
                  >
                    <Sparkles size={11} aria-hidden="true" />
                    Activity name
                  </label>
                  <input
                    id="tt-custom"
                    type="text"
                    value={customLabel}
                    maxLength={60}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="e.g. Outside Activity, Assembly, Sports"
                    autoFocus
                    className="min-h-11 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-3 py-2 text-[13px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
                  />
                </div>
              ) : (
                <div className="hidden" aria-hidden="true" />
              )}

              <div>
                <label
                  htmlFor="tt-teacher"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]"
                >
                  Teacher
                </label>
                <select
                  id="tt-teacher"
                  value={teacherId ?? ""}
                  onChange={(e) =>
                    setTeacherId(e.target.value === "" ? null : Number(e.target.value))
                  }
                  disabled={!customMode && subjectId == null}
                  className="min-h-11 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-3 py-2 text-[13px] text-[var(--pt-heading)] outline-none transition-colors focus:border-[var(--pt-accent)] disabled:opacity-50"
                >
                  <option value="">No teacher</option>
                  {week.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.designation ? ` — ${t.designation}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="tt-room"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]"
                >
                  Room <span className="font-normal normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="tt-room"
                  type="text"
                  value={room}
                  maxLength={60}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. Lab 1"
                  disabled={!customMode && subjectId == null}
                  className="min-h-11 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-3 py-2 text-[13px] text-[var(--pt-heading)] outline-none transition-colors placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] disabled:opacity-50"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void save(false)}
                disabled={saveDisabled}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 py-2.5 text-[13px] font-semibold text-[var(--pt-on-accent)] transition-colors hover:bg-[var(--pt-accent-hover)] disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Save size={14} aria-hidden="true" />
                )}
                {saving ? "Saving…" : customMode ? "Save activity" : "Save lesson"}
              </button>
              {editor.slot ? (
                <button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-5 py-2.5 text-[13px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[rgb(244_63_94/0.35)] hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)] disabled:opacity-60"
                >
                  <Eraser size={14} aria-hidden="true" />
                  Clear (free period)
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {note ? (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-[12.5px] font-medium ${
            note.kind === "good"
              ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
              : "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
          }`}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
