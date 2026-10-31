"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * v2.8.79.0 — FIRST-PARTY PAGEVIEW TRACKER (Phase 3 analytics).
 *
 * One beacon per public page view, cookie-less, no third party: the beacon
 * carries only the path + the document referrer; the server derives the
 * daily-rotating visitor hash, the device class and the Colombo day. Nothing
 * is stored that identifies a person across days.
 *
 * PUBLIC SITE ONLY — the studio, the LMS studio, every portal shell, the
 * account screens and the maintenance screen are skipped (their traffic is
 * the school's own staff, not audience data).
 */
const SKIP_PREFIXES = [
  "/admin",
  "/lms-admin",
  "/student",
  "/teacher",
  "/parent",
  "/principal",
  "/account",
  "/api",
  "/maintenance",
  "/login",
  "/register",
];

export function SiteTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (SKIP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return;
    }
    /* StrictMode double-invoke + Fast Refresh safety: one beacon per mount. */
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const payload = JSON.stringify({ path: pathname, ref: document.referrer || "" });
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon?.("/api/analytics/collect", blob)) return;
    } catch {
      /* fall through to fetch */
    }
    fetch("/api/analytics/collect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* analytics must never surface an error to a visitor */
    });
  }, [pathname]);

  return null;
}
