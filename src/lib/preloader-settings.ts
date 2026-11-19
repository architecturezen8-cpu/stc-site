/**
 * Site cinematic preloader — settings contract.
 * Lives OUTSIDE the client component so server components (root layout)
 * can import the defaults and the normalizer as real values: exporting
 * plain objects/functions from a "use client" module only yields opaque
 * client references on the server, never the actual data.
 *
 * v2.9.15.17 — THE OPENING CONTROL ROOM (owner: "admin eke thiyenne ape
 * parana preloader eka adjust karana setings ne thama. eka new preloader
 * eke ewata galapena widiyata wenas karanna we ne" + "drop down ekak danna
 * preloader section eke mobile kiyalai desktop kiyalai" + "skip button eka
 * show karanna hide karannath option ekak danna"). The contract is rebuilt
 * around what the REFERENCE opening actually renders:
 *   - global: enabled / logo / frequency / routeLoader
 *   - per-device (Desktop + Mobile): title, motto, skip button, ring —
 *     the admin dropdown edits one device's set at a time; mobile fields
 *     left empty FOLLOW the desktop value (the v2.8.93 inherit rule).
 * Every dead old-preloader field (sizes / bar / sentences / hold / exit /
 * progress / whiteCircle…) is gone from the contract; three of them
 * (title / motto / circleRing) survive ONLY as legacy fallbacks read from
 * the raw blob so already-saved custom values keep playing until the
 * admin re-saves per device.
 *
 * v2.9.15.18 — STAGE-2 SIZE DIALS (owner: "logo size eka, white circal
 * eke size eka, text sizes ehema adjest karannath option eka danna.
 * stage 2 eke witharai mn hithanne edit karanna ona. stage 1 eka aulak
 * na — mobile version and desktop version"). Four per-device sizing
 * dials (50–200% around the reference sizes) drive the Stage-2 lockup:
 * logoScale (crest inside the disc), circleScale (the white circle —
 * disc, halo and both rings travel together), nameScale (school name)
 * and tagScale (Est. 1873). Mobile fields left empty FOLLOW the desktop
 * dial, same inherit rule as the content fields. Stage 1 stays fixed.
 */

export type OpeningScene = "logo" | "title" | "final";

/** Which device version of the opening is being edited / played. */
export type PreloaderDevice = "desktop" | "mobile";

export type PreloaderSettings = {
  enabled: string;
  logo: string;
  frequency: string;
  /** Network round loader shown when a navigation is still in flight. */
  routeLoader: string;
  /* Per-device content — "" on a mobile field follows the desktop value. */
  desktopTitle: string;
  desktopMotto: string;
  /** Skip button visible during the opening. */
  desktopSkip: string;
  /** The old-preloader ring animation, recolored blue+black, orbiting the disc. */
  desktopRing: string;
  /* Per-device STAGE-2 sizing dials (v2.9.15.18) — "% of the reference
     size" as a string; desktop resolves to "100", mobile "" follows
     desktop. logo = crest inside the disc, circle = the white disc +
     halo + rings, name/tag = the two text lines under the disc. */
  desktopLogoScale: string;
  desktopCircleScale: string;
  desktopNameScale: string;
  desktopTagScale: string;
  mobileTitle: string;
  mobileMotto: string;
  mobileSkip: string;
  mobileRing: string;
  mobileLogoScale: string;
  mobileCircleScale: string;
  mobileNameScale: string;
  mobileTagScale: string;
};

export const PRELOADER_DEFAULTS: PreloaderSettings = {
  enabled: "true",
  logo: "",
  frequency: "session",
  routeLoader: "true",
  desktopTitle: "St. Thomas' College Matale",
  desktopMotto: "Animo Et Fide",
  desktopSkip: "true",
  desktopRing: "true",
  desktopLogoScale: "100",
  desktopCircleScale: "100",
  desktopNameScale: "100",
  desktopTagScale: "100",
  mobileTitle: "",
  mobileMotto: "",
  mobileSkip: "",
  mobileRing: "",
  mobileLogoScale: "",
  mobileCircleScale: "",
  mobileNameScale: "",
  mobileTagScale: "",
};

/* The sizing dials travel 50–200% around the reference opening. */
export const SIZE_MIN = 50;
export const SIZE_MAX = 200;

const sizeStr = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n)
    ? String(Math.min(SIZE_MAX, Math.max(SIZE_MIN, n)))
    : null;
};

const sizeNum = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, n))
    : 100;
};

