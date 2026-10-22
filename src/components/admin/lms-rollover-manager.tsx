"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS → Academic year rollover (client wizard).

   Four steps: (1) pick the new academic year, (2) plan every class —
   promote to a named new-year class (grade · section · class teacher) or
   graduate the O/L (grade 11) and A/L (grade 13) cohorts, (3) per-student
   exceptions — repeat into a same-grade new class or mark left school,
   (4) confirm and run. The run itself is ONE transaction on the server
   (POST /api/admin/lms/rollover); this wizard only assembles the plan.
   ──────────────────────────────────────────────────────────────────────── */

type RolloverClass = {
  id: number;
  name: string;
  grade: string;
  section: string | null;
  academicYear: string;
  classTeacherId: number | null;
  classTeacherName: string | null;
  roll: number;
  subjectsCount: number;
};

type RolloverStudent = {
  studentId: number;
  classId: number;
  fullName: string;
  admissionNo: string;
};

type StaffOption = { lmsTeacherId: number; fullName: string; teacherId: string };

type LastRollover = {
  at: string;
  targetYear: string;
  moved: number;
  graduated: number;
  repeated: number;
  left: number;
  classesCreated: number;
  restoreCount: number;
  classesStillThere: number;
};

type RolloverData = {
  ok: boolean;
  currentYear: string;
  targetYear: string;
  grades: string[];
  classes: RolloverClass[];
  students: RolloverStudent[];
  staff: StaffOption[];
  lastRollover?: LastRollover | null;
};

/* v2.8.64.0 — the undo preview from /api/admin/lms/rollover/undo. */
type UndoPreview = {
  ok: boolean;
  targetYear: string;
  prevYear: string;
  activeRowsToMoveBack: number;
  oldYearLeaverRows: number;
  blockedReason: string | null;
};

type UndoResult = {
  ok: boolean;
  targetYear: string;
  movedBack: number;
  reactivated: number;
  subjectsDeleted: number;
  classesDeleted: number;
  classesKept: string[];
};

type ClassPlan = {
  fromClassId: number;
  action: "promote" | "graduate";
  toGrade: string;
  toSection: string;
  classTeacherId: number | null;
};

/** "Follow class" = the student is absent from the exceptions map. */
type ExceptionMode = "repeat" | "left";

type RolloverResult = {
  ok: boolean;
  targetYear: string;
  classesCreated: { id: number; name: string }[];
  classesReused: string[];
  moved: number;
  graduated: number;
  repeated: number;
  left: number;
  alreadyMoved: number;
};

const STEPS = [
  { n: 1, label: "New academic year" },
  { n: 2, label: "Plan the classes" },
  { n: 3, label: "Student exceptions" },
  { n: 4, label: "Run" },
] as const;

/* Shared tokens — the same stone palette as the LMS Setup manager, remapped
   by the .lms-admin-scope theme in globals.css. */
const inputCls =
  "h-10 rounded-lg border border-stone-300 bg-white px-3 text-[13.5px] text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-500";
const btnPrimary =
  "inline-flex h-10 items-center gap-1.5 rounded-lg bg-stone-900 px-4 text-[13px] font-semibold text-white transition hover:bg-stone-700 disabled:opacity-50";
const btnNeutral =
  "inline-flex h-10 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-4 text-[13px] font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-40";
const card = "rounded-2xl border border-stone-200 bg-white";

