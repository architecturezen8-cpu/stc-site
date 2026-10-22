/**
 * PHASE 3.1 (v2.8.54.0) — client-safe timetable constants.
 *
 * The week shape (Mon–Fri × periods 1–8) is shared by the server lib
 * (validation + queries), the shared grid renderer and the teacher editor
 * island — so it lives here, WITHOUT the server-only import, and the server
 * module re-exports it as its single source of truth.
 */

export const TIMETABLE_DAYS = [
  { dow: 1, label: "Monday", short: "Mon" },
  { dow: 2, label: "Tuesday", short: "Tue" },
  { dow: 3, label: "Wednesday", short: "Wed" },
  { dow: 4, label: "Thursday", short: "Thu" },
  { dow: 5, label: "Friday", short: "Fri" },
] as const;

/** Periods the editor offers. The seeded demo grid uses 1–4; the grid
    renders 1–8 so a class can grow into a fuller school day. */
export const TIMETABLE_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const TIMETABLE_MIN_PERIOD = TIMETABLE_PERIODS[0];
export const TIMETABLE_MAX_PERIOD = TIMETABLE_PERIODS[TIMETABLE_PERIODS.length - 1];

export const TIMETABLE_ROOM_MAX = 60;

/** v2.8.55.0 — the CUSTOM period label ("Outside Activity", "Assembly"…).
    A slot can now carry a free-text name instead of a subject. */
export const TIMETABLE_CUSTOM_MAX = 60;
