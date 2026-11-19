"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * v2.9.8.0 — published visual-patch context.
 *
 * The root layout already fetches every published patch (the inline
 * `window.__STC_VP__` bootstrap). This provider hands the SAME server
 * data to React components, so keyed media can render its patched state
 * SERVER-SIDE instead of being mutated after hydration.
 *
 * WHY: the owner can now replace an image with a video ("page eke images
 * thiyana than walata videos replace karanna"). Turning an <img> node into
 * a <video> node before React hydrates would trip the hydration mismatch
 * → full client re-render (the exact bug class the butter-smooth v2.9.7.0
 * round removed). Rendering the video from SiteImage itself is hydration-
 * safe, flash-free, and needs zero DOM surgery for every keyed image.
 */

export type PublishedPatchData = {
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
  hidden?: boolean;
  textMode?: "direct" | "full";
  backgroundImage?: string;
  backgroundColor?: string;
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoControls?: boolean;
};

export type PublishedPatchRow = { s: string; d: PublishedPatchData };

export type PublishedPatchMap = Record<string, PublishedPatchRow[]>;

const VisualPatchContext = createContext<PublishedPatchMap | null>(null);

export function VisualPatchProvider({
  patchMap,
  children,
}: {
  patchMap: PublishedPatchMap;
  children: ReactNode;
}) {
  return (
    <VisualPatchContext.Provider value={patchMap}>
      {children}
    </VisualPatchContext.Provider>
  );
}

/**
 * The published patch data for a keyed element — `[data-visual-key="…"]`
 * exact selector, wildcard rows first (page rows win). Returns null when
 * the element has no key or no published patch touches it.
 */
export function usePublishedPatchFor(
  visualKey: string | undefined | null,
): PublishedPatchData | null {
  const map = useContext(VisualPatchContext);
  const pathname = usePathname();
  return useMemo(() => {
    if (!map || !visualKey) return null;
    const selector = `[data-visual-key="${visualKey}"]`;
    const rows = (map["*"] ?? []).concat(map[pathname] ?? []);
    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index];
      if (row?.s === selector && row.d && Object.keys(row.d).length > 0) {
        return row.d;
      }
    }
    return null;
  }, [map, pathname, visualKey]);
}