const gradeRank = (g: string) => {
  const n = parseInt(g, 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};

function defaultPlan(c: RolloverClass, grades: string[]): ClassPlan {
  const next = String(Number(c.grade) + 1);
  return {
    fromClassId: c.id,
    action: c.grade === "11" || c.grade === "13" ? "graduate" : "promote",
    toGrade: /^\d+$/.test(next) && grades.includes(next) ? next : c.grade,
    toSection: (c.section?.trim() || "A").slice(0, 10),
    classTeacherId: null,
  };
}

export function LmsRolloverManager() {
  const [data, setData] = useState<RolloverData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [step, setStep] = useState(1);
  const [year, setYear] = useState("");
  const [plans, setPlans] = useState<Record<number, ClassPlan>>({});
  const [exceptions, setExceptions] = useState<Record<number, ExceptionMode>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [confirmText, setConfirmText] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RolloverResult | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  /* v2.8.64.0 — the undo-the-last-rollover card. */
  const [undoPreview, setUndoPreview] = useState<UndoPreview | null>(null);
  const [undoConfirm, setUndoConfirm] = useState("");
  const [undoRestore, setUndoRestore] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoResult, setUndoResult] = useState<UndoResult | null>(null);

  /* Load the workspace once (retry bumps reloadKey and clears the error).
     The snapshot is deliberately kept after a run — "Run again" replans the
     SAME year so an idempotent rerun is always the path of least resistance. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/lms/rollover", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        if (!cancelled) setLoadError(true);
        return;
      }
      const payload = (await res.json()) as RolloverData;
      if (cancelled) return;
      setData(payload);
      setYear(payload.targetYear || "");
      const nextPlans: Record<number, ClassPlan> = {};
      for (const c of payload.classes) {
        if (c.academicYear === payload.currentYear) {
          nextPlans[c.id] = defaultPlan(c, payload.grades);
        }
      }
      setPlans(nextPlans);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5200);
    return () => clearTimeout(t);
  }, [notice]);

  /* v2.8.64.1 — narrowed alias: TS property-narrowing on `data.lastRollover`
     cannot survive the `undoResult ||` guard in the undo card below, so every
     access goes through this local (identical values, type-safe JSX). */
  const lastRollover = data?.lastRollover ?? null;

  /* v2.8.64.0 — when the last run's target classes still exist, fetch the
     honest undo preview (how many rows would move back, any blockers). */
  const undoYear = lastRollover?.classesStillThere ? lastRollover.targetYear : "";
  useEffect(() => {
    if (!undoYear) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/lms/rollover/undo?year=${encodeURIComponent(undoYear)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = (await res.json()) as UndoPreview;
      if (!cancelled) setUndoPreview(payload);
    })();
    return () => {
      cancelled = true;
    };
  }, [undoYear, reloadKey]);

  /* Derived workspace — source classes of the current (max) academic year. */
  const source = useMemo(() => {
    if (!data) return [];
    return data.classes.filter((c) => c.academicYear === data.currentYear);
  }, [data]);

  const grouped = useMemo(() => {
    const byGrade = new Map<string, RolloverClass[]>();
    for (const c of source) {
      const list = byGrade.get(c.grade) ?? [];
      list.push(c);
      byGrade.set(c.grade, list);
    }
    return [...byGrade.entries()]
      .sort((a, b) => gradeRank(a[0]) - gradeRank(b[0]))
      .map(([grade, classes]) => ({
        grade,
        classes: classes.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true })),
      }));
  }, [source]);

  const studentsByClass = useMemo(() => {
    const map = new Map<number, RolloverStudent[]>();
    for (const s of data?.students ?? []) {
      const list = map.get(s.classId) ?? [];
      list.push(s);
      map.set(s.classId, list);
    }
    return map;
  }, [data]);

  const planList = useMemo(
    () => source.map((c) => plans[c.id]).filter((p): p is ClassPlan => !!p),
    [source, plans],
  );

  /* Grades that will have a NEW class in the plan — "repeat" destinations. */
  const promoteTargetGrades = useMemo(
    () => new Set(planList.filter((p) => p.action === "promote" && p.toGrade).map((p) => p.toGrade)),
    [planList],
  );

  const step2Complete = planList.every(
    (p) => p.action !== "promote" || (p.toGrade.trim() !== "" && p.toSection.trim() !== ""),
  );

  const targetYear = year.trim();

  const runCounts = useMemo(() => {
    let promote = 0;
    let graduate = 0;
    for (const c of source) {
      const plan = plans[c.id];
      if (!plan) continue;
      for (const s of studentsByClass.get(c.id) ?? []) {
        const ex = exceptions[s.studentId];
        if (ex) continue;
        if (plan.action === "promote") promote += 1;
        else graduate += 1;
      }
    }
    let repeat = 0;
    let left = 0;
    for (const mode of Object.values(exceptions)) {
      if (mode === "repeat") repeat += 1;
      else left += 1;
    }
    return { promote, graduate, repeat, left, total: promote + graduate + repeat + left };
  }, [source, plans, exceptions, studentsByClass]);

  const targetPreview = useMemo(() => {
    const planned = new Set(
      planList
        .filter((p) => p.action === "promote" && p.toGrade.trim() && p.toSection.trim())
        .map((p) => `${p.toGrade}-${p.toSection}`.toLowerCase()),
    );
    const existing = new Set(
      (data?.classes ?? [])
        .filter((c) => c.academicYear === targetYear)
        .map((c) => c.name.toLowerCase()),
    );
    let create = 0;
    for (const name of planned) if (!existing.has(name)) create += 1;
    return { planned: planned.size, create, reuse: planned.size - create };
  }, [planList, data, targetYear]);

  const setPlan = (fromClassId: number, patch: Partial<ClassPlan>) => {
    setPlans((prev) => {
      const current = prev[fromClassId];
      if (!current) return prev;
      return { ...prev, [fromClassId]: { ...current, ...patch } };
    });
  };

  const setException = (studentId: number, mode: ExceptionMode | null) => {
    setExceptions((prev) => {
      const next = { ...prev };
      if (mode === null) delete next[studentId];
      else next[studentId] = mode;
      return next;
    });
  };

  const run = async () => {
    if (!data || running) return;
    setRunning(true);
    setNotice(null);
    setUndoResult(null); // a fresh run clears the previous undo's panel
    try {
      const payload = {
        targetYear,
        classes: planList.map((p) => ({
          fromClassId: p.fromClassId,
          action: p.action,
          ...(p.action === "promote"
            ? {
                toGrade: p.toGrade,
                toSection: p.toSection,
                ...(p.classTeacherId ? { classTeacherId: p.classTeacherId } : {}),
              }
            : {}),
        })),
        students: Object.entries(exceptions).flatMap(([sid, mode]) => {
          const student = data.students.find((s) => s.studentId === Number(sid));
          if (!student) return [];
          return [{ studentId: student.studentId, fromClassId: student.classId, mode }];
        }),
      };
      const res = await fetch("/api/admin/lms/rollover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as RolloverResult & { error?: string };
      if (res.ok && body.ok) {
        setResult(body);
        setNotice({ kind: "ok", text: `Rollover to ${body.targetYear} completed.` });
      } else {
        setNotice({ kind: "error", text: body.error ?? "The rollover run failed." });
      }
    } catch {
      setNotice({ kind: "error", text: "Could not reach the server — nothing was changed." });
    } finally {
      setRunning(false);
    }
  };

  const runAgain = () => {
    setResult(null);
    setExceptions({});
    setExpanded({});
    setConfirmText("");
    setConfirmChecked(false);
    setStep(1);
  };

  /* v2.8.64.0 — reverse the last rollover run for its target year. */
  const runUndo = async () => {
    if (!lastRollover || undoBusy) return;
    const targetYear = lastRollover.targetYear;
    setUndoBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/lms/rollover/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetYear, restoreLeavers: undoRestore }),
      });
      const body = (await res.json().catch(() => ({}))) as UndoResult & { error?: string };
      if (res.ok && body.ok) {
        setUndoResult(body);
        setNotice({ kind: "ok", text: `The ${body.targetYear} rollover was undone.` });
        setReloadKey((k) => k + 1); // fresh workspace — the year rolls back
      } else {
        setNotice({ kind: "error", text: body.error ?? "The undo failed — nothing was changed." });
      }
    } catch {
      setNotice({ kind: "error", text: "Could not reach the server — nothing was changed." });
    } finally {
      setUndoBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-stone-200 bg-white text-[13.5px] text-stone-500">
        {loadError ? (
          <>
            Could not load the rollover workspace.
            <button
              onClick={() => {
                setLoadError(false);
                setReloadKey((k) => k + 1);
              }}
              className={btnPrimary}
            >
              <RotateCcw size={14} /> Retry
            </button>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin" size={16} /> Loading the rollover workspace…
          </>
        )}
      </div>
    );
  }

  const totalStudents = source.reduce((sum, c) => sum + c.roll, 0);

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <ol className="flex gap-1.5 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1.5">
        {STEPS.map((s) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <li key={s.n} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => (s.n < step ? setStep(s.n) : undefined)}
                disabled={s.n > step}
                aria-current={active ? "step" : undefined}
                className={`flex h-9 w-full items-center justify-center gap-2 rounded-lg px-2 text-[12.5px] font-medium transition ${
                  active
                    ? "bg-stone-900 text-white"
                    : done
                      ? "text-stone-700 hover:bg-stone-100"
                      : "text-stone-400"
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                    active ? "bg-white/20 text-white" : done ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {s.n}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-[13px] ${
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* ── v2.8.64.0 — Undo the last rollover (the "ran it too early" card).
          Visible while the last run's target-year classes still exist, and
          after an undo until the next run so the owner can read the result. */}
      {(undoResult || (lastRollover && lastRollover.classesStillThere > 0)) && lastRollover && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-red-700">
            <AlertTriangle size={16} /> Undo the last rollover
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-red-600">
            Last run{" "}
            {new Date(lastRollover.at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}{" "}
            → <b>{lastRollover.targetYear}</b>: {lastRollover.moved} promoted,{" "}
            {lastRollover.graduated} graduated, {lastRollover.classesCreated} classes
            created. Ran it before the year actually ended? Undo puts everything back.
          </p>

          {undoResult ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-800">
                <CheckCircle2 size={15} /> The {undoResult.targetYear} rollover was undone
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Students moved back", undoResult.movedBack],
                  ["Leavers restored", undoResult.reactivated],
                  ["Subject copies removed", undoResult.subjectsDeleted],
                  ["Classes deleted", undoResult.classesDeleted],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg bg-white/70 px-3 py-2">
                    <p className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-700">
                      {label}
                    </p>
                    <p className="font-display text-lg font-semibold text-emerald-900">{value}</p>
                  </div>
                ))}
              </div>
              {undoResult.classesKept.length > 0 && (
                <p className="mt-2.5 text-[12px] leading-relaxed text-emerald-800">
                  <b>Kept (still have content):</b> {undoResult.classesKept.join(", ")}
                </p>
              )}
              <p className="mt-2 text-[12px] text-emerald-700">
                Teachers&apos; dashboards now show the old-year classes again — reload their pages
                to see it.
              </p>
            </div>
          ) : undoPreview?.blockedReason ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
              <p className="text-[12.5px] leading-relaxed text-amber-800">
                <b>Cannot undo automatically:</b> {undoPreview.blockedReason}
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <ul className="space-y-1 text-[12.5px] leading-relaxed text-red-600">
                <li>
                  • Moves the {undoPreview?.activeRowsToMoveBack ?? lastRollover.moved}{" "}
                  student{undoPreview?.activeRowsToMoveBack === 1 ? "" : "s"} now sitting in{" "}
                  {lastRollover.targetYear} classes back to their{" "}
                  {undoPreview?.prevYear || Number(lastRollover.targetYear) - 1} classes.
                </li>
                {lastRollover.restoreCount > 0 && (
                  <li>
                    • Can re-activate the {lastRollover.restoreCount} graduated/left
                    student{lastRollover.restoreCount === 1 ? "" : "s"} this run created —
                    tick the box below.
                  </li>
                )}
                <li>
                  • Removes the copied teaching assignments and deletes the empty{" "}
                  {lastRollover.targetYear} classes.
                </li>
              </ul>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={undoConfirm}
                  onChange={(e) => setUndoConfirm(e.target.value)}
                  placeholder={`Type ${lastRollover.targetYear} to confirm`}
                  className={`${inputCls} w-full sm:w-56`}
                  aria-label={`Type ${lastRollover.targetYear} to confirm the undo`}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {lastRollover.restoreCount > 0 && (
                    <label className="flex min-h-11 items-center gap-2 text-[12.5px] text-red-700">
                      <input
                        type="checkbox"
                        checked={undoRestore}
                        onChange={(e) => setUndoRestore(e.target.checked)}
                        className="h-4 w-4 accent-red-600"
                      />
                      Also re-activate {lastRollover.restoreCount} graduated/left student
                      {lastRollover.restoreCount === 1 ? "" : "s"}
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={runUndo}
                  disabled={
                    undoBusy ||
                    undoConfirm.trim() !== lastRollover.targetYear ||
                    !undoPreview ||
                    !!undoPreview.blockedReason
                  }
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-[13px] font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {undoBusy ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Undoing…
                    </>
                  ) : (
                    <>
                      <RotateCcw size={15} /> Undo the {lastRollover.targetYear} rollover
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 1 — new academic year ─────────────────────────────────── */}
      {step === 1 && (
        <div className={`${card} space-y-4 p-5`}>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-stone-700">
            <CalendarRange size={16} className="text-stone-400" /> New academic year
          </div>
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-stone-600">
            Every class of <b>{data.currentYear || "—"}</b> moves into the year below: students are
            promoted into new classes, grade-11 and grade-13 leavers graduate after O/L and A/L,
            and each new class gets the class teacher you pick. Old-year class rows keep their
            history and quietly empty out of the teachers&apos; lists.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-stone-500">
              Target academic year
            </span>
            <input
              value={year}
              onChange={(e) => setYear(e.target.value.slice(0, 9))}
              maxLength={9}
              inputMode="numeric"
              className="h-14 w-40 rounded-xl border border-stone-300 bg-white text-center font-display text-2xl font-semibold text-stone-900 outline-none focus:border-stone-500"
              aria-label="Target academic year"
            />
          </label>
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <span className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
              {source.length} classes in {data.currentYear || "—"}
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-1.5 text-stone-700">
              {totalStudents} enrolled students
            </span>
            {targetYear && (
              <span className="rounded-full bg-stone-900 px-3 py-1.5 font-semibold text-white">
                {data.currentYear || "—"} → {targetYear}
              </span>
            )}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!targetYear || source.length === 0}
              className={btnPrimary}
            >
              Plan the classes <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 — plan the classes ──────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
            <p className="max-w-xl text-[13px] leading-relaxed text-stone-600">
              Grade 11 classes default to <b>Graduate (end of O/L)</b> and grade 13 to{" "}
              <b>Graduate (end of A/L)</b>; every other class promotes one grade up with the same
              section name. Adjust anything — a target that already exists in {targetYear} is
              reused, not duplicated.
            </p>
            {!step2Complete && (
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-red-600">
                <AlertTriangle size={14} /> Every promote row needs a target grade and section.
              </p>
            )}
          </div>

          {grouped.length === 0 && (
            <div className={`${card} p-6 text-center text-[13.5px] text-stone-500`}>
              No classes in {data.currentYear || "—"} — create them in LMS Setup first.
            </div>
          )}

          {grouped.map(({ grade, classes }) => (
            <section key={grade} className={card}>
              <h3 className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 text-[13px] font-semibold text-stone-800">
                <GraduationCap size={15} className="text-stone-400" />
                Grade {grade}
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
                  {classes.length} {classes.length === 1 ? "class" : "classes"}
                </span>
              </h3>
              {classes.map((c) => {
                const plan = plans[c.id];
                if (!plan) return null;
                const incomplete = plan.action === "promote" && (!plan.toGrade.trim() || !plan.toSection.trim());
                return (
                  <div
                    key={c.id}
                    className={`flex flex-col gap-3 border-t border-stone-100 p-4 md:flex-row md:items-center ${
                      incomplete ? "bg-red-50/50" : ""
                    }`}
                  >
                    <div className="min-w-0 md:w-56 md:shrink-0">
                      <p className="flex items-center gap-1.5 text-[14px] font-semibold text-stone-800">
                        {c.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-stone-500">
                        {c.roll} {c.roll === 1 ? "student" : "students"} ·{" "}
                        {c.classTeacherName ?? "no class teacher"}
                      </p>
                    </div>

                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <select
                        value={plan.action}
                        onChange={(e) =>
                          setPlan(c.id, { action: e.target.value === "graduate" ? "graduate" : "promote" })
                        }
                        className={`${inputCls} sm:w-56`}
                        aria-label={`Action for ${c.name}`}
                      >
                        <option value="promote">
                          {`Promote → ${plan.toGrade || "?"}-${plan.toSection || "…"}`}
                        </option>
                        <option value="graduate">
                          {grade === "11"
                            ? "Graduate — end of O/L"
                            : grade === "13"
                              ? "Graduate — end of A/L"
                              : "Graduate"}
                        </option>
                      </select>

                      {plan.action === "promote" && (
                        <>
                          <select
                            value={plan.toGrade}
                            onChange={(e) => setPlan(c.id, { toGrade: e.target.value })}
                            className={`${inputCls} w-28 ${incomplete && !plan.toGrade.trim() ? "border-red-300" : ""}`}
                            aria-label={`Target grade for ${c.name}`}
                          >
                            {data.grades.map((g) => (
                              <option key={g} value={g}>
                                Grade {g}
                              </option>
                            ))}
                          </select>
                          <input
                            value={plan.toSection}
                            onChange={(e) => setPlan(c.id, { toSection: e.target.value.slice(0, 10) })}
                            maxLength={10}
                            placeholder="Section"
                            className={`${inputCls} w-28 ${incomplete && !plan.toSection.trim() ? "border-red-300" : ""}`}
                            aria-label={`Target section for ${c.name}`}
                          />
                          <select
                            value={plan.classTeacherId ?? ""}
                            onChange={(e) =>
                              setPlan(c.id, {
                                classTeacherId: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className={`${inputCls} min-w-0 flex-1`}
                            aria-label={`Class teacher for the new ${plan.toGrade}-${plan.toSection} class`}
                          >
                            <option value="">— no class teacher yet —</option>
                            {data.staff.map((s) => (
                              <option key={s.lmsTeacherId} value={s.lmsTeacherId}>
                                {s.fullName} ({s.teacherId})
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setStep(1)} className={btnNeutral}>
              Back
            </button>
            <button onClick={() => setStep(3)} disabled={!step2Complete} className={btnPrimary}>
              Student exceptions <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 — student exceptions ────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className={`${card} p-4`}>
            <p className="max-w-2xl text-[13px] leading-relaxed text-stone-600">
              Everyone follows their class&apos;s plan by default. Open a class to pull individual
              students out of it — <b>Repeat</b> keeps them in the same grade (only possible when
              the plan creates a new class for that grade) and <b>Left school</b> marks the
              enrollment as a leaver.
            </p>
          </div>

          {source.map((c) => {
            const list = studentsByClass.get(c.id) ?? [];
            const exceptionsHere = list.filter((s) => exceptions[s.studentId]).length;
            const open = !!expanded[c.id];
            return (
              <section key={c.id} className={card}>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold text-stone-800">
                    {open ? (
                      <ChevronDown size={15} className="shrink-0 text-stone-400" />
                    ) : (
                      <ChevronRight size={15} className="shrink-0 text-stone-400" />
                    )}
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[12px] text-stone-500">
                    {list.length} {list.length === 1 ? "student" : "students"} · {exceptionsHere}{" "}
                    {exceptionsHere === 1 ? "exception" : "exceptions"}
                  </span>
                </button>

                {open && (
                  <div className="max-h-72 overflow-y-auto border-t border-stone-100">
                    {list.length === 0 && (
                      <p className="px-4 py-3 text-[12.5px] text-stone-400">No students enrolled.</p>
                    )}
                    {list.map((s) => {
                      const mode = exceptions[s.studentId];
                      const repeatReady = promoteTargetGrades.has(c.grade);
                      return (
                        <div
                          key={s.studentId}
                          className="flex flex-col gap-2 border-b border-stone-50 px-4 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <p className="min-w-0 text-[13px] text-stone-700">
                            <span className="font-medium text-stone-800">{s.fullName}</span>
                            <span className="ml-2 text-[11.5px] text-stone-400">{s.admissionNo}</span>
                          </p>
                          <select
                            value={mode ?? ""}
                            onChange={(e) =>
                              setException(
                                s.studentId,
                                e.target.value === "repeat"
                                  ? "repeat"
                                  : e.target.value === "left"
                                    ? "left"
                                    : null,
                              )
                            }
                            className={`${inputCls} h-9 w-full py-0 text-[12.5px] sm:w-64`}
                            aria-label={`Plan for ${s.fullName}`}
                          >
                            <option value="">
                              {plans[c.id]?.action === "graduate"
                                ? "Follow class — graduate"
                                : "Follow class — promote"}
                            </option>
                            <option value="repeat" disabled={!repeatReady}>
                              {repeatReady
                                ? `Repeat Grade ${c.grade}`
                                : `Repeat Grade ${c.grade} — no new Grade ${c.grade} class in the plan`}
                            </option>
                            <option value="left">Left school</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setStep(2)} className={btnNeutral}>
              Back
            </button>
            <button onClick={() => setStep(4)} className={btnPrimary}>
              Review &amp; run <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4 — run ───────────────────────────────────────────────── */}
      {step === 4 && !result && (
        <div className="space-y-4">
          <div className={`${card} space-y-4 p-5`}>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-stone-700">
              <Play size={15} className="text-stone-400" /> Ready to roll over to {targetYear}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["Classes to create", targetPreview.create],
                ["Classes reused", targetPreview.reuse],
                ["Promoted", runCounts.promote],
                ["Graduated", runCounts.graduate],
                ["Repeating", runCounts.repeat],
                ["Left school", runCounts.left],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-stone-50 px-3 py-2.5">
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-stone-500">
                    {label}
                  </p>
                  <p className="font-display text-xl font-semibold text-stone-900">{value}</p>
                </div>
              ))}
            </div>

            {targetPreview.reuse > 0 && (
              <p className="text-[12.5px] text-stone-500">
                {targetPreview.reuse} target {targetPreview.reuse === 1 ? "class already exists" : "classes already exist"} in{" "}
                {targetYear} and will be reused as-is.
              </p>
            )}

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800">
                <AlertTriangle size={15} /> This moves {runCounts.total}{" "}
                {runCounts.total === 1 ? "student" : "students"} in one transaction.
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-amber-700">
                Enrollments update immediately: students land in their new-year classes, leavers
                are marked, and teachers&apos; old class lists empty out. Nothing is deleted.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type PROMOTE to confirm"
                className={`${inputCls} w-full sm:w-56`}
                aria-label="Type PROMOTE to confirm the rollover"
              />
              <label className="flex min-h-11 items-center gap-2 text-[12.5px] text-stone-600">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="h-4 w-4 accent-stone-900"
                />
                I understand this moves {runCounts.total}{" "}
                {runCounts.total === 1 ? "student" : "students"}
              </label>
            </div>
          </div>

          {runCounts.total === 0 && (
            <div className={`${card} p-4 text-[13px] text-stone-500`}>
              No students will move — every class is either empty or every student has no plan.
              You can still run to create the new-year classes.
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button onClick={() => setStep(3)} disabled={running} className={btnNeutral}>
              Back
            </button>
            <button
              onClick={run}
              disabled={running || !(confirmText.trim() === "PROMOTE" || confirmChecked)}
              className={btnPrimary}
            >
              {running ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Running the rollover…
                </>
              ) : (
                <>
                  <Play size={15} /> Run the rollover
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────── */}
      {step === 4 && result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-emerald-800">
              <CheckCircle2 size={17} /> Rollover to {result.targetYear} completed
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Classes created", result.classesCreated.length],
                ["Classes reused", result.classesReused.length],
                ["Promoted", result.moved],
                ["Graduated", result.graduated],
                ["Repeating", result.repeated],
                ["Left school", result.left],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-white/70 px-3 py-2.5">
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-emerald-700">
                    {label}
                  </p>
                  <p className="font-display text-xl font-semibold text-emerald-900">{value}</p>
                </div>
              ))}
            </div>
            {result.alreadyMoved > 0 && (
              <p className="mt-3 text-[12.5px] text-emerald-700">
                {result.alreadyMoved} {result.alreadyMoved === 1 ? "student was" : "students were"}{" "}
                already in a {result.targetYear} class and were skipped — reruns never duplicate.
              </p>
            )}
            {result.classesCreated.length > 0 && (
              <p className="mt-3 text-[12.5px] leading-relaxed text-emerald-800">
                <b>Created:</b> {result.classesCreated.map((c) => c.name).join(", ")}
              </p>
            )}
            {result.classesReused.length > 0 && (
              <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-800">
                <b>Reused:</b> {result.classesReused.join(", ")}
              </p>
            )}
          </div>

          <div className={`${card} p-4 text-[12.5px] leading-relaxed text-stone-500`}>
            Next steps: hand out the new classes&apos; teaching assignments in LMS Setup if you did
            not pick class teachers here, and reload this page when you are ready to plan the NEXT
            academic year. Rerunning the same plan is safe — already-moved students are skipped.
          </div>

          <div className="flex justify-end">
            <button onClick={runAgain} className={btnPrimary}>
              <RotateCcw size={15} /> Run again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
