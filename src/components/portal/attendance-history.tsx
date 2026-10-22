"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, History, Loader2, Lock } from "lucide-react";
import { studentAvatarFor } from "@/lib/student-avatar";

type TeacherClass = {
  id: number;
  name: string;
  grade: string;
  subject: string;
  students: number;
};

type HistoryDay = {
  day: string;
  label: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number | null;
};

type HistoryStudent = {
  studentId: number;
  fullName: string;
  admissionNo: string;
  registerNo: string | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
  pct: number | null;
};

type History = {
  range: string;
  classId: number;
  from: string;
  to: string;
  totals: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    marked: number;
    pct: number | null;
  };
  days: HistoryDay[];
  students: HistoryStudent[];
};

const RANGES = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
] as const;

const STATUS_CHIP: Record<string, string> = {
  present: "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]",
  absent: "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]",
  late: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  excused: "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]",
};

function windowLabel(history: History) {
  if (history.from === history.to) return history.from;
  return `${history.from} → ${history.to}`;
}

/**
 * v2.8.40.0 — class attendance history, owner request: "eka yatin history
 * ekak danna wei ne weekly, day by day, monthly, yearly wage. habai ewa
 * read only widiyata dammama athi ne." Strictly read-only: the only HTTP
 * verb this panel can speak is GET, and there is not a single setter in
 * the component — past registers can be reviewed, never rewritten here.
 */
