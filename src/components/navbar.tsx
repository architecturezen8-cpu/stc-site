"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Menu, Moon, Sun, X } from "lucide-react";

type NavLink = {
  label: string;
  href: string;
  children?: {
    label: string;
    href: string;
    live?: boolean;
    /** Gold NEW chip driven by /api/new-status (news posts/events or staff). */
    newFlag?: "news" | "staff";
  }[];
};

const links: NavLink[] = [
  { label: "Home", href: "/#home" },
  {
    label: "About Us",
    href: "/#about",
    children: [
      { label: "History", href: "/history" },
      { label: "Vision & Mission", href: "/vision-mission" },
      { label: "Principal's Message", href: "/principals-message" },
      { label: "Colours & Song", href: "/vision-mission#colours" },
      { label: "Staff", href: "/staff", newFlag: "staff" },
    ],
  },
  {
    label: "Academics",
    href: "/#academics",
    children: [
      { label: "Ordinary Level", href: "/ordinary-level" },
      { label: "Advanced Level", href: "/advanced-level" },
      { label: "Online Resources", href: "/resources" },
      { label: "Exam Results", href: "/exam-results" },
      { label: "Achievements", href: "/achievements" },
      { label: "Admissions", href: "/admissions" },
    ],
  },
  {
    label: "Co-Curricular",
    href: "/#cocurricular",
    children: [
      { label: "Clubs & Societies", href: "/clubs-societies" },
      { label: "Sports", href: "/sports" },
      { label: "Cadeting", href: "/cadeting" },
    ],
  },
  {
    label: "News & Events",
    href: "/news",
    children: [
      { label: "Latest News", href: "/news#latest", newFlag: "news" },
      { label: "Upcoming Events", href: "/news#events" },
      { label: "Gallery Archive", href: "/gallery" },
      { label: "Live", href: "/live", live: true },
    ],
  },
  { label: "Contact", href: "/contact" },
];