/* Pre-2.9.15.17 single-set values — read ONLY as legacy fallbacks by the
   normalizer so a saved custom title/motto/ring keeps working until the
   admin edits the device versions. The old one-off title that predates
   v2.8.93 is still upgraded to the current default. */
const LEGACY = {
  title: "St. Thomas' College",
};

const boolish = (v: unknown): v is "true" | "false" => v === "true" || v === "false";

/** Resolved content for one device — what the renderer + preview consume. */
export function devicePreloader(s: PreloaderSettings, device: PreloaderDevice) {
  const mob = device === "mobile";
  const size = (m: string, d: string) => sizeNum((mob && m) || d);
  return {
    title: (mob && s.mobileTitle ? s.mobileTitle : s.desktopTitle) || PRELOADER_DEFAULTS.desktopTitle,
    motto: (mob && s.mobileMotto ? s.mobileMotto : s.desktopMotto) || PRELOADER_DEFAULTS.desktopMotto,
    skip: (mob ? s.mobileSkip || s.desktopSkip : s.desktopSkip) !== "false",
    ring: (mob ? s.mobileRing || s.desktopRing : s.desktopRing) !== "false",
    /* Stage-2 sizing dials — resolved % of the reference size. */
    logoScale: size(s.mobileLogoScale, s.desktopLogoScale),
    circleScale: size(s.mobileCircleScale, s.desktopCircleScale),
    nameScale: size(s.mobileNameScale, s.desktopNameScale),
    tagScale: size(s.mobileTagScale, s.desktopTagScale),
  };
}

/**
 * Raw site-settings blob → contract. New per-device keys win; "" mobile
 * fields resolve to the desktop value; the legacy global title / motto /
 * circleRing keep playing until the device fields are saved.
 */
export function normalizePreloaderSettings(
  raw: Partial<Record<string, string>> | undefined,
): PreloaderSettings {
  const s = { ...PRELOADER_DEFAULTS };
  if (!raw) return s;

  if (typeof raw.enabled === "string") s.enabled = raw.enabled;
  if (typeof raw.logo === "string") s.logo = raw.logo;
  if (typeof raw.frequency === "string" && raw.frequency) s.frequency = raw.frequency;
  if (typeof raw.routeLoader === "string") s.routeLoader = raw.routeLoader;

  /* Desktop set — raw first, then the legacy global, then the default. */
  s.desktopTitle =
    (typeof raw.desktopTitle === "string" && raw.desktopTitle.trim()) ||
    (typeof raw.title === "string" && raw.title.trim() && raw.title !== LEGACY.title && raw.title) ||
    PRELOADER_DEFAULTS.desktopTitle;
  s.desktopMotto =
    (typeof raw.desktopMotto === "string" && raw.desktopMotto.trim()) ||
    (typeof raw.motto === "string" && raw.motto.trim() && raw.motto) ||
    PRELOADER_DEFAULTS.desktopMotto;
  s.desktopSkip = boolish(raw.desktopSkip) ? raw.desktopSkip : "true";
  s.desktopRing = boolish(raw.desktopRing)
    ? raw.desktopRing
    : boolish(raw.circleRing)
      ? raw.circleRing
      : "true";

  /* Mobile set — "" (unset) follows the resolved desktop value. */
  s.mobileTitle =
    (typeof raw.mobileTitle === "string" && raw.mobileTitle.trim()) || s.desktopTitle;
  s.mobileMotto =
    (typeof raw.mobileMotto === "string" && raw.mobileMotto.trim()) || s.desktopMotto;
  s.mobileSkip = boolish(raw.mobileSkip) ? raw.mobileSkip : s.desktopSkip;
  s.mobileRing = boolish(raw.mobileRing) ? raw.mobileRing : s.desktopRing;

  /* Stage-2 sizing dials (v2.9.15.18) — desktop resolves to a number
     string ("100" when unset); mobile keeps the RAW string ("" follows
     the desktop dial) exactly like the content fields above. */
  s.desktopLogoScale = sizeStr(raw.desktopLogoScale) ?? "100";
  s.desktopCircleScale = sizeStr(raw.desktopCircleScale) ?? "100";
  s.desktopNameScale = sizeStr(raw.desktopNameScale) ?? "100";
  s.desktopTagScale = sizeStr(raw.desktopTagScale) ?? "100";
  s.mobileLogoScale = sizeStr(raw.mobileLogoScale) ?? "";
  s.mobileCircleScale = sizeStr(raw.mobileCircleScale) ?? "";
  s.mobileNameScale = sizeStr(raw.mobileNameScale) ?? "";
  s.mobileTagScale = sizeStr(raw.mobileTagScale) ?? "";

  return s;
}
