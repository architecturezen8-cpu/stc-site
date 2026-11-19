"use client";

import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "stc-portal-theme";

/**
 * Portal theme switch — dark "Obsidian & Gold" <-> warm cream light.
 *
 * The current theme lives in html[data-portal-theme] (set before first
 * paint by the boot script in the root layout), so the icon is rendered
 * purely with CSS (.portal-theme-dark-only / .portal-theme-light-only):
 * zero flash, zero React state, zero hydration risk. Clicking flips the
 * attribute and remembers the choice in localStorage for this device.
 */
export function PortalThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next =
      root.getAttribute("data-portal-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-portal-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the choice just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between dark and light theme"
      title="Theme"
      className={`grid h-9 w-9 place-items-center rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] transition-colors duration-300 hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-accent-text)] ${className}`}
    >
      <Sun
        size={16}
        className="portal-theme-dark-only pt-theme-icon"
        aria-hidden="true"
      />
      <Moon
        size={16}
        className="portal-theme-light-only pt-theme-icon"
        aria-hidden="true"
      />
    </button>
  );
}
