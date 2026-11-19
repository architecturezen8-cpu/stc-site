"use client";

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import gearsData from "@/../public/lottie/maintenance-gears.json";
import pulseData from "@/../public/lottie/maintenance-pulse.json";

/**
 * Lottie player for the /maintenance screen (v2.8.39.0). The two animation
 * JSONs and lottie-web itself are imported STATICALLY — a Turbopack dev
 * quirk ("chunk path empty but not in a worker") broke the dynamic-chunk
 * path after cold restarts, and static imports bundle the same code with
 * zero runtime fetches. Renders SVG directly into the ref container; under
 * prefers-reduced-motion the animation loads PAUSED on its first frame.
 */
export function MaintenanceLottie({
  variant,
  className,
  label,
}: {
  variant: "gears" | "pulse";
  className?: string;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let item: AnimationItem | null = null;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      item = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: !reduced,
        autoplay: !reduced,
        animationData: variant === "gears" ? gearsData : pulseData,
      });
    } catch {
      /* the static design stands alone */
    }

    return () => {
      item?.destroy();
    };
  }, [variant]);

  return (
    <div ref={containerRef} className={className} role="img" aria-label={label} />
  );
}
