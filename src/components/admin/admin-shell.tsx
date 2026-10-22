"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { AdminEmblem } from "@/components/admin/admin-emblem";
import { can, roleLabel, type AdminModule } from "@/lib/admin-roles";
import {
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  FileText,
  FolderKanban,
  GraduationCap,
  Hexagon,
  History,
  Images,
  Inbox,
  LayoutDashboard,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  Newspaper,
  PanelBottom,
  Palette,
  Radio,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";

const PAGES = [
  { label: "Home Page", path: "/" },
  { label: "History Page", path: "/history" },
  { label: "Admissions", path: "/admissions" },
  { label: "Advanced Level", path: "/advanced-level" },
];

/** Admin Studio cinematic theme presets (Admin → Theme). */
export type AdminTheme = "gold" | "royal" | "violet" | "dark";
export const ADMIN_THEME_KEYS = new Set<string>(["gold", "royal", "violet", "dark"]);

type ShellUser = { name: string; role: string; avatar?: string | null };

/** Sidebar groups — the studio is organised into clean sections. */
const NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    label: string;
    href: string;
    module: AdminModule;
    icon: typeof Newspaper;
    match: (p: string) => boolean;
  }>;
}> = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/admin",
        module: "dashboard",
        icon: LayoutDashboard,
        match: (p) => p === "/admin",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        label: "Pages",
        href: "/admin/pages",
        module: "pages",
        icon: Layers,
        match: (p) => p.startsWith("/admin/pages") || p.startsWith("/admin/editor"),
      },
      {
        label: "News & Stories",
        href: "/admin/news",
        module: "news",
        icon: Newspaper,
        match: (p) => p.startsWith("/admin/news"),
      },
      {
        label: "Events & Schedule",
        href: "/admin/events",
        module: "events",
        icon: CalendarDays,
        match: (p) => p.startsWith("/admin/events"),
      },
      {
        label: "Faculty & Staff",
        href: "/admin/staff",
        module: "staff",
        icon: GraduationCap,
        match: (p) => p.startsWith("/admin/staff"),
      },
      {
        label: "Live Streams",
        href: "/admin/live",
        module: "live",
        icon: Radio,
        match: (p) => p.startsWith("/admin/live"),
      },
      {
        label: "Filters & Categories",
        href: "/admin/filters",
        module: "filters",
        icon: SlidersHorizontal,
        match: (p) => p.startsWith("/admin/filters"),
      },
    ],
  },
  {
    label: "Form Management",
    items: [
      {
        label: "Grade 6 Applications",
        href: "/admin/forms/grade-6",
        module: "forms",
        icon: GraduationCap,
        match: (p) => p.startsWith("/admin/forms/grade-6"),
      },
      {
        label: "A/L Applications",
        href: "/admin/forms/alevel",
        module: "forms",
        icon: BookOpenCheck,
        match: (p) => p.startsWith("/admin/forms/alevel"),
      },
      {
        label: "Contact Messages",
        href: "/admin/forms/contacts",
        module: "forms",
        icon: Inbox,
        match: (p) => p.startsWith("/admin/forms/contacts"),
      },
      {
        label: "Appointments",
        href: "/admin/forms/appointments",
        module: "forms",
        icon: CalendarCheck2,
        match: (p) => p.startsWith("/admin/forms/appointments"),
      },
    ],
  },
  {
    label: "Media",
    items: [
      {
        label: "Media Library",
        href: "/admin/media",
        module: "media",
        icon: FolderKanban,
        match: (p) => p.startsWith("/admin/media"),
      },
      {
        label: "Campus Gallery",
        href: "/admin/gallery",
        module: "gallery",
        icon: Images,
        match: (p) => p.startsWith("/admin/gallery") && !p.startsWith("/admin/unit-gallery"),
      },
      {
        label: "Unit Galleries",
        href: "/admin/unit-gallery",
        module: "unit-gallery",
        icon: Images,
        match: (p) => p.startsWith("/admin/unit-gallery"),
      },
    ],
  },
  {
    label: "Website",
    items: [
      {
        label: "Online Resources",
        href: "/admin/resources",
        module: "resources",
        icon: BookOpenCheck,
        match: (p) => p.startsWith("/admin/resources"),
      },
      {
        label: "Logos & Crests",
        href: "/admin/logos",
        module: "logos",
        icon: Hexagon,
        match: (p) => p.startsWith("/admin/logos"),
      },
      {
        label: "Footer",
        href: "/admin/footer",
        module: "footer",
        icon: PanelBottom,
        match: (p) => p.startsWith("/admin/footer"),
      },
      {
        label: "Preloaders",
        href: "/admin/preloaders",
        module: "preloaders",
        icon: Clapperboard,
        match: (p) => p.startsWith("/admin/preloaders"),
      },
      {
        label: "Popups",
        href: "/admin/popups",
        module: "popups",
        icon: Megaphone,
        match: (p) => p.startsWith("/admin/popups"),
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Settings",
        href: "/admin/settings",
        module: "settings",
        icon: Settings,
        match: (p) => p.startsWith("/admin/settings"),
      },
      {
        label: "Role Management",
        href: "/admin/roles",
        module: "roles",
        icon: ShieldCheck,
        match: (p) => p.startsWith("/admin/roles"),
      },
      {
        label: "Portal Users",
        href: "/admin/portal-users",
        module: "portal",
        icon: UsersRound,
        match: (p) => p.startsWith("/admin/portal-users"),
      },
      /* v2.8.35.0 — module isolation: LMS operations (Registration
         Approvals, Verification Records, LMS Setup) moved OUT of the
         website Admin Studio. The LMS team manages them at /lms-admin
         with their own accounts. */
      {
        label: "Theme",
        href: "/admin/theme",
        module: "theme",
        icon: Palette,
        match: (p) => p.startsWith("/admin/theme"),
      },
      {
        label: "Profile",
        href: "/admin/profile",
        module: "profile",
        icon: UserRound,
        match: (p) => p.startsWith("/admin/profile"),
      },
      {
        label: "Version History",
        href: "/admin/versions",
        module: "versions",
        icon: History,
        match: (p) => p.startsWith("/admin/versions"),
      },
    ],
  },
];

