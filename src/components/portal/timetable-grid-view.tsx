import { MapPin } from "lucide-react";
import { TIMETABLE_DAYS, TIMETABLE_PERIODS } from "@/lib/timetable-shared";

/**
 * PHASE 3.1 (v2.8.54.0) — the ONE week-grid renderer shared by the teacher
 * editor (interactive cells) and the student's read-only page (static).
 * Pure presentational: no hooks, no state — safe inside both server and
 * client trees.
 *
 * - Column per weekday (Mon–Fri), row per period (1–8).
 * - `highlightDay` tints today's column (Asia/Colombo day, computed by the
 *   caller — the server pages, so SSR and client never disagree).
 * - `myTeacherId` rings the signed-in teacher's own lessons gold.
 * - `onCellTap` turns every cell into a button (the editor). Without it the
 *   grid renders plain cells (the student view).
 */

export type GridSlot = {
  dayOfWeek: number;
  periodNo: number;
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string | null;
  teacherId?: number | null;
  room: string | null;
  /** v2.8.55.0 — the free-text name for subject-less (custom) periods. */
  customLabel?: string | null;
  /** v2.8.55.0 — a small second line for the personal teaching week (the
      class the period belongs to). Hidden when absent. */
  contextLabel?: string | null;
};

export type ActiveCell = { day: number; period: number } | null;

function subjectLabel(slot: GridSlot): string {
  return (
    slot.subjectName ||
    slot.subjectCode ||
    slot.customLabel ||
    "Lesson"
  );
}

export function TimetableGridView({
  slots,
  highlightDay,
  myTeacherId,
  onCellTap,
  activeCell,
  cellBusy,
  editable = false,
}: {
  slots: GridSlot[];
  highlightDay?: number | null;
  myTeacherId?: number | null;
  onCellTap?: (day: number, period: number) => void;
  activeCell?: ActiveCell;
  cellBusy?: ActiveCell;
  editable?: boolean;
}) {
  const byKey = new Map<string, GridSlot>();
  for (const slot of slots) byKey.set(`${slot.dayOfWeek}-${slot.periodNo}`, slot);

  return (
    <div className="pt-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
      <table className="w-full min-w-[620px] border-separate border-spacing-1 text-left">
        <caption className="sr-only">
          Class timetable — weekdays as columns, periods as rows
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="w-12 rounded-xl bg-[var(--pt-panel-soft)] px-2 py-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]"
            >
              <span aria-hidden="true">Prd</span>
              <span className="sr-only">Period</span>
            </th>
            {TIMETABLE_DAYS.map((day) => {
              const isToday = highlightDay === day.dow;
              return (
                <th
                  key={day.dow}
                  scope="col"
                  className={`rounded-xl px-2 py-2 text-center text-[11.5px] font-semibold ${
                    isToday
                      ? "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]"
                      : "bg-[var(--pt-panel-soft)] text-[var(--pt-muted)]"
                  }`}
                >
                  <span className="hidden sm:inline">{day.label}</span>
                  <span className="sm:hidden">{day.short}</span>
                  {isToday ? (
                    <span className="ml-1.5 rounded-full bg-[var(--pt-accent)] px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-[var(--pt-on-accent)]">
                      Today
                    </span>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {TIMETABLE_PERIODS.map((period) => (
            <tr key={period}>
              <th
                scope="row"
                className="rounded-xl bg-[var(--pt-panel-soft)] px-2 py-2 text-center text-[12px] font-bold text-[var(--pt-muted)]"
              >
                {period}
              </th>
              {TIMETABLE_DAYS.map((day) => {
                const slot = byKey.get(`${day.dow}-${period}`);
                const isActive = activeCell?.day === day.dow && activeCell.period === period;
                const isBusy = cellBusy?.day === day.dow && cellBusy.period === period;
                const isMine =
                  myTeacherId != null && slot?.teacherId === myTeacherId;
                const base =
                  "min-h-[52px] rounded-xl border px-2 py-1.5 align-top text-left transition-colors duration-200";
                const look = isActive
                  ? "border-[var(--pt-accent)] bg-[var(--pt-accent-soft)]"
                  : slot
                    ? isMine
                      ? "border-[rgb(234_179_8/0.45)] bg-[var(--pt-chip)]"
                      : "border-[var(--pt-border)] bg-[var(--pt-panel-soft)]"
                    : "border-dashed border-[var(--pt-border)] bg-transparent";
                const inner = slot ? (
                  <>
                    <span className="block truncate text-[12px] font-semibold leading-tight text-[var(--pt-heading)]">
                      {subjectLabel(slot)}
                    </span>
                    {slot.contextLabel ? (
                      <span className="block truncate text-[10.5px] font-medium leading-tight text-[var(--pt-accent-text)]">
                        {slot.contextLabel}
                      </span>
                    ) : null}
                    {slot.teacherName ? (
                      <span className="block truncate text-[10.5px] leading-tight text-[var(--pt-muted)]">
                        {slot.teacherName}
                      </span>
                    ) : null}
                    {slot.room ? (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--pt-body)]">
                        <MapPin size={9} aria-hidden="true" />
                        {slot.room}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="block text-[11px] text-[var(--pt-faint)]">
                    {editable ? "+ add" : "Free"}
                  </span>
                );

                if (onCellTap) {
                  return (
                    <td key={day.dow} className="p-0">
                      <button
                        type="button"
                        onClick={() => onCellTap(day.dow, period)}
                        aria-label={
                          slot
                            ? `${day.label} period ${period}: ${subjectLabel(slot)}${
                                slot.teacherName ? ` with ${slot.teacherName}` : ""
                              } — edit`
                            : `${day.label} period ${period} is free — add a lesson`
                        }
                        aria-pressed={isActive}
                        disabled={isBusy}
                        className={`${base} ${look} w-full cursor-pointer text-left hover:border-[var(--pt-border-strong)] hover:bg-[var(--pt-chip)] disabled:opacity-60`}
                      >
                        {inner}
                      </button>
                    </td>
                  );
                }
                return (
                  <td key={day.dow} className={`${base} ${look}`}>
                    {inner}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