/** Blinking dot shown when the college is on air (red) or a stream is scheduled (green). */
function LiveDot({ tone, className = "" }: { tone: "red" | "green"; className?: string }) {
  const color = tone === "red" ? "bg-red-500" : "bg-emerald-500";
  const ping = tone === "red" ? "bg-red-400" : "bg-emerald-400";
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden="true">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${ping}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function ThemeToggle({ scrolled }: { scrolled: boolean }) {
  const [dark, setDark] = useState(false);

  // Defer to a frame so the effect body never sets state synchronously.
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setDark(document.documentElement.classList.contains("dark")),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);

    const root = document.documentElement;
    root.classList.add("theming");
    root.classList.toggle("dark", next);

    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }

    window.setTimeout(() => root.classList.remove("theming"), 650);
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`grid h-10 w-10 place-items-center rounded-full border transition-colors ${
        scrolled
          ? "border-fg/15 text-fg hover:bg-fg hover:text-surface"
          : "border-white/30 text-white hover:bg-white hover:text-ink"
      }`}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<"live" | "scheduled" | null>(null);
  const [hasNew, setHasNew] = useState<{ news: boolean; staff: boolean }>({
    news: false,
    staff: false,
  });
  const [brand, setBrand] = useState({
    brandName: "St. Thomas' College",
    brandSubline: "Matale · Est. 1873",
    schoolLogo: "",
  });
  /* v2.8.60.0 — a logo URL that fails (deleted blob, dead link) must fall
     back to the golden disc, never show a broken image. */
  const [logoFailed, setLogoFailed] = useState(false);
  const navLogo = brand.schoolLogo && !logoFailed ? brand.schoolLogo : "";

  useEffect(() => {
    fetch("/api/site-settings")
      .then((res) => res.json())
      .then((data) =>
        setBrand({
          brandName: data.brandName || "St. Thomas' College",
          brandSubline: data.brandSubline || "Matale · Est. 1873",
          schoolLogo: data.schoolLogo || "",
        }),
      )
      .catch(() => undefined);
  }, []);

  // Poll the live channel — red dot while ON AIR, green dot when a stream is scheduled.
  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      fetch("/api/live/status", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => setLiveState(data.live ? "live" : data.scheduled ? "scheduled" : null))
        .catch(() => undefined);
      // Gold NEW chips — "Latest News" while new posts/events are flagged,
      // "Staff" while a new teacher carries the badge.
      fetch("/api/new-status", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) =>
          setHasNew({
            news: Boolean(data?.news),
            staff: Boolean(data?.staff),
          }),
        )
        .catch(() => undefined);
    };
    check();
    timer = window.setInterval(check, 45000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? "border-b border-fg/10 bg-surface text-fg"
            : "bg-transparent text-white"
        }`}
      >
        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 md:px-8">
          {/* Brand */}
          <Link href="/#home" className="group flex items-center gap-3">
            {navLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={navLogo}
                alt={`${brand.brandName} logo`}
                onError={() => setLogoFailed(true)}
                className="h-10 w-10 rounded-full border border-white/20 bg-white object-contain p-0.5 transition-transform duration-700 group-hover:rotate-[360deg]"
              />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gold font-display text-xl font-semibold text-ink transition-transform duration-700 group-hover:rotate-[360deg]">
                S
              </span>
            )}
            <span className="leading-tight">
              <span className="block font-display text-[1.15rem] font-semibold tracking-[-0.01em]">
                St. Thomas&apos; College
              </span>
              <span
                className={`block font-sans text-[9px] uppercase tracking-[0.35em] ${
                  scrolled ? "text-fg/45" : "text-white/60"
                }`}
              >
                {brand.brandSubline}
              </span>
            </span>
          </Link>

          {/* Desktop links */}
          <ul className="hidden lg:flex">
            {links.map((link) => (
              <li key={link.label} className="group relative flex h-20 items-center px-4 xl:px-4.5">
                <Link
                  href={link.href}
                  className={`nav-link flex items-center gap-1.5 text-[13.5px] font-medium tracking-[-0.01em] transition-colors ${
                    scrolled
                      ? "text-fg/65 hover:text-fg"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  {link.label === "News & Events" && liveState && (
                    <LiveDot tone={liveState === "live" ? "red" : "green"} />
                  )}
                  {link.label}
                  {link.children && (
                    <ChevronDown
                      size={12}
                      className="transition-transform duration-300 group-hover:rotate-180"
                    />
                  )}
                </Link>

                {link.children && (
                  <div className="invisible absolute left-1/2 top-full -translate-x-1/2 -translate-y-1 opacity-0 transition-all duration-300 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                    <div className="min-w-[230px] rounded-xl border border-white/10 bg-[#101009]/95 p-2 shadow-lift backdrop-blur-md">
                      {link.children.map((child) => (
                        <Link
                          key={child.label}
                          href={child.href}
                          className="flex items-center justify-between rounded-xl px-4 py-2.5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <span className="flex items-center gap-2">
                            {child.live && liveState && (
                              <LiveDot tone={liveState === "live" ? "red" : "green"} />
                            )}
                            {child.label}
                            {child.newFlag && hasNew[child.newFlag] && (
                              <span className="rounded-full bg-gold px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.1em] text-ink">
                                New
                              </span>
                            )}
                          </span>
                          {child.live && liveState === "live" && (
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-red-500">
                              On air
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* CTA + theme + mobile toggle */}
          <div className="flex items-center gap-2.5">
            <ThemeToggle scrolled={scrolled} />
            <Link
              href="/login"
              className="group hidden items-center gap-2 rounded-full bg-gold px-6 py-3 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-fg hover:text-surface lg:inline-flex"
            >
              Login
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className={`grid h-10 w-10 place-items-center rounded-full border transition-colors lg:hidden ${
                scrolled
                  ? "border-fg/15 text-fg hover:bg-fg hover:text-surface"
                  : "border-white/30 text-white hover:bg-white hover:text-ink"
              }`}
            >
              <Menu size={18} />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile fullscreen menu */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-ink text-white">
          <div className="relative flex h-20 shrink-0 items-center justify-between px-5 md:px-8">
            <Link
              href="/#home"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3"
            >
              {brand.schoolLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={brand.schoolLogo}
                  alt={`${brand.brandName} logo`}
                  className="h-10 w-10 rounded-full border border-white/20 bg-white object-contain p-0.5"
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gold font-display text-xl font-semibold text-ink">
                  S
                </span>
              )}
              <span className="leading-tight">
                <span className="block font-display text-lg font-semibold tracking-[-0.01em]">
                  {brand.brandName}
                </span>
                <span className="block font-sans text-[8px] uppercase tracking-[0.32em] text-white/55">
                  Matale · Est. 1873
                </span>
              </span>
            </Link>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/25 text-white transition-colors hover:bg-white hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>

          <nav className="relative flex flex-1 flex-col justify-center px-6 py-8 md:px-14">
            <ul className="space-y-1">
              {links.map((link, i) => {
                const isExpanded = expanded === link.label;
                return (
                  <li
                    key={link.label}
                    className="animate-fade-up"
                    style={{ animationDelay: `${100 + i * 60}ms` }}
                  >
                    {link.children ? (
                      <div>
                        <div className="flex items-center rounded-xl px-2 transition-colors hover:bg-white/5">
                          <Link
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="block flex-1 py-2.5 font-display text-[19px] font-semibold tracking-[-0.01em] md:text-[21px]"
                          >
                            {link.label}
                          </Link>
                          <button
                            onClick={() => setExpanded(isExpanded ? null : link.label)}
                            aria-label={`Toggle ${link.label} submenu`}
                            aria-expanded={isExpanded}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-white/70"
                          >
                            <ChevronDown
                              size={16}
                              className={`transition-transform duration-500 ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </div>

                        {/* Smooth expanding submenu */}
                        <div
                          className={`grid transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            isExpanded
                              ? "grid-rows-[1fr] opacity-100"
                              : "grid-rows-[0fr] opacity-0"
                          }`}
                        >
                          <div className="overflow-hidden">
                            <ul className="ml-5 space-y-0.5 border-l border-white/10 pb-2 pl-5 pt-1">
                              {link.children.map((child, ci) => (
                                <li
                                  key={child.label}
                                  className={`transition-all duration-500 ${
                                    isExpanded
                                      ? "translate-x-0 opacity-100"
                                      : "-translate-x-2 opacity-0"
                                  }`}
                                  style={{ transitionDelay: isExpanded ? `${120 + ci * 60}ms` : "0ms" }}
                                >
                                  <Link
                                    href={child.href}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-2 py-2 font-display text-[15px] font-medium tracking-[-0.01em] text-white/60 transition-colors hover:text-gold"
                                  >
                                    {child.live && liveState && (
                                      <LiveDot tone={liveState === "live" ? "red" : "green"} />
                                    )}
                                    {child.label}
                                    {child.newFlag && hasNew[child.newFlag] && (
                                      <span className="rounded-full bg-gold px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.1em] text-ink">
                                        New
                                      </span>
                                    )}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl px-2 py-2.5 font-display text-[19px] font-semibold tracking-[-0.01em] transition-colors hover:bg-white/5 md:text-[21px]"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Mobile Login */}
          <div className="relative shrink-0 px-6 pb-10 md:px-14">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-gold py-4 text-sm font-medium text-ink transition-colors duration-300 hover:bg-white"
            >
              Login
              <ArrowUpRight
                size={15}
                className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
