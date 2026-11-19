"use client";

import { useEffect } from "react";

/**
 * v2.9.14.6 — stale-tab self-healer.
 *
 * Symptom (sandbox preview + production alike): the page sits idle, the
 * server behind it restarts or a new build ships, the tab wakes up showing
 * the OLD UI and every button is dead because the JS chunks it holds were
 * served by a process/build that no longer exists.
 *
 * Two self-heals, both silent:
 *  1. bfcache restore (back/forward cache "persisted" pageshow) — the restored
 *     snapshot is always stale; reload immediately.
 *  2. After the tab has been hidden 30+ seconds, ask /api/health what is
 *     serving now. A different VERSION (new deploy) — or, in development only,
 *     a different BOOT id (dev server restart) — means this tab is behind;
 *     reload onto the live UI. Session flags make the cinematic preloader
 *     skip on the reload, so the fix is invisible to the visitor.
 *
 * If the health check cannot reach the server, do nothing — the preview
 * panel already has its own down-state UI, and the next wake-up re-checks.
 */

type HealthPayload = { ok?: boolean; version?: string; boot?: string };

export function StalePageReloader({
  version,
  boot,
  devMode,
}: {
  version: string;
  boot: string;
  devMode: boolean;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let hiddenAt = 0;
    let checking = false;

    const checkFreshness = async () => {
      if (checking) return;
      checking = true;
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as HealthPayload;
        const versionStale = Boolean(data.version) && data.version !== version;
        /* In production each serverless instance owns its boot id, so a boot
           mismatch there is normal load-balancing — only dev restarts mean
           the page really was served by a dead process. */
        const bootStale = devMode && Boolean(data.boot) && data.boot !== boot;
        if (versionStale || bootStale) {
          window.location.reload();
        }
      } catch {
        /* server unreachable — leave the tab alone, next wake re-checks */
      } finally {
        checking = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > 30_000) {
        hiddenAt = 0;
        void checkFreshness();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [version, boot, devMode]);

  return null;
}
