"use client";

import { Moon, Sun } from "lucide-react";

/**
 * LMS Admin Studio theme toggle — mirrors the portal toggle: CSS-driven icon
 * swap (no React state), localStorage "stc-lmsadmin-theme",
 * html[data-lmsadmin-theme] drives the tokens. Default dark.
 */
export function LmsAdminThemeToggle() {
  function toggle() {
    const current =
      document.documentElement.getAttribute("data-lmsadmin-theme") === "light"
        ? "light"
        : "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-lmsadmin-theme", next);
    try {
      localStorage.setItem("stc-lmsadmin-theme", next);
    } catch {
      /* private mode — attribute still flips for this visit */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      title="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] text-[var(--la-body)] transition-all duration-300 hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)]"
    >
      <Moon size={15} className="lmsa-theme-dark-only lmsa-theme-icon" aria-hidden="true" />
      <Sun size={15} className="lmsa-theme-light-only lmsa-theme-icon" aria-hidden="true" />
    </button>
  );
}
