"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CineCard } from "@/components/cadeting/cine-overlay";

/** Default hold for direct visits — overridable from Admin Settings. */
const DEFAULT_HOLD = 2400;
/** Fade-out duration (must match .cine-overlay-out). */
const FADE = 900;

/**
 * Cinematic page intro for cadet unit pages — the ONE and ONLY preloader.
 *
 * v2.8.20 — previously a navigation between cadet pages played two
 * identical cards (the Explore "leave" card, then this "enter" card).
 * The leave card was removed; this intro is now the single cinematic
 * play for every visit, so the page always opens with exactly one
 * preloader.
 *
 * The card is rendered in the server HTML (no portal, no mount gate), so
 * it paints on the very first frame — page content can never flash
 * through before it appears.
 */
export function CinematicIntro({
  crest,
  name,
  tagline,
  path,
  enabled = true,
  holdMs = DEFAULT_HOLD,
  logoSrc,
  logoScale,
  logoId,
  children,
}: {
  crest: string;
  name: string;
  tagline: string;
  /** Kept for call-site compatibility (handoff flag no longer used). */
  path?: string;
  /** Controlled globally from Admin Settings, never through visual patches. */
  enabled?: boolean;
  holdMs?: number;
  /** Registry logo image (synced by the central logo system). */
  logoSrc?: string;
  logoScale?: number;
  logoId?: string;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!enabled) {
      // Card is hidden via the render condition below — nothing to time.
      document.body.style.overflow = "";
      return;
    }

    // Always start the page at the top behind the card.
    window.scrollTo(0, 0);
    document.body.style.overflow = "hidden";

    const hold = Math.max(0, Math.min(8000, Number(holdMs) || DEFAULT_HOLD));
    const t1 = window.setTimeout(() => {
      setClosing(true);
      document.body.style.overflow = "";
    }, hold);
    const t2 = window.setTimeout(() => setGone(true), hold + FADE);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.body.style.overflow = "";
    };
  }, [enabled, holdMs]);

  return (
    <>
      {children}

      {enabled && !gone && (
        <CineCard
          crest={crest}
          name={name}
          tagline={tagline}
          logoSrc={logoSrc}
          logoScale={logoScale}
          logoId={logoId}
          closing={closing}
          instant
        />
      )}
    </>
  );
}