export function AttendanceHistory({
  classes,
  initialDay,
}: {
  classes: TeacherClass[];
  initialDay: string;
}) {
  const [classId, setClassId] = useState<number>(classes[0]?.id ?? 0);
  const [range, setRange] = useState<string>("week");
  const [anchor, setAnchor] = useState<string>(initialDay);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? classes[0],
    [classes, classId],
  );

  const load = useCallback(async (targetClassId: number, targetRange: string, targetAnchor: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/portal/attendance/history?classId=${targetClassId}&range=${targetRange}&anchor=${encodeURIComponent(targetAnchor)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { ok?: boolean; history?: History };
      if (id !== requestId.current) return;
      if (!res.ok || !data.ok || !data.history) {
        setHistory(null);
        setError(true);
      } else {
        setHistory(data.history);
      }
    } catch {
      if (id !== requestId.current) return;
      setHistory(null);
      setError(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!classId) return;
    const timer = setTimeout(() => {
      void load(classId, range, anchor);
    }, 0);
    return () => clearTimeout(timer);
  }, [classId, range, anchor, load]);

  if (classes.length === 0) return null;

  const totals = history?.totals;

  return (
    <section
      aria-label="Attendance history"
      className="overflow-hidden rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)]"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--pt-border)] px-5 py-4">
        <div>
          <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-[var(--pt-heading)]">
            <History size={15} className="text-[var(--pt-accent-text)]" aria-hidden="true" />
            Attendance History
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pt-chip)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--pt-chip-text)]">
              <Lock size={9} aria-hidden="true" /> Read-only
            </span>
          </p>
          <p className="text-[11.5px] text-[var(--pt-body)]">
            {activeClass?.name} · past registers as the office filed them —
            history cannot be edited here.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] py-1.5 pl-3.5 pr-2 text-[12.5px] text-[var(--pt-body)]">
          <CalendarDays size={14} className="text-[var(--pt-accent-text)]" />
          <span className="sr-only">History anchor date</span>
          <input
            type="date"
            value={anchor}
            max={initialDay}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="bg-transparent text-[12.5px] font-medium text-[var(--pt-heading)] outline-none"
          />
        </label>
      </div>

      {/* Class pills + range tabs */}
      <div className="flex flex-col gap-3 border-b border-[var(--pt-border)] px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          className="pt-scrollbar flex gap-1.5 overflow-x-auto rounded-full border border-[var(--pt-border)] bg-[var(--pt-nav-track)] p-1"
          role="tablist"
          aria-label="Choose class history"
        >
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === classId}
              onClick={() => setClassId(c.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-300 ${
                c.id === classId
                  ? "pt-nav-active bg-[var(--pt-nav-active-bg)] text-[var(--pt-nav-active-text)]"
                  : "text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div
          className="flex gap-1 rounded-full border border-[var(--pt-border)] bg-[var(--pt-nav-track)] p-1"
          role="tablist"
          aria-label="History range"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-all duration-300 ${
                range === r.key
                  ? "pt-nav-active bg-[var(--pt-nav-active-bg)] text-[var(--pt-nav-active-text)]"
                  : "text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-[var(--pt-body)]">
          <Loader2 size={15} className="animate-spin text-[var(--pt-accent)]" />
          Opening the history…
        </div>
      ) : error ? (
        <div className="px-5 py-12 text-center">
          <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
            The history could not be opened
          </p>
          <p className="mt-1 text-[12px] text-[var(--pt-body)]">
            Try another date or range in a moment.
          </p>
        </div>
      ) : !history || totals == null || totals.marked === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-[13.5px] font-semibold text-[var(--pt-heading)]">
            No records in this window
          </p>
          <p className="mt-1 text-[12px] text-[var(--pt-body)]">
            {history ? `${windowLabel(history)} — ` : ""}No marked days for{" "}
            {activeClass?.name} yet.
          </p>
        </div>
      ) : (
        <div className="space-y-5 px-5 py-5">
          {/* Window + totals */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-[var(--pt-body)]">
              {windowLabel(history)}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${STATUS_CHIP.present}`}>
                Present {totals.present}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${STATUS_CHIP.absent}`}>
                Absent {totals.absent}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${STATUS_CHIP.late}`}>
                Late {totals.late}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${STATUS_CHIP.excused}`}>
                Excused {totals.excused}
              </span>
              {totals.pct != null && (
                <span className="rounded-full bg-[var(--pt-nav-active-bg)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--pt-nav-active-text)]">
                  {totals.pct}% attended
                </span>
              )}
            </div>
          </div>

          {/* Per-day register summary */}
          {history.days.length > 1 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
                Day by day
              </p>
              <div className="pt-scrollbar max-h-[220px] overflow-y-auto rounded-xl border border-[var(--pt-border)]">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-[var(--pt-panel-soft)] text-[10.5px] uppercase tracking-wide text-[var(--pt-muted)]">
                    <tr>
                      <th className="px-3.5 py-2 font-semibold">Day</th>
                      <th className="px-2 py-2 text-center font-semibold">P</th>
                      <th className="px-2 py-2 text-center font-semibold">A</th>
                      <th className="px-2 py-2 text-center font-semibold">L</th>
                      <th className="px-2 py-2 text-center font-semibold">E</th>
                      <th className="px-3.5 py-2 text-right font-semibold">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.days.map((d) => (
                      <tr
                        key={d.day}
                        className="border-t border-[var(--pt-border)] text-[var(--pt-heading)]"
                      >
                        <td className="px-3.5 py-2 font-medium">{d.label}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{d.present}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{d.absent}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{d.late}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{d.excused}</td>
                        <td className="px-3.5 py-2 text-right font-semibold tabular-nums text-[var(--pt-accent-text)]">
                          {d.pct != null ? `${d.pct}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Per-student totals */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
              Per student
            </p>
            <div className="pt-scrollbar max-h-[300px] overflow-y-auto rounded-xl border border-[var(--pt-border)]">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-[var(--pt-panel-soft)] text-[10.5px] uppercase tracking-wide text-[var(--pt-muted)]">
                  <tr>
                    <th className="px-3.5 py-2 font-semibold">Student</th>
                    <th className="px-2 py-2 text-center font-semibold">P</th>
                    <th className="px-2 py-2 text-center font-semibold">A</th>
                    <th className="px-2 py-2 text-center font-semibold">L</th>
                    <th className="px-2 py-2 text-center font-semibold">E</th>
                    <th className="px-3.5 py-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {history.students.map((s) => (
                    <tr
                      key={s.studentId}
                      className="border-t border-[var(--pt-border)] text-[var(--pt-heading)]"
                    >
                      <td className="px-3.5 py-2">
                        <span className="flex items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={studentAvatarFor(s.admissionNo)}
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-[var(--pt-border)]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{s.fullName}</span>
                            <span className="block truncate text-[10.5px] text-[var(--pt-body)]">
                              Admission {s.admissionNo}
                              {s.registerNo ? ` · Register ${s.registerNo}` : ""}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{s.present}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{s.absent}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{s.late}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{s.excused}</td>
                      <td className="px-3.5 py-2 text-right font-semibold tabular-nums text-[var(--pt-accent-text)]">
                        {s.pct != null ? `${s.pct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
