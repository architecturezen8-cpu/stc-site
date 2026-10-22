"use client";

import { useEffect } from "react";

/**
 * v2.8.59.0 — MAINTENANCE LIVE-OFF (the owner: "admin maintenance mode eka
 * off karama user page eka reload karath maintenance page ekema ne inne.
 * maintenance page eka live site eken off wenna ona ne. naththan user url
 * eka ghala enna ona ayemath site ekata").
 *
 * A tiny island on the /maintenance screen that polls the PUBLIC
 * /api/maintenance-status heartbeat (the one API exempt from the curtain's
 * 503) every few seconds. The moment maintenance goes OFF anywhere, this
 * tab navigates BACK to the page the visitor originally wanted (the
 * middleware stamps it as ?from=…) — or the homepage when the visit was
 * direct. No URL re-entry, no manual refresh, no stale curtain.
 *
 * First design note: a plain location.reload() was WRONG — the tab would
 * just redraw the maintenance screen (it is an exempt path that renders
 * even when the curtain is down). The revive must be a NAVIGATION.
 *
 * Failure mode: a missed poll changes nothing (the visitor just keeps
 * waiting for the next tick — the screen itself is static, so nobody loses
 * anything by a flaky network moment).
 */
export function MaintenanceReviveCheck({ from }: { from?: string }) {
  useEffect(() => {
    /* only same-site absolute paths survive this filter (no //evil, no
       https: — an attacker-crafted ?from must never become an open door) */
    const destination =
      from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/maintenance-status", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { enabled?: boolean };
          if (data.enabled === false) {
            /* The curtain is down — HARD navigation so the middleware (now
               open) serves the real page fresh. */
            window.location.assign(destination);
            return;
          }
        }
      } catch {
        /* network hiccup — try again on the next tick */
      }
      if (!cancelled) {
        timer = setTimeout(tick, 5000);
      }
    };

    /* First check after a short beat (the page itself just rendered), then
       every 5 seconds. */
    timer = setTimeout(tick, 2500);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [from]);

  return null;
}
