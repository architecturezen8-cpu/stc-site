/**
 * Site cinematic preloader — settings contract.
 * Lives OUTSIDE the client component so server components (root layout)
 * can import the defaults and the normalizer as real values: exporting
 * plain objects/functions from a "use client" module only yields opaque
 * client references on the server, never the actual data.
 */

export type OpeningScene = "logo" | "title" | "final";

export type PreloaderSettings = {
  enabled: string;
  logo: string;
  logoScale: string;
  title: string;
  motto: string;
  lines: string;
  /** Text size scales (percent as string) — admin sliders, 100 = default. */
  titleScale: string;
  mottoScale: string;
  linesScale: string;
  hold: string;
  progress: string;
  whiteCircle: string;
  circleScale: string;
  circleRing: string;
  barWidth: string;
  /* v2.8.93.0 — per-device overrides (Task 97, G13): "" = inherit the
     shared value, so existing settings behave exactly as before. */
  mobileLogoScale: string;
  mobileBarWidth: string;
  exit: string;
  frequency: string;
  /** Network round loader shown when a navigation is still in flight. */
  routeLoader: string;
};

/* Short, sharp sentences — the user asked for brief professional lines,
   exactly three, cycling one after another while the bar fills. */
export const PRELOADER_DEFAULTS: PreloaderSettings = {
  enabled: "true",
  logo: "",
  logoScale: "100",
  title: "St. Thomas' College Matale",
  motto: "Animo Et Fide",
  lines: "Courage and faith since 1873\nShaping scholars of character\nA leading boys' school in Matale",
  titleScale: "100",
  mottoScale: "100",
  linesScale: "100",
  hold: "2600",
  progress: "true",
  whiteCircle: "true",
  circleScale: "100",
  circleRing: "true",
  barWidth: "100",
  mobileLogoScale: "",
  mobileBarWidth: "",
  exit: "fade",
  frequency: "session",
  routeLoader: "true",
};

const LEGACY = {
  title: "St. Thomas' College",
  exit: "curtain",
  hold: "3400",
  lines:
    "Shaping scholars of uncommon character since 1873\nAnimo Et Fide — with courage and faith\nA tradition of learning, faith and service",
};

/**
 * One-time migration for settings saved by a previous preloader: values
 * that exactly match the OLD defaults are upgraded to the new opening's
 * defaults, deliberate admin choices pass through untouched.
 */
export function normalizePreloaderSettings(
  raw: Partial<Record<keyof PreloaderSettings, string>> | undefined,
): PreloaderSettings {
  const s = { ...PRELOADER_DEFAULTS };
  if (!raw) return s;
  if (typeof raw.enabled === "string") s.enabled = raw.enabled;
  if (typeof raw.logo === "string") s.logo = raw.logo;
  if (raw.logoScale && raw.logoScale !== "100") s.logoScale = raw.logoScale;
  if (raw.title && raw.title !== LEGACY.title) s.title = raw.title;
  if (typeof raw.motto === "string" && raw.motto) s.motto = raw.motto;
  if (typeof raw.lines === "string" && raw.lines.trim() && raw.lines !== LEGACY.lines) {
    s.lines = raw.lines;
  }
  if (raw.titleScale && raw.titleScale !== "100") s.titleScale = raw.titleScale;
  if (raw.mottoScale && raw.mottoScale !== "100") s.mottoScale = raw.mottoScale;
  if (raw.linesScale && raw.linesScale !== "100") s.linesScale = raw.linesScale;
  if (raw.hold && raw.hold !== LEGACY.hold) s.hold = raw.hold;
  if (typeof raw.progress === "string") s.progress = raw.progress;
  if (typeof raw.whiteCircle === "string") s.whiteCircle = raw.whiteCircle;
  if (typeof raw.circleScale === "string" && raw.circleScale) s.circleScale = raw.circleScale;
  if (typeof raw.circleRing === "string") s.circleRing = raw.circleRing;
  if (typeof raw.barWidth === "string" && raw.barWidth) s.barWidth = raw.barWidth;
  /* v2.8.93.0 — per-device overrides: "" (inherit) passes through too. */
  if (typeof raw.mobileLogoScale === "string") s.mobileLogoScale = raw.mobileLogoScale;
  if (typeof raw.mobileBarWidth === "string") s.mobileBarWidth = raw.mobileBarWidth;
  if (raw.exit && raw.exit !== LEGACY.exit) s.exit = raw.exit;
  if (typeof raw.frequency === "string" && raw.frequency) s.frequency = raw.frequency;
  if (typeof raw.routeLoader === "string") s.routeLoader = raw.routeLoader;
  return s;
}

/** Clamped helpers shared by the renderer and the admin sliders. */
export function circleScaleFactor(value: string | number | undefined): number {
  const n = Number(value);
  return Math.min(200, Math.max(60, Number.isFinite(n) && n > 0 ? n : 100)) / 100;
}

/** Text size scale — percent string → clamped multiplier (min ≤ 100 ≤ max). */
export function textScaleFactor(
  value: string | number | undefined,
  min: number,
  max: number,
): number {
  const n = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) && n > 0 ? n : 100)) / 100;
}

export function barWidthPercent(value: string | number | undefined): number {
  const n = Number(value);
  return Math.min(100, Math.max(40, Number.isFinite(n) && n > 0 ? n : 100));
}
