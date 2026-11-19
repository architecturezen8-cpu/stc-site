import type { CSSProperties } from "react";

/**
 * Circular heraldic crest used in place of generic icons for
 * societies, cadet units, bands and college honours.
 *
 * Crests always sit on a WHITE circle with perfectly centred content —
 * gold discs are not used for logos. A crest image (unit logo) can be
 * attached from the visual editor or the admin Logos manager:
 *   · `logoId`   — identity in the central logo registry (`logo_assets`).
 *                  Every instance sharing the id syncs automatically.
 *   · `logoSrc`  — registry image for this instance (server-rendered).
 *   · `logoScale`— fill of the white circle (100 = fit, larger zooms in).
 * When a logo image is present the initials fade out automatically.
 */
export function Crest({
  initials,
  label,
  size = "md",
  tone = "light",
  className = "",
  visualKey,
  logoId,
  logoSrc,
  logoScale = 100,
}: {
  initials: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  tone?: "gold" | "light" | "dark";
  className?: string;
  /** Stable visual-editor identity — `[data-visual-key="…"]`. */
  visualKey?: string;
  /** Central logo-registry identity — `[data-logo-id="…"]`. */
  logoId?: string;
  /** Registry image rendered inside the white circle. */
  logoSrc?: string;
  /** Registry fill scale — 100 fits the circle, larger zooms in. */
  logoScale?: number;
}) {
  const dims =
    size === "lg"
      ? "h-20 w-20 text-[19px] ring-2 [&>span:first-child]:inset-[5px] md:h-24 md:w-24 md:text-[22px]"
      : size === "sm"
        ? "h-11 w-11 text-[10px]"
        : "h-14 w-14 text-[13px]";

  const palette =
    tone === "dark"
      ? "bg-ink text-gold ring-white/20"
      : tone === "gold"
        ? "bg-gold text-ink ring-ink/10"
        : // White is the standard crest disc — logos centre on white.
          "bg-white text-ink ring-ink/15 shadow-[0_1px_6px_rgba(0,0,0,0.12)]";

  const logoStyle: CSSProperties | undefined = logoSrc
    ? {
        backgroundImage: `url("${logoSrc.replaceAll('"', "%22")}")`,
        backgroundRepeat: "no-repeat",
        ...(logoScale !== 100 ? { backgroundSize: `${logoScale}%` } : {}),
      }
    : undefined;

  return (
    <span
      aria-label={label ?? initials}
      data-visual-bg=""
      data-visual-key={visualKey}
      data-logo-id={logoId}
      data-logo-scale={logoSrc ? logoScale : undefined}
      style={logoStyle}
      className={`relative grid shrink-0 place-items-center rounded-full bg-cover bg-center ring-1 ${palette} ${dims} ${className}`}
    >
      <span className="absolute inset-[3px] rounded-full border border-current opacity-25" />
      <span
        className={`font-display font-semibold leading-none tracking-[-0.02em] transition-opacity ${
          logoSrc ? "opacity-0" : ""
        }`}
      >
        {initials}
      </span>
    </span>
  );
}

/** Wraps a crest with a soft plinth, for use over photography. */
export function CrestBadge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`grid place-items-center rounded-full bg-ink/85 p-1.5 ${className}`}
    >
      {children}
    </span>
  );
}