/**
 * Shared rail content — rendered inside the fixed desktop sidebar and the
 * mobile slide-in drawer. `variant="mobile"` raises every touch target to
 * ≥44px and closes the drawer after each navigation.
 */
function RailContent({
  user,
  pathname,
  variant,
  onNavigate,
}: {
  user: ShellUser;
  pathname: string;
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const inPages = pathname.startsWith("/admin/pages") || pathname.startsWith("/admin/editor");
  const [openPages, setOpenPages] = useState(inPages);
  const touch = variant === "mobile";

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-colors ${
      touch ? "min-h-11 " : ""
    }${
      active
        ? "bg-[#ffd444] text-[#0b0b0a]"
        : "text-white/55 hover:bg-white/[0.06] hover:text-white"
    }`;

  return (
    <>
      <Link href="/admin" onClick={onNavigate} className="flex items-center gap-3 px-1 py-2">
        <AdminEmblem size={44} />
        <span className="leading-tight">
          <span className="block font-display text-base font-semibold">Admin Studio</span>
          <span className="text-[8px] uppercase tracking-[0.25em] text-white/35">
            St. Thomas&apos; College
          </span>
        </span>
      </Link>

      <nav className="mt-8 flex-1 space-y-5 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => can(user.role, item.module, "read"));
          if (items.length === 0) return null;
          return (
          <div key={group.label}>
            <p className="mb-2 px-4 text-[8px] font-semibold uppercase tracking-[0.3em] text-white/25">
              {group.label}
            </p>
            <div className="space-y-1">
              {items.map((item) => {
                const isPages = item.href === "/admin/pages";
                return (
                  <div key={item.href}>
                    {isPages ? (
                      /* Pages keeps its expandable subgroup */
                      <div>
                        <button
                          onClick={() => setOpenPages((v) => !v)}
                          className={`${linkCls(inPages && !openPages)} w-full justify-between`}
                        >
                          <span className="flex items-center gap-3">
                            <item.icon size={16} /> {item.label}
                          </span>
                          <ChevronDown
                            size={13}
                            className={`transition-transform duration-300 ${openPages ? "rotate-180" : ""}`}
                          />
                        </button>
                        <div
                          className={`grid transition-all duration-400 ease-out ${
                            openPages ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div className="ml-5 mt-1 space-y-1 border-l border-white/10 pl-3">
                              <Link
                                href="/admin/pages"
                                onClick={onNavigate}
                                className={`block rounded-lg px-3 py-2 text-[12px] transition-colors ${
                                  pathname === "/admin/pages"
                                    ? "bg-white/10 text-[#ffd444]"
                                    : "text-white/45 hover:text-white"
                                } ${touch ? "min-h-11 leading-[1.6]" : ""}`}
                              >
                                All pages
                              </Link>
                              {PAGES.map((page) => (
                                <Link
                                  key={page.path}
                                  href={`${page.path}${page.path.includes("?") ? "&" : "?"}visualEditor=1`}
                                  onClick={onNavigate}
                                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-white/45 transition-colors hover:bg-white/5 hover:text-[#ffd444] ${
                                    touch ? "min-h-11" : ""
                                  }`}
                                >
                                  <FileText size={12} /> {page.label}
                                </Link>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Link href={item.href} onClick={onNavigate} className={linkCls(item.match(pathname))}>
                        <item.icon size={16} /> {item.label}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </nav>

      <div className="mt-5 border-t border-white/10 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white font-display text-[13px] font-bold text-[#0b0b0a] ring-1 ring-black/10">
            {user.avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              user.name
                .split(" ")
                .map((n) => n[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase()
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{user.name}</p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.2em] text-white/30">
              {roleLabel(user.role)} · {APP_VERSION_LABEL}
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Link
            href="/"
            target="_blank"
            className={`grid flex-1 place-items-center rounded-xl border border-white/12 text-white/50 transition-colors hover:border-white/30 hover:text-white ${
              touch ? "h-11" : "h-10"
            }`}
            aria-label="View site"
          >
            <ExternalLink size={15} />
          </Link>
          <form action="/api/admin/auth/logout" method="post" className="flex-1">
            <button
              className={`grid w-full place-items-center rounded-xl border border-white/12 text-white/50 transition-colors hover:border-white/30 hover:text-white ${
                touch ? "h-11" : "h-10"
              }`}
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export function AdminShell({
  children,
  user,
  title,
  subtitle,
  actions,
  flush = false,
}: {
  children: ReactNode;
  user: ShellUser;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Remove page padding — used by the full-bleed visual editor. */
  flush?: boolean;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<AdminTheme>("gold");

  /* Cinematic admin theme: device cookie first (matches the pre-paint
     bootstrap in the admin layout — no gold flash on reload), then the
     stored choice (same browser), then the published setting (cross-device,
     which also refreshes the cookie). The Theme manager broadcasts
     "stc-admin-theme" so a change applies instantly without a reload. */
  useEffect(() => {
    const apply = (value: unknown) => {
      if (typeof value === "string" && ADMIN_THEME_KEYS.has(value)) {
        setTheme(value as AdminTheme);
        try {
          window.localStorage.setItem("stc-admin-theme", value);
        } catch {
          /* private mode — session-only theme */
        }
      }
    };
    try {
      const fromCookie = document.cookie
        .match(/(?:^|; )stc-admin-theme=([^;]*)/)?.[1];
      const cookieTheme = fromCookie ? decodeURIComponent(fromCookie) : "";
      if (ADMIN_THEME_KEYS.has(cookieTheme)) apply(cookieTheme);
      else apply(window.localStorage.getItem("stc-admin-theme"));
    } catch {
      /* ignore */
    }
    fetch("/api/admin/theme", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && apply(d.theme))
      .catch(() => undefined);
    const onTheme = (event: Event) =>
      apply((event as CustomEvent<{ theme?: string }>).detail?.theme);
    window.addEventListener("stc-admin-theme", onTheme);
    return () => window.removeEventListener("stc-admin-theme", onTheme);
  }, []);

  /* Keep the pre-paint <html data-admin-theme> attribute (set by the layout
     bootstrap) in step with the React state — and remove it when leaving the
     admin so the theme CSS can never leak onto the public site. */
  useEffect(() => {
    document.documentElement.setAttribute("data-admin-theme", theme);
    return () => {
      document.documentElement.removeAttribute("data-admin-theme");
    };
  }, [theme]);

  /* Scrollbars follow the theme — inner scroll areas via CSS (globals), the
     page scrollbar via these html rules, injected while the admin is mounted
     and removed on unmount so the public site keeps its native look. */
  useEffect(() => {
    const ACCENTS: Record<AdminTheme, string> = {
      gold: "#ffd444",
      royal: "#8fb2ff",
      violet: "#d795ff",
      dark: "#ffd444",
    };
    const accent = ACCENTS[theme] || ACCENTS.gold;
    const root = document.documentElement;
    root.style.scrollbarColor = `color-mix(in srgb, ${accent} 38%, rgba(255,255,255,0.16)) transparent`;
    const style = document.createElement("style");
    style.dataset.stcAdminScroll = "1";
    style.textContent =
      `html::-webkit-scrollbar{width:11px;height:11px}` +
      `html::-webkit-scrollbar-track{background:transparent}` +
      `html::-webkit-scrollbar-thumb{border-radius:999px;border:3px solid transparent;background-clip:padding-box;` +
      `background-color:color-mix(in srgb, ${accent} 38%, rgba(255,255,255,0.16))}` +
      `html::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb, ${accent} 62%, rgba(255,255,255,0.24))}`;
    document.head.appendChild(style);
    return () => {
      style.remove();
      root.style.removeProperty("scrollbar-color");
    };
  }, [theme]);

  /* While the mobile drawer is open: lock body scroll and close on Escape. */
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <div data-admin-theme={theme} className="adm-root min-h-svh bg-[#0a0a09] text-white">
      {/* Cinematic canvas — viewport-fixed glow layer so the theme gradient
          covers the WHOLE background at every scroll position (mobile-safe;
          replaces the old background-attachment hack that phones ignore). */}
      <div aria-hidden="true" className="adm-canvas" />

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-[#0d0d0b] p-5 lg:flex">
        <RailContent user={user} pathname={pathname} variant="desktop" />
      </aside>

      {/* Mobile drawer backdrop */}
      <div
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-[60] bg-black/60 transition-opacity duration-300 lg:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Mobile slide-in drawer */}
      <aside
        id="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        inert={!drawerOpen}
        className={`adm-drawer fixed inset-y-0 left-0 z-[70] flex w-[85vw] max-w-72 flex-col border-r border-white/10 bg-[#0d0d0b] p-5 transition-transform duration-300 ease-out lg:hidden ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <RailContent
          user={user}
          pathname={pathname}
          variant="mobile"
          onNavigate={() => setDrawerOpen(false)}
        />
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="adm-header sticky top-0 z-30 border-b border-white/10 bg-[#0a0a09]">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={drawerOpen}
                aria-controls="admin-drawer"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/70 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
              >
                <Menu size={20} />
              </button>
              <span className="hidden min-[400px]:block lg:hidden">
                <AdminEmblem size={34} />
              </span>
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-0.5 truncate text-[11px] text-white/40 sm:text-[12px]">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          </div>
        </header>
        <main className={flush ? "" : "px-4 pb-20 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10"}>
          {children}
        </main>
      </div>
    </div>
  );
}
