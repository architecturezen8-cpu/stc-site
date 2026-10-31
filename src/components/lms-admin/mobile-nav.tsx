"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Menu, X } from "lucide-react";
import { LMS_ADMIN_NAV, type LmsAdminNavKey } from "@/components/lms-admin/nav-items";
import { LmsAdminSignOutButton } from "@/components/lms-admin/sign-out-button";
import { LmsAdminThemeToggle } from "@/components/lms-admin/lms-admin-theme-toggle";

/**
 * LMS Admin Studio — MOBILE SIDE PANEL (v2.8.39.0, owner request: on phones
 * the section selector must not be a horizontal strip up top anymore; it
 * should be a slide-in panel like the reference). A hamburger in the header
 * opens a left drawer with the full section list, the account, the theme
 * toggle and sign-out. Desktop is untouched (md: and up never see it).
 *
 * The drawer is portalled to <body>: the sticky header uses backdrop-blur,
 * and ANY filtered ancestor becomes the containing block for fixed
 * descendants — the drawer would otherwise be trapped inside the 64px header.
 *
 * v2.8.40.1 — closed state now paints NOTHING (visibility:hidden wrapper,
 * no backdrop-blur on the scrim): a fixed + backdrop-filter layer that is
 * merely opacity-0 still gets composited and blackened the top of the page
 * on phones (the reported "black screen").
 *
 * v2.8.41.1 — the panel now opens on EVERY breakpoint (md:hidden dropped
 * from both the button and the wrapper) and the desktop header no longer
 * repeats theme/sign-out/account — mirroring the portals' header contract:
 * brand + pill nav on the left, ONE panel button on the right.
 */
export function LmsAdminMobileNav({
  active,
  name,
  email,
}: {
  active: LmsAdminNavKey;
  name: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const initial = (name || email || "L").trim().charAt(0).toUpperCase();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  /* Close on navigation (deferred so no synchronous setState in an effect)
     + Escape, and lock body scroll while open. */
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = (
    <div
      /* v2.8.40.0 — this wrapper is portalled to <body>, OUTSIDE the shell's
         .lms-admin-scope, so every --la-* token used to resolve to nothing
         (the "transparent panel" the owner reported). Carrying the scope
         class here restores the full dashboard theme; the dark override
         still matches because the wrapper stays inside <html
         data-lmsadmin-theme>. */
      /* v2.8.40.1 — BLACK-SCREEN FIX (owner: "mobile version ekedi black
         screen ekak watenne"): when closed the whole subtree is now
         `invisible` (visibility:hidden skips painting entirely) and the
         backdrop lost its backdrop-blur. The old closed state — opacity-0
         backdrop WITH backdrop-blur-sm inside a fixed inset-0 wrapper —
         kept a live backdrop-filter layer composited over the viewport,
         which blackened the top of the page in real mobile Chrome. */
      className={`lms-admin-scope fixed inset-0 z-[80] ${
        open ? "visible" : "invisible pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label="Close sections panel"
        onClick={() => setOpen(false)}
        className={`absolute inset-0 bg-black/55 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel — v2.8.40.0: a FLOATING rounded card in the dashboard theme
          (owner: "side panel eka transparent karanna epa. e wenuwata dahbord
          theme ekenma hadanna round shape style ekata") — solid --la-panel
          surface, rounded-3xl corners, detached from the screen edge. */}
      <aside
        className={`absolute inset-y-2 left-2 flex w-[300px] max-w-[85vw] flex-col overflow-hidden rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-[calc(100%+1.5rem)]"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="LMS Admin Studio sections"
      >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--la-divider)] px-4 py-4">
            <Link href="/lms-admin" className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ffd444] text-black">
                <GraduationCap className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[14px] font-semibold text-[var(--la-heading)]">
                  LMS Admin Studio
                </span>
                <span className="block truncate text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--la-muted)]">
                  St. Thomas&apos; College · Matale
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close panel"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--la-muted)] transition-colors hover:bg-[var(--la-panel-soft)] hover:text-[var(--la-heading)]"
            >
              <X className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="LMS admin sections" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {LMS_ADMIN_NAV.map((item) => {
                const isActive = item.key === active;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13.5px] transition-all duration-300 ${
                        isActive
                          ? "bg-[var(--la-nav-active-bg)] font-semibold text-[var(--la-nav-active-text)] shadow-[var(--la-nav-glow)]"
                          : "font-medium text-[var(--la-body)] hover:bg-[var(--la-panel-soft)] hover:text-[var(--la-heading)]"
                      }`}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t border-[var(--la-divider)] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ffd444] text-xs font-bold text-black">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--la-heading)]">
                  {name || email}
                </p>
                <p className="truncate text-[11px] text-[var(--la-muted)]">{email}</p>
              </div>
            </div>
            <div className="mt-3.5 flex items-center gap-2">
              <LmsAdminThemeToggle />
              <LmsAdminSignOutButton />
            </div>
          </div>
        </aside>
      </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open sections panel"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)]"
      >
        <Menu className="h-4.5 w-4.5" aria-hidden="true" />
      </button>

      {/* Drawer lives at <body> level — a filtered ancestor (the blurred
          header) would otherwise become its containing block. */}
      {mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
