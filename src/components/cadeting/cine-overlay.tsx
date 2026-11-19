"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/* No-op subscription: the mounted snapshot only flips once, between the
   server/hydration pass and the first client render. */
const subscribeNoop = () => () => {};

type CineOverlayProps = {
  crest: string;
  name: string;
  tagline: string;
  /** Registry logo image for this unit — syncs with the logo system. */
  logoSrc?: string;
  /** Registry fill scale — 100 fits the circle, larger zooms in. */
  logoScale?: number;
  /** Registry identity for this unit's crest (`cadet-crest-<unit-slug>`). */
  logoId?: string;
  /** Fade the card away. */
  closing?: boolean;
  /** Skip the reveal choreography (card appears already composed). */
  instant?: boolean;
};

/** The visual card itself — no mounting logic, so it can render during SSR. */
export function CineCard({
  crest,
  name,
  tagline,
  logoSrc,
  logoScale = 100,
  logoId,
  closing = false,
  instant = false,
}: CineOverlayProps) {
  return (
    <div
      data-visual-ui=""
      className={`fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden bg-[#060605] ${
        closing
          ? "cine-overlay-out pointer-events-none"
          : instant
            ? ""
            : "cine-overlay-in"
      }`}
      aria-hidden="true"
    >
      {/* Letterbox bars */}
      <span
        className={`absolute inset-x-0 top-0 h-10 bg-black sm:h-14 md:h-20 ${
          instant ? "" : "cine-bar-top"
        }`}
      />
      <span
        className={`absolute inset-x-0 bottom-0 h-10 bg-black sm:h-14 md:h-20 ${
          instant ? "" : "cine-bar-bottom"
        }`}
      />
      <div className="grain pointer-events-none absolute inset-0" />

      {/* Content column — sized to the viewport, never to a parent card */}
      <div className="relative flex w-full max-w-xl flex-col items-center px-6 text-center">
        <span
          data-visual-key={`cadet-cine-crest-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          data-logo-id={logoId}
          style={
            logoSrc
              ? {
                  backgroundImage: `url("${logoSrc.replaceAll('"', "%22")}")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  ...(logoScale !== 100 ? { backgroundSize: `${logoScale}%` } : {}),
                }
              : undefined
          }
          className={`relative grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white text-ink shadow-[0_2px_18px_rgba(0,0,0,0.45)] ring-2 ring-white/70 sm:h-24 sm:w-24 md:h-28 md:w-28 ${
            instant ? "" : "cine-crest"
          }`}
        >
          <span className="absolute inset-[6px] rounded-full border border-ink/20" />
          <span
            className={`font-display text-lg font-semibold tracking-[-0.02em] sm:text-xl md:text-2xl ${
              logoSrc ? "opacity-0" : ""
            }`}
          >
            {crest}
          </span>
        </span>

        <p
          className={`mt-6 max-w-full text-balance font-display text-xl font-semibold leading-tight tracking-[-0.02em] text-white sm:text-2xl md:mt-8 md:text-3xl ${
            instant ? "" : "cine-name"
          }`}
        >
          {name}
        </p>

        <p
          className={`mt-3 max-w-full text-balance font-sans text-[8.5px] uppercase leading-relaxed tracking-[0.34em] text-gold sm:text-[9px] sm:tracking-[0.4em] ${
            instant ? "" : "cine-sub"
          }`}
        >
          {tagline}
        </p>

        {/* Film leader line */}
        <span
          className={`relative mt-7 block h-px w-16 overflow-hidden bg-white/15 md:mt-9 ${
            instant ? "" : "cine-line"
          }`}
        >
          <span className="cine-sheen absolute inset-y-0 left-0 block w-6 bg-gold" />
        </span>
      </div>
    </div>
  );
}

/**
 * Portal version — used for the Explore exit card.
 *
 * A portal is required there because the triggering card sits inside a
 * transformed ancestor (Reveal), which would otherwise become the
 * containing block for `position: fixed` and clip the overlay.
 */
export function CineOverlay(props: CineOverlayProps) {
  /* Client-only portal — the hydration-safe "mounted" flip (server false →
     client true) via useSyncExternalStore, with no cascading setState
     effect. */
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  if (!mounted) return null;

  return createPortal(<CineCard {...props} />, document.body);
}
