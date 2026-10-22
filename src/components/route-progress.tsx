"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * RouteLoader — the ONE navigation loader (public site AND admin panel):
 * a black screen with an ultra-thin golden ring and a soft "Loading"
 * word beneath it, shown when an in-app navigation is still in flight
 * after a short beat (slow networks / cold server wake-ups).
 *
 * Per the user's spec there is deliberately NO top progress bar and no
 * other loader — only this round loading preloader. It is a purely
 * visual overlay: no scroll lock, no pointer capture, so it can never
 * interfere with the site preloader or page scrolling.
 *
 * Opt-out with data-no-progress on any anchor. Honours prefers-reduced-motion.
 */

const SLOW_MS = 450; // in-flight beat before the round loader takes over

export function RouteLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [slow, setSlow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const finishTimer = useRef(0);
  const slowTimer = useRef(0);
  /** Location the running navigation is heading to. */
  const targetRef = useRef("");

  const stopTimers = useCallback(() => {
    window.clearTimeout(finishTimer.current);
    window.clearTimeout(slowTimer.current);
  }, []);

  const finish = useCallback(() => {
    stopTimers();
    setLeaving(true);
    window.setTimeout(() => {
      setSlow(false);
      setLeaving(false);
    }, 300);
  }, [stopTimers]);

  const start = useCallback(
    (target: string) => {
      targetRef.current = target;
      stopTimers();
      setLeaving(false);
      setSlow(false);
      // Slow network / cold route → the round loader on a black screen.
      slowTimer.current = window.setTimeout(() => setSlow(true), SLOW_MS);
      // Safety: never spin forever (server wake-ups can be slow).
      finishTimer.current = window.setTimeout(() => finish(), 12000);
    },
    [finish, stopTimers],
  );

  /* Complete the loader when the route actually changes. */
  const locationKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const prevLocation = useRef(locationKey);
  useEffect(() => {
    if (locationKey !== prevLocation.current) {
      prevLocation.current = locationKey;
      if (slowTimer.current) {
        // Small delay so the loader is visible for a beat even on instant loads.
        window.setTimeout(() => finish(), 160);
      }
    }
  }, [locationKey, finish]);

  /* Intercept internal link clicks (capture phase, before SPA handlers). */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.hasAttribute("download") || anchor.getAttribute("target") === "_blank") return;
      if (anchor.closest("[data-no-progress]")) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      const target = `${url.pathname}?${url.searchParams.toString()}`;
      if (target === `${window.location.pathname}?${window.location.search.slice(1)}`) return;
      start(target);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  useEffect(() => stopTimers, [stopTimers]);

  if (!slow) return null;

  return (
    <div
      data-no-progress=""
      aria-hidden="true"
      className="rtp-overlay"
      style={{ opacity: leaving ? 0 : 1 }}
    >
      <div className="rtp-ring" />
      <span className="rtp-word">Loading</span>
    </div>
  );
}
