"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, Megaphone, Radio, X } from "lucide-react";
import { PlatformIcon, PlatformIconForUrl } from "@/components/platform-icon";
import { LIVE_PLATFORMS } from "@/lib/live";

type PopupLink = { label?: string; url?: string };

type ActivePopup = {
  id: number;
  title: string;
  message: string;
  kind: string;
  bannerUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  eventAt: string | null;
  platform: string | null;
  links: PopupLink[];
  frequency: string;
  delayMs: number;
};

const KIND_META: Record<string, { label: string; badge: string; icon: typeof Megaphone }> = {
  event: {
    label: "Event",
    /* Theme-aware: dark text tints in light mode, light tints in dark mode —
       the old light-only tints (violet-200/red-200) vanished on white. */
    badge: "bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    icon: CalendarClock,
  },
  live: {
    label: "Live",
    badge: "bg-red-500/15 text-red-700 dark:bg-red-500/25 dark:text-red-200",
    icon: Radio,
  },
  message: {
    label: "Announcement",
    badge: "bg-[#ffd444]/25 text-amber-800 dark:bg-[#ffd444]/20 dark:text-[#ffd444]",
    icon: Megaphone,
  },
};

const EVENT_WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Storage key folds id+title+message into the key, so edited popups
 * naturally show again even for "once" visitors.
 */
function seenKey(popup: ActivePopup) {
  let hash = 0;
  const seed = `${popup.id}|${popup.title}|${popup.message}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `stc:popup-seen:${popup.id}:${hash.toString(36)}`;
}

function alreadySeen(popup: ActivePopup): boolean {
  try {
    if (popup.frequency === "always") return false;
    if (popup.frequency === "once") {
      return window.localStorage.getItem(seenKey(popup)) === "1";
    }
    return window.sessionStorage.getItem(seenKey(popup)) === "1"; // session
  } catch {
    return false;
  }
}

function markSeen(popup: ActivePopup) {
  try {
    if (popup.frequency === "always") return;
    if (popup.frequency === "once") {
      window.localStorage.setItem(seenKey(popup), "1");
    } else {
      window.sessionStorage.setItem(seenKey(popup), "1");
    }
  } catch {
    /* storage unavailable — popup simply shows again next visit */
  }
}

/**
 * Site-wide announcement popup — events, live sessions and special messages,
 * fully controlled from Admin → Website → Popups.
 *
 * Rendered in the root layout so it can appear on any public page
 * (never inside /admin). Respects the popup's frequency setting.
 * Always centred on the page (mobile included).
 */
export function SitePopup() {
  const [popup, setPopup] = useState<ActivePopup | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/lms-admin")) return;

    let timer: number | undefined;
    let cancelled = false;

    fetch("/api/popups/active", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const next = data?.popup as ActivePopup | null;
        if (cancelled || !next || alreadySeen(next)) return;
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setPopup(next);
          setVisible(true);
          markSeen(next);
        }, Math.max(0, Math.min(30000, Number(next.delayMs) || 1500)));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [visible]);

  if (!popup || !visible) return null;

  const meta = KIND_META[popup.kind] ?? KIND_META.message;
  const Icon = meta.icon;
  const platformLabel = LIVE_PLATFORMS.find((p) => p.value === popup.platform)?.label;
  const socialLinks = (popup.links ?? []).filter((l) => l?.url && l?.label !== undefined);
  const isLive = popup.kind === "live";

  return (
    <div
      data-visual-ui=""
      role="dialog"
      aria-modal="true"
      aria-label={popup.title}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm sm:p-6"
      onClick={() => setVisible(false)}
    >
      <div
        className="max-h-[88svh] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl border border-white/12 bg-surface text-fg shadow-2xl sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "fade-up 480ms cubic-bezier(0.22,1,0.36,1) both" }}
      >
        {popup.bannerUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={popup.bannerUrl}
            alt=""
            className="h-44 w-full object-cover sm:h-52"
          />
        )}

        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${meta.badge}`}
              >
                <Icon size={11} /> {meta.label}
              </span>
              {isLive && popup.platform && popup.platform !== "other" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-fg/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-fg/70 dark:bg-white/10">
                  <PlatformIcon platform={popup.platform} size={11} />{" "}
                  {platformLabel ?? popup.platform}
                </span>
              )}
            </div>
            <button
              onClick={() => setVisible(false)}
              aria-label="Close popup"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-fg/15 text-fg/50 transition-colors hover:bg-fg hover:text-surface"
            >
              <X size={15} />
            </button>
          </div>

          <h3 className="mt-4 font-display text-xl font-semibold leading-tight tracking-[-0.01em] sm:text-2xl">
            {popup.title}
          </h3>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fg/65">
            {popup.message}
          </p>

          {popup.eventAt && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-fg/12 bg-surface-2 px-3.5 py-2.5 text-[12.5px] font-medium text-fg/75">
              <CalendarDays size={14} className="text-gold" />
              {EVENT_WHEN.format(new Date(popup.eventAt))}
            </p>
          )}

          {socialLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {socialLinks.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.label || undefined}
                  className="inline-flex items-center gap-2 rounded-full border border-fg/15 px-3.5 py-2 text-[11.5px] font-medium text-fg/70 transition-colors hover:border-gold hover:text-fg"
                >
                  <PlatformIconForUrl url={link.url ?? ""} size={13} />
                  {link.label}
                </a>
              ))}
            </div>
          )}

          {popup.linkUrl && (
            <Link
              href={popup.linkUrl}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-fg hover:text-surface"
            >
              {popup.linkLabel || "Learn more"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
