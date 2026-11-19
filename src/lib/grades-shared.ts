/**
 * v2.8.56.0 — PHASE 3.2: Sri Lankan grade letters beside every mark.
 *
 * The bands the school uses (the owner's approved roadmap):
 *   A = 75+   B = 65–74   C = 55–64   S = 35–54   W = <35
 *
 * CLIENT-SAFE by design (mirrors timetable-shared.ts): pure math, no
 * "server-only" import — the same helper is used by the server payloads
 * AND by every client island (live letter preview while a teacher types).
 * One function, one truth: no page can drift into its own bands.
 */

export const GRADE_A_MIN = 75;
export const GRADE_B_MIN = 65;
export const GRADE_C_MIN = 55;
export const GRADE_S_MIN = 35;

export type GradeLetter = "A" | "B" | "C" | "S" | "W";

/** The letter for a percentage (0–100+). */
export function gradeForPct(pct: number): GradeLetter {
  if (pct >= GRADE_A_MIN) return "A";
  if (pct >= GRADE_B_MIN) return "B";
  if (pct >= GRADE_C_MIN) return "C";
  if (pct >= GRADE_S_MIN) return "S";
  return "W";
}

/** Rounded percentage of a score against its maximum (0-safe). */
export function pctForScore(score: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((score / max) * 100);
}

/** The letter for a raw score against its maximum. */
export function gradeForScore(score: number, max: number): GradeLetter {
  return gradeForPct(pctForScore(score, max));
}

/** One-line legend for headers — shown wherever marks are entered. */
export const GRADE_LEGEND = "A 75+ · B 65–74 · C 55–64 · S 35–54 · W <35";

/**
 * Chip colour per letter — follows the portal's existing three-tier
 * mark colours (good / warn / danger) so every letter chip reads the
 * same on every page: A green, B–C amber, S–W red.
 */
export function gradeChipClass(letter: GradeLetter): string {
  switch (letter) {
    case "A":
      return "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]";
    case "B":
    case "C":
      return "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]";
    default:
      return "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]";
  }
}
