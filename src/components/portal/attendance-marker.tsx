"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Loader2, Save, Search, Users } from "lucide-react";
import { studentAvatarFor } from "@/lib/student-avatar";

type TeacherClass = {
  id: number;
  name: string;
  grade: string;
  subject: string;
  students: number;
};

type RosterEntry = {
  studentId: number;
  admissionNo: string;
  registerNo: string | null;
  fullName: string;
  status: string | null;
};

type StatusKey = "present" | "absent" | "late" | "excused";

const STATUSES: {
  key: StatusKey;
  short: string;
  label: string;
  chip: string;
}[] = [
  {
    key: "present",
    short: "P",
    label: "Present",
    chip: "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
  },
  {
    key: "absent",
    short: "A",
    label: "Absent",
    chip: "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]",
  },
  {
    key: "late",
    short: "L",
    label: "Late",
    chip: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  },
  {
    key: "excused",
    short: "E",
    label: "Excused",
    chip: "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]",
  },
];

const CHIP_BY_STATUS = new Map(STATUSES.map((s) => [s.key, s.chip]));

function friendlyDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function isWeekend(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Phase 3.1-c — the daily register. Class pills + day picker on top, the
 * roll below with Present / Absent / Late / Excused per student. Saves are
 * idempotent upserts, so re-marking a day simply corrects it. Every colour
 * reads from the --pt-* tokens, so the register is first-class in BOTH
 * portal themes.
 */
export function AttendanceMarker({
  classes,
  initialDay,
}: {
  classes: TeacherClass[];
  initialDay: string;
}) {
  const [classId, setClassId] = useState<number>(classes[0]?.id ?? 0);
  const [day, setDay] = useState<string>(initialDay);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<number, StatusKey>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const requestId = useRef(0);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? classes[0],
    [classes, classId],
  );

  /* v2.8.40.0 — search the roll by name, admission no or register no
     (owner: "admition number eka, registor number eka hari name eka hari
     enter karala serch karaganna studentsla"). Pure client-side filter —
     the roll is already fully loaded and teacher-scoped. */
  const filteredRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (entry) =>
        entry.fullName.toLowerCase().includes(q) ||
        entry.admissionNo.toLowerCase().includes(q) ||
        (entry.registerNo ?? "").toLowerCase().includes(q),
    );
  }, [roster, query]);

  const loadRoster = useCallback(async (targetClassId: number, targetDay: string, silent = false) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(
        `/api/portal/attendance/roster?classId=${targetClassId}&day=${encodeURIComponent(targetDay)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { ok?: boolean; students?: RosterEntry[] };
      if (id !== requestId.current) return;
      if (!res.ok || !data.ok) {
        setRoster([]);
        setStatuses({});
        setLoadError(true);
      } else {
        const students = data.students ?? [];
        setRoster(students);
        const next: Record<number, StatusKey> = {};
        for (const entry of students) {
          if (
            entry.status === "present" ||
            entry.status === "absent" ||
            entry.status === "late" ||
            entry.status === "excused"
          ) {
            next[entry.studentId] = entry.status;
          }
        }
        setStatuses(next);
      }
    } catch {
      if (id !== requestId.current) return;
      setRoster([]);
      setStatuses({});
      setLoadError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    /* Deferred by one task: the effect body itself never mutates state
       synchronously (react-hooks rule), and requestId cancels any stale
       in-flight fetch when class/day changes mid-load. */
    const timer = setTimeout(() => {
      if (cancelled) return;
      setFlash(null);
      setError(null);
      setDirty(false);
      void loadRoster(classId, day);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [classId, day, loadRoster]);

  function mark(studentId: number, status: StatusKey) {
    setStatuses((prev) => {
      /* Tapping the active status again clears the mark. */
      const next = { ...prev };
      if (next[studentId] === status) delete next[studentId];
      else next[studentId] = status;
      return next;
    });
    setDirty(true);
    setFlash(null);
    setError(null);
  }

  function markRemainingPresent() {
    setStatuses((prev) => {
      const next = { ...prev };
      for (const entry of roster) {
        if (!next[entry.studentId]) next[entry.studentId] = "present";
      }
      return next;
    });
    setDirty(true);
    setFlash(null);
    setError(null);
  }

  const markedCount = roster.filter((r) => statuses[r.studentId]).length;
  const counts = useMemo(() => {
    const tally: Record<StatusKey, number> = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const entry of roster) {
      const status = statuses[entry.studentId];
      if (status) tally[status] += 1;
    }
    return tally;
  }, [roster, statuses]);

  async function save() {
    if (saving || !classId || markedCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      const records = roster
        .filter((r) => statuses[r.studentId])
        .map((r) => ({ studentId: r.studentId, status: statuses[r.studentId] }));
      const res = await fetch("/api/portal/attendance/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classId, day, records }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(
          data.error === "forbidden"
            ? "You can only save registers for your own classes."
            : data.error === "not_enrolled"
              ? "One of the marked students is no longer on this class roll."
              : "The register could not be saved. Check the day and try again.",
        );
        return;
      }
      setDirty(false);
      setFlash(
        `Register saved for ${friendlyDay(day)} · ${counts.present} present${
          counts.absent ? ` · ${counts.absent} absent` : ""
        }${counts.late ? ` · ${counts.late} late` : ""}${counts.excused ? ` · ${counts.excused} excused` : ""}`,
      );
      await loadRoster(classId, day, true);
    } catch {
      setError("Network hiccup — the register was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (classes.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-8 text-center">
        <p className="text-[14px] font-semibold text-[var(--pt-heading)]">
          No class registers assigned yet
        </p>
        <p className="mx-auto mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-[var(--pt-body)]">
          The register opens here once the school office assigns subjects or a
          class-teacher role to you for this year.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Class pills + day picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="pt-scrollbar flex gap-1.5 overflow-x-auto rounded-full border border-[var(--pt-border)] bg-[var(--pt-nav-track)] p-1"
          role="tablist"
          aria-label="Choose class register"
        >
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === classId}
              onClick={() => setClassId(c.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-300 ${
                c.id === classId
                  ? "pt-nav-active bg-[var(--pt-nav-active-bg)] text-[var(--pt-nav-active-text)]"
                  : "text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
              }`}
            >
              {c.name}
              <span className="ml-1.5 text-[11px] opacity-70">{c.students}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] py-1.5 pl-3.5 pr-2 text-[12.5px] text-[var(--pt-body)]">
          <CalendarDays size={14} className="text-[var(--pt-accent-text)]" />
          <span className="sr-only">Register day</span>
          <input
            type="date"
            value={day}
            max={initialDay}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="bg-transparent text-[12.5px] font-medium text-[var(--pt-heading)] outline-none"
          />
        </label>
      </div>

      {/* Register panel */}
      <div className="overflow-hidden rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pt-border)] px-5 py-4">
          <div>
            <p className="font-display text-[15px] font-semibold text-[var(--pt-heading)]">
              {activeClass?.name} register
            </p>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              {friendlyDay(day)} · {activeClass?.subject} ·{" "}
              {loading ? "loading roll…" : `${roster.length} on the roll`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUSES.map((s) => (
              <span
                key={s.key}
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${s.chip}`}
              >
                {s.label} {counts[s.key]}
              </span>
            ))}
          </div>
        </div>

        {isWeekend(day) && (
          <p className="border-b border-[var(--pt-border)] bg-[var(--pt-warn-bg)] px-5 py-2 text-[11.5px] font-medium text-[var(--pt-warn-text)]">
            {friendlyDay(day)} falls on a weekend — school days only, save only
            if the office asks for a correction.
          </p>
        )}

        {/* Roll search (v2.8.40.0) */}
        <div className="border-b border-[var(--pt-border)] px-5 py-3">
          <label className="flex items-center gap-2 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-2">
            <Search size={14} className="shrink-0 text-[var(--pt-accent-text)]" aria-hidden="true" />
            <span className="sr-only">Search students</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, admission no or register no…"
              className="w-full bg-transparent text-[12.5px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-muted)]"
            />
            {query.trim() !== "" && (
              <span className="shrink-0 text-[10.5px] font-medium tabular-nums text-[var(--pt-body)]">
                {filteredRoster.length} of {roster.length}
              </span>
            )}
          </label>
        </div>

        <div className="pt-scrollbar max-h-[440px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-[13px] text-[var(--pt-body)]">
              <Loader2 size={15} className="animate-spin text-[var(--pt-accent)]" />
              Opening the roll…
            </div>
          ) : loadError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
                The roll could not be opened
              </p>
              <p className="mt-1 text-[12px] text-[var(--pt-body)]">
                Refresh the page in a moment — the office data did not respond.
              </p>
            </div>
          ) : roster.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
                No students on this roll yet
              </p>
              <p className="mt-1 text-[12px] text-[var(--pt-body)]">
                Students appear here once the office enrolls them into{" "}
                {activeClass?.name}.
              </p>
            </div>
          ) : filteredRoster.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
                No student matches “{query.trim()}”
              </p>
              <p className="mt-1 text-[12px] text-[var(--pt-body)]">
                Try a name, an admission number or a register number.
              </p>
            </div>
          ) : (
            <ul>
              {filteredRoster.map((entry, index) => {
                const active = statuses[entry.studentId];
                return (
                  <li
                    key={entry.studentId}
                    className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors duration-200 hover:bg-[var(--pt-panel-soft)] ${
                      index !== filteredRoster.length - 1 ? "border-b border-[var(--pt-border)]" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* Roster-style avatar wall — same mapping as My Class Rosters */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={studentAvatarFor(entry.admissionNo)}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[var(--pt-border)]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold text-[var(--pt-heading)]">
                          {entry.fullName}
                        </p>
                        <p className="truncate text-[11px] text-[var(--pt-body)]">
                          Admission {entry.admissionNo}
                          {entry.registerNo ? ` · Register ${entry.registerNo}` : ""}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex gap-1"
                      role="radiogroup"
                      aria-label={`Mark ${entry.fullName}`}
                    >
                      {STATUSES.map((s) => {
                        const selected = active === s.key;
                        return (
                          <button
                            key={s.key}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            title={s.label}
                            onClick={() => mark(entry.studentId, s.key)}
                            className={`h-8 w-9 rounded-lg text-[12px] font-bold transition-all duration-200 ${
                              selected
                                ? `${s.chip} scale-105 shadow-sm`
                                : "border border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)]"
                            } ${s.key === "excused" && !selected ? "w-10" : "w-9"}`}
                          >
                            {s.short}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Save bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-5 py-3.5">
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--pt-body)]">
            <Users size={13} className="text-[var(--pt-accent-text)]" />
            {markedCount} of {roster.length} marked
            {dirty && <span className="font-semibold text-[var(--pt-accent-text)]">· unsaved</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={markRemainingPresent}
              disabled={loading || loadError || roster.length === 0}
              className="rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3.5 py-2 text-[12px] font-medium text-[var(--pt-body)] transition-colors duration-300 hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)] disabled:opacity-50"
            >
              Mark unmarked present
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || loading || loadError || markedCount === 0}
              className="flex items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pt-on-accent)] shadow-sm transition-all duration-300 hover:brightness-105 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {saving ? "Saving…" : "Save register"}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {flash && (
        <p className="flex items-center gap-1.5 rounded-xl bg-[var(--pt-good-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--pt-good-text)]">
          <Check size={14} />
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-[var(--pt-danger-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--pt-danger-text)]">
          {error}
        </p>
      )}
    </div>
  );
}
