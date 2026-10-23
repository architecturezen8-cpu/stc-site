"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessagesSquare,
  NotebookPen,
  UsersRound,
  UserRound,
  X,
} from "lucide-react";
import { Crest } from "@/components/crest";
import {
  usePortalBrand,
} from "@/components/portal/portal-brand";
import { PortalThemeToggle } from "@/components/portal/portal-theme-toggle";

export type PortalNavItem = {
  label: string;
  href: string;
  active?: boolean;
  /** v2.8.51.0 — unread count for the Chat pill (hidden when 0/undefined). */
  badge?: number;
};

const PORTAL_SUB: Record<string, string> = {
  student: "Student Portal",
  teacher: "Teacher Portal",
  parent: "Parent Portal",
};

/** Icons for the mobile drawer list (label-driven — the nav data stays a
    plain {label, href} pair coming from the server pages). */
const NAV_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  Dashboard: LayoutDashboard,
  Timetable: CalendarClock,
  /* v2.8.53.0 — Phase 2.2, the portal calendar */
  Calendar: CalendarDays,
  Homework: NotebookPen,
  Assignments: ClipboardList,
  /* v2.8.51.0 — the dedicated Chat section */
  Chat: MessagesSquare,
  Marks: GraduationCap,
  /* v2.8.45.0 — Phase 3.1-e */
  Materials: BookOpen,
  Notices: Bell,
  Attendance: ClipboardCheck,
  Classes: UsersRound,
  Children: UsersRound,
  Support: LifeBuoy,
  Profile: UserRound,
};

function iconFor(label: string) {
  return NAV_ICONS[label] ?? UserRound;
}

/**
 * v2.8.53.0 — the header pill strip is a QUICK-ACCESS subset, not the whole
 * menu (the owner, on the teacher portal's 11-item header: "uda sections
 * walata yanna thiyana ewa wadi nisa width eka madi… side panel eke
 * thiyanawa okkoma navigations tika"). THE DRAWER (side panel) always
 * carries EVERY item; the desktop pill strip keeps only these labels per
 * role — null renders everything (nothing was trimmed).
 */
