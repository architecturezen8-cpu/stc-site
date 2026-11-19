"use client";

import { useEffect } from "react";

/**
 * v2.8.60.0 — MAINTENANCE LIVE-ON (the owner: "maintenance mode eka on
 * karama kohoma gahuwath maintenance page ekane userta penne").
 *
 * The middleware catches every DOCUMENT load, but a tab that is already
 * open (public site, portals, login screens) kept reading the cached page
 * until the visitor navigated. This tiny island polls the PUBLIC
 * /api/maintenance-status heartbeat — the one API exempt from the 503 —
 * and the moment the curtain goes up it HARD-navigates to /maintenance
 * carrying ?from=<current path> so the revive poller can bring the visitor
 * back to the same page when the curtain lifts.
 *
 * Admin studios are deliberately skipped: both teams keep their live
 * preview while the curtain is up (they are the ones editing behind it).
 * Mount-and-forget: rendered once from the root layout.
 */
export function MaintenanceWatch() {
  useEffect(() => {
    const path = window.location.pathname;
    /* The curtain's own screen, both admin studios and the APIs must never
       bounce — the middleware already exempts them, and admins preview. */
    if (
      path.startsWith("/admin") ||
      path.startsWith("/lms-admin") ||
      path.startsWith("/maintenance")
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/maintenance-status", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { enabled?: boolean };
          if (data.enabled === true) {
            const from = `${window.location.pathname}${window.location.search}`;
            /* HARD navigation so the middleware (now closed) stamps the
               redirect and the screen mounts fresh. */
            window.location.href = `/maintenance?from=${encodeURIComponent(from)}`;
            return;
          }
        }
      } catch {
        /* network hiccup — try again on the next tick */
      }
      if (!cancelled) {
        timer = setTimeout(tick, 10_000);
      }
    };

    /* First check after the page has settled (never race the preloader),
       then every 10 seconds. */
    timer = setTimeout(tick, 6_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