const HEADER_NAV_LABELS: Record<"student" | "teacher" | "parent", string[] | null> = {
  student: ["Dashboard", "Homework", "Chat", "Profile"],
  teacher: ["Dashboard", "Assignments", "Chat", "Profile"],
  parent: ["Dashboard", "Homework", "Marks", "Profile"],
};

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Themed portal chrome — reads every colour from the .portal-scope token
 * set (dark "Obsidian & Gold" by default, warm cream when the visitor
 * picks light), so the SAME markup serves both themes. Sticky header with
 * crest + pill nav + account actions, generous content area, and a footer
 * that always sticks to the viewport bottom (mt-auto) without ever
 * overlapping content on long pages.
 *
 * v2.8.41.0 — three owner fixes, one shell:
 * · ANCHOR NAV FROM SUB-PAGES: the section links are hash anchors of the
 *   dashboard route, so clicking Timetable/Marks/… on /student/profile only
 *   moved the pill. When the anchor target isn't on the current page the
 *   shell now navigates to the portal home WITH the hash (full load, native
 *   hash scroll). A mount-time hash sync also lights the right pill when the
 *   URL arrives with #section.
 * · HEADER = BRAND + PILL + ONE BUTTON: profile, theme toggle and sign-out
 *   already live in the side panel, so the header's right side is now JUST
 *   the side-panel button — on every breakpoint (owner: "side panel eka
 *   open karana icon eka witharak thiyanna right side eke"). The drawer is
 *   no longer md-only.
 * · TALLER HEADER: the row is 80px so it breathes on phones too.
 */
export function PortalShell({
  role,
  name,
  email,
  avatarUrl,
  nav,
  children,
}: {
  role: "student" | "teacher" | "parent";
  name: string;
  email: string;
  avatarUrl?: string | null;
  nav: PortalNavItem[];
  children: ReactNode;
}) {
  const [signingOut, setSigningOut] = useState(false);

  /* ── v2.8.59.0/59.1/60.0 — the BRAND LOGO at the top of the portals ──
     The owner: "portal wala uda school logo eka dana option eka main admin
     eke settings walata danna wei." v2.8.60.0: the portal layout delivers
     the portal's OWN registry logo (fallback: College Crest) WITH its
     white-circle fill scale — set once in Admin → Logos & Crests and every
     portal draws it at the right size on the first payload. The client
     fetch below only acts as a fallback for layouts without a provider,
     a failed image URL degrades to the STC initials disc (onError), and
     the initials disc stands in whenever no logo is set. */
  const contextBrand = usePortalBrand();
  const [fetchedBrand, setFetchedBrand] = useState<{ src: string; scale: number } | null>(null);
  useEffect(() => {
    if (contextBrand != null) return; // the server payload wins
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as {
          schoolLogo?: string;
          schoolLogoScale?: string | number;
        } | null;
        const src = typeof json?.schoolLogo === "string" ? json.schoolLogo.trim() : "";
        const scale = Math.min(240, Math.max(40, Number(json?.schoolLogoScale) || 100));
        if (!cancelled && src) setFetchedBrand({ src, scale });
      } catch {
        /* the initials disc is a perfectly good fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextBrand]);
  const brandSrc = contextBrand?.src ?? fetchedBrand?.src ?? null;
  const brandScale = contextBrand?.scale ?? fetchedBrand?.scale ?? 100;

  /* A broken logo URL (deleted blob, dead external link) must degrade to
     the initials disc — never an empty white circle. Preload once; the
     failed URL is REMEMBERED (derived flag), so a later change to a
     different URL recovers automatically without effect-time setState. */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!brandSrc) return;
    let alive = true;
    const probe = new window.Image();
    probe.onerror = () => {
      if (alive) setFailedSrc(brandSrc);
    };
    probe.src = brandSrc;
    return () => {
      alive = false;
    };
  }, [brandSrc]);
  const logoFailed = brandSrc != null && failedSrc === brandSrc;
  const brandLogo = brandSrc && !logoFailed ? brandSrc : null;

  /* ── v2.8.53.0 — the header subset ──
     nav stays the FULL menu (the drawer renders it whole); the header pill
     strip renders only the role's quick-access labels. Links are indexed
     by their position in the HEADER strip for the sliding pill; the active
     marker stays an index into nav (the drawer lights the item the server
     marked active, exactly as before). When the current page is NOT in the
     header subset (e.g. the teacher's Marks page) no pill shows — honest,
     like the mobile header; the drawer carries the highlight. */
  const headerLabels = HEADER_NAV_LABELS[role];
  const headerItems = useMemo(
    () =>
      headerLabels
        ? headerLabels
            .map((label) => {
              const navIdx = nav.findIndex((item) => item.label === label);
              return navIdx >= 0 ? { item: nav[navIdx], navIdx } : null;
            })
            .filter((entry): entry is { item: PortalNavItem; navIdx: number } => entry != null)
        : nav.map((item, navIdx) => ({ item, navIdx })),
    [nav, headerLabels],
  );

  /* ── Sliding active pill state ── */
  const initialActive = Math.max(
    0,
    nav.findIndex((item) => item.active),
  );
  const [activeIdx, setActiveIdx] = useState(initialActive);
  /* Sync the optimistic pill when a REAL route changes the server-provided
     active item (Dashboard → Profile navigation). React's official
     "adjust state when a prop changes" pattern — setState during render,
     no effect needed. */
  const [lastInitial, setLastInitial] = useState(initialActive);
  if (initialActive !== lastInitial) {
    setLastInitial(initialActive);
    setActiveIdx(initialActive);
  }

  /* Which HEADER strip entry is active — -1 when the current page is not
     in the subset (the pill hides). */
  const headerIdx = useMemo(() => {
    const active = nav[activeIdx];
    if (!active) return -1;
    return headerItems.findIndex((entry) => entry.item.label === active.label);
  }, [headerItems, nav, activeIdx]);

  const linksRef = useRef<Array<HTMLAnchorElement | null>>([]);
  const [pill, setPill] = useState<{ left: number; width: number; ready: boolean }>({
    left: 0,
    width: 0,
    ready: false,
  });

  const measure = useCallback(() => {
    if (headerIdx < 0) return;
    const el = linksRef.current[headerIdx];
    if (!el) return;
    setPill((prev) => {
      const left = el.offsetLeft;
      const width = el.offsetWidth;
      if (prev.ready && prev.left === left && prev.width === width) return prev;
      return { left, width, ready: true };
    });
  }, [headerIdx]);

  /* Measure before paint on every active change, then keep it true on
     resize / font-load / any layout settling. */
  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(onResize).catch(() => undefined);
    const t = setTimeout(onResize, 250);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [measure]);

  /* ── Mobile drawer ── */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const t = setTimeout(() => setDrawerMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  /* Close the drawer on navigation (deferred — no sync setState in effect). */
  useEffect(() => {
    const t = setTimeout(() => setDrawerOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  /* v2.8.41.0 — deterministic hash landing. The global
     html{scroll-behavior:smooth} makes the browser's NATIVE hash scroll a
     smooth animation that keeps losing the race against hydration/layout
     settling (the parent portal landed 0–16px short of #notices). After a
     settle tick: light the matching nav pill, and if the section isn't
     already in position under the header, glide to it — once per load. */
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);
  useEffect(() => {
    const t = setTimeout(() => {
      const hash = window.location.hash;
      if (!hash || hash === "#") return;
      const idx = navRef.current.findIndex((item) => item.href === hash);
      if (idx >= 0) setActiveIdx(idx);
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      const margin =
        parseFloat(getComputedStyle(target).scrollMarginTop || "0") || 0;
      if (Math.abs(target.getBoundingClientRect().top - margin) > 8) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      }
    }, 220);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  /* In-page anchors glide to their section instead of the browser's instant
     jump. v2.8.41.0 — when the anchor section is NOT on this page (e.g. the
     profile page), navigate to the portal home WITH the hash so the visitor
     actually lands on the section (owner: "profile eke idan timetable ...
     click karata adala section ekata yanne na"). The pill already moved —
     optimistic — in the click handler.
     v2.8.55.0 (owner item 6) — EVERY side-nav click closes the side panel
     right away. Page links already closed it via the pathname effect, but
     same-page anchors (#homework, #calendar…) never changed the pathname —
     the panel used to stay open over the section it just scrolled to. */
  function handleNavClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    navIdx: number,
  ) {
    setActiveIdx(navIdx);
    setDrawerOpen(false);
    if (!href.startsWith("#") || href === "#") return;
    const target = document.getElementById(href.slice(1));
    if (target) {
      event.preventDefault();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      window.history.replaceState(null, "", href);
      return;
    }
    const homeHref = nav[0]?.href ?? "/";
    if (homeHref.startsWith("/") && !homeHref.startsWith("#")) {
      event.preventDefault();
      window.location.assign(`${homeHref}${href}`);
    }
  }

  const profileHref = nav.find((item) => item.label === "Profile")?.href ?? "#";

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      /* v2.8.37.1 — sign out THIS portal only: each portal holds its own
         session cookie, so other portals on this browser stay signed in. */
      await fetch("/api/portal/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
    } catch {
      /* the cookie clear still happens server-side on next paint */
    }
    window.location.href = "/login";
  }

  const drawer = (
    <div
      className={`portal-scope fixed inset-0 z-[80] ${
        drawerOpen ? "visible" : "invisible pointer-events-none"
      }`}
      aria-hidden={!drawerOpen}
    >
      {/* Backdrop — deliberately NO backdrop-blur: an opacity-0 scrim with
          a backdrop-filter still composites and blackened the page (the
          LMS-studio black-screen lesson). */}
      <button
        type="button"
        tabIndex={drawerOpen ? 0 : -1}
        aria-label="Close menu"
        onClick={() => setDrawerOpen(false)}
        className={`absolute inset-0 bg-black/55 transition-opacity duration-300 ${
          drawerOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Floating rounded panel in the portal theme */}
      <aside
        className={`absolute inset-y-2 left-2 flex w-[300px] max-w-[85vw] flex-col overflow-hidden rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.6)] transition-transform duration-300 ease-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-[calc(100%+1.5rem)]"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Portal menu"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--pt-divider)] px-4 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Crest
              initials="STC"
              label="College crest"
              size="sm"
              logoSrc={brandLogo ?? undefined}
              logoScale={brandScale}
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-[14px] font-semibold text-[var(--pt-heading)]">
                St. Thomas&apos; College
              </span>
              <span className="block truncate text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--pt-accent-text)]">
                {PORTAL_SUB[role] ?? "Portal"}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-panel-soft)] hover:text-[var(--pt-heading)]"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Portal sections" className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {nav.map((item, idx) => {
              const Icon = iconFor(item.label);
              const isActive = idx === activeIdx;
              return (
                <li key={`${item.label}-${idx}`}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={(event) => handleNavClick(event, item.href, idx)}
                    className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13.5px] transition-colors duration-300 ${
                      isActive
                        ? "bg-[var(--pt-nav-active-bg)] font-semibold text-[var(--pt-nav-active-text)]"
                        : "font-medium text-[var(--pt-body)] hover:bg-[var(--pt-panel-soft)] hover:text-[var(--pt-heading)]"
                    }`}
                  >
                    <Icon size={17} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {item.badge != null && item.badge > 0 ? (
                      <span
                        aria-label={`${item.badge} unread`}
                        className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--pt-accent)] px-1.5 text-[10.5px] font-bold text-[var(--pt-on-accent)]"
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[var(--pt-divider)] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            href={profileHref}
            className="flex items-center gap-2.5 rounded-2xl px-1 py-1 transition-colors hover:opacity-85"
          >
            {avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--pt-accent)] text-xs font-bold text-[var(--pt-on-accent)]">
                {initialsOf(name) || "S"}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                {name || email}
              </span>
              <span className="block truncate text-[11px] text-[var(--pt-muted)]">{email}</span>
            </span>
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <PortalThemeToggle />
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-2 text-[12px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[rgb(244_63_94/0.35)] hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)] disabled:opacity-60"
            >
              <LogOut size={13} aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );

  return (
    <div className="portal-scope flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--pt-border)] bg-[var(--pt-header-bg)] backdrop-blur-xl">
        {/* v2.8.41.0 — header row 72px → 80px (owner: "portal header height
            eka poddak wadi karanna"); section scroll-mt-24 still clears it. */}
        <div className="mx-auto flex h-20 max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6">
          {/* Brand */}
          <Link
            href={nav[0]?.href ?? "#"}
            className="group flex items-center gap-2.5"
          >
            <Crest
              initials="STC"
              label="St. Thomas' College crest"
              size="md"
              logoSrc={brandLogo ?? undefined}
              logoScale={brandScale}
              className="transition-transform duration-500 group-hover:scale-105"
            />
            <span className="hidden leading-tight min-[420px]:block">
              <span className="block font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)]">
                St. Thomas&apos; College
              </span>
              <span className="block text-[9px] font-medium uppercase tracking-[0.28em] text-[var(--pt-accent-text)]">
                {PORTAL_SUB[role] ?? "Portal"}
              </span>
            </span>
          </Link>

          {/* Pill nav (desktop) — v2.8.53.0: the QUICK-ACCESS subset of the
              menu (the owner: the full 11-item strip ran out of width; the
              side panel has every item). Measured gold indicator glides
              between the subset's items; hidden while the current page is
              NOT in the subset (the drawer carries the highlight then). */}
          <nav
            aria-label="Portal sections"
            className="relative hidden items-center gap-0.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-nav-track)] p-1 md:flex"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-1 bottom-1 rounded-full bg-[var(--pt-nav-active-bg)] shadow-[var(--pt-nav-glow)] transition-[transform,width,opacity] duration-300 ease-out"
              style={{
                transform: `translateX(${pill.left}px)`,
                width: `${pill.width}px`,
                opacity: pill.ready && headerIdx >= 0 ? 1 : 0,
              }}
            />
            {headerItems.map(({ item, navIdx }, headerPos) => (
              <Link
                key={item.label}
                ref={(el) => {
                  linksRef.current[headerPos] = el;
                }}
                href={item.href}
                aria-current={headerPos === headerIdx ? "page" : undefined}
                onClick={(event) => handleNavClick(event, item.href, navIdx)}
                className={`relative z-10 whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-medium transition-colors duration-300 ${
                  headerPos === headerIdx
                    ? "text-[var(--pt-nav-active-text)]"
                    : "text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
                }`}
              >
                {item.label}
                {/* v2.8.51.0 — the Chat unread dot rides the pill itself */}
                {item.badge != null && item.badge > 0 ? (
                  <span
                    aria-label={`${item.badge} unread`}
                    className="absolute -right-0.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--pt-accent)] px-1 text-[9px] font-bold text-[var(--pt-on-accent)] shadow-sm"
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          {/* Actions — v2.8.41.0 (owner: "side panel eka open karana icon eka
              witharak thiyanna right side eke"): profile, theme and sign-out
              already live in the side panel, so the header keeps ONE button on
              every breakpoint. */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="grid h-10 w-10 place-items-center rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)]"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto border-t border-[var(--pt-border)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-center">
        <p className="text-[11px] tracking-[0.08em] text-[var(--pt-faint)]">
          St. Thomas&apos; College, Matale · {PORTAL_SUB[role] ?? "Portal"} ·
          Est. 1873
        </p>
      </footer>

      {/* Drawer lives at <body> level — a filtered ancestor (the blurred
          header) would otherwise become its containing block. */}
      {drawerMounted ? createPortal(drawer, document.body) : null}
    </div>
  );
}
