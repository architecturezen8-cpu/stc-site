"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { MODULE_LABELS, type AccessTourItem, type AdminModule } from "@/lib/admin-roles";

/**
 * v2.9.12.1 — NEW-ACCESS TOUR (Admin Studio)
 *
 * When an admin's access is UPDATED with features they did not hold before,
 * the diff is queued on the account (admin_users.pending_tour) and THIS walk
 * plays on their next visit: a spotlight moves down the real sidebar, landing
 * on each freshly granted feature — "the admin gave you X — here's where it
 * lives" (owner: "e aluthin add karapu feature eka locate wela tour eke
 * yanawa… admin oyata aluthin access ekak dila thiyanawa wage ekak").
 *
 * Viewports without a visible sidebar target (phone, or a module with no nav
 * home such as Audit Log) fall back to a centred card for that step.
 * Finishing OR skipping clears the queue via /api/admin/access-tour/complete
 * so it never replays.
 */

/** Sidebar anchor per module (v2.9.12.3 — the six form sections share the
 *  Form Management group anchor; audit has no nav home → centred card). */
const MODULE_TOUR_ID: Partial<Record<AdminModule, string>> = {
  dashboard: "welcome",
  analytics: "nav-analytics",
  pages: "nav-pages",
  news: "nav-news",
  notices: "nav-notices",
  events: "nav-events",
  staff: "nav-staff",
  clubs: "nav-clubs",
  live: "nav-live",
  filters: "nav-filters",
  "forms-grade6": "nav-forms",
  "forms-alevel": "nav-forms",
  "forms-contacts": "nav-forms",
  "forms-appointments": "nav-forms",
  "forms-customize": "nav-forms",
  "forms-builder": "nav-forms",
  media: "nav-media",
  gallery: "nav-gallery",
  "unit-gallery": "nav-unit-gallery",
  resources: "nav-resources",
  logos: "nav-logos",
  navigation: "nav-navigation",
  footer: "nav-footer",
  preloaders: "nav-preloaders",
  popups: "nav-popups",
  roles: "nav-roles",
  portal: "nav-portal",
  notifications: "nav-notifications",
  settings: "nav-settings",
  versions: "nav-versions",
  storage: "nav-storage",
  backup: "nav-backup",
  email: "nav-email",
  theme: "nav-theme",
};

const SETTLE_MS = 380; // wait for the smooth scroll before measuring
const PAD = 8;

const prefersReduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function AdminAccessTour({ steps }: { steps: AccessTourItem[] }) {
  const [index, setIndex] = useState(0); // 0 = intro card, 1..n = modules
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  const measureRaf = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    /* stamp the queue as seen (fire-and-forget — never trap the user) */
    fetch("/api/admin/access-tour/complete", { method: "POST", keepalive: true })
      .catch(() => undefined);
    setDone(true);
  }, []);

  /* ── measure one step: spotlight the sidebar anchor when it is on
        screen, otherwise fall back to the centred card ─────────────────── */
  const measure = useCallback((i: number) => {
    if (i <= 0 || i > steps.length) {
      setRect(null);
      setReady(true);
      return;
    }
    const item = steps[i - 1];
    const id = item ? MODULE_TOUR_ID[item.module] : undefined;
    const el = id
      ? document.querySelector<HTMLElement>(`[data-tour="${id}"]`)
      : null;

    let usable = false;
    if (el && el.offsetParent !== null) {
      const r = el.getBoundingClientRect();
      /* on-screen only — the closed mobile drawer renders off-canvas and
         must NOT be spotlighted through the overlay */
      usable =
        r.width > 0 && r.height > 0 && r.left >= -2 && r.right <= window.innerWidth + 2;
    }
    if (!usable) {
      setRect(null);
      setReady(true);
      return;
    }
    const reduced = prefersReduced();
    el!.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    cancelAnimationFrame(measureRaf.current);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    measureRaf.current = requestAnimationFrame(() => {
      settleTimer.current = setTimeout(() => {
        setRect(el!.getBoundingClientRect());
        setReady(true);
      }, reduced ? 30 : SETTLE_MS);
    });
  }, [steps]);

  /* re-measure on step change + keep the spotlight glued on reflow */
  useEffect(() => {
    if (done) return;
    const kick = setTimeout(() => measure(index), 60);
    const onReflow = () => {
      if (index <= 0 || index > steps.length) return;
      cancelAnimationFrame(measureRaf.current);
      measureRaf.current = requestAnimationFrame(() => measure(index));
    };
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      clearTimeout(kick);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
      cancelAnimationFrame(measureRaf.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [done, index, measure, steps.length]);

  /* keyboard: → next · ← back · Esc skip */
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter")
        setIndex((i) => (i >= steps.length ? i : i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, finish, steps.length]);

  /* scroll lock while the walk is on screen */
  useEffect(() => {
    if (done) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [done]);

  if (done || steps.length === 0) return null;

  const step = index > 0 ? steps[index - 1] : null;
  const ringStyle = step && rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        borderRadius: 14,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.84)",
      }
    : undefined;
  const spotlighting = Boolean(step && rect);

  /* anchored card geometry — under the ring when it fits, above it when
     it doesn't (mirrors the onboarding tour's placement) */
  let tipStyle: React.CSSProperties | undefined;
  if (spotlighting && rect) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const TIP_H = 215;
    const below = rect.bottom + PAD + 12;
    const top = below + TIP_H < vh - 14 ? below : Math.max(14, rect.top - PAD - TIP_H - 12);
    const left = Math.min(
      Math.max(14, rect.left),
      Math.max(14, vw - 376 - 14),
    );
    tipStyle = { top, left, width: "min(92vw, 360px)" };
  }

  /* the shared explanation card — anchored next to the spotlight on
     desktop, centred for the intro / fallback steps */
  const card = (extra?: string, style?: React.CSSProperties) => (
    <div
      className={`fixed z-[101] w-[min(92vw,360px)] rounded-2xl border border-white/12 bg-[#111110]/95 p-4 shadow-2xl backdrop-blur-md ${
        extra ?? ""
      }`}
      style={style}
      role="status"
    >
      <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.3em] text-[#ffd444]/80">
        <Sparkles size={11} /> New access · {Math.max(1, index)} / {steps.length}
      </p>
      {step ? (
        <>
          <h3 className="mt-1.5 font-display text-[16px] font-semibold tracking-[-0.01em] text-white">
            {MODULE_LABELS[step.module]}
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">
            {step.level === "edit"
              ? "The admin has given you FULL access — you can make changes here."
              : "The admin has given you VIEW access — you can look around, but not change things."}
          </p>
        </>
      ) : (
        <>
          <h3 className="mt-1.5 font-display text-[16px] font-semibold tracking-[-0.01em] text-white">
            You&apos;ve been given new access
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">
            The admin recently added {steps.length === 1 ? "a new feature" : `${steps.length} new features`} to
            your account. A quick walk to where {steps.length === 1 ? "it" : "each one"} lives.
          </p>
        </>
      )}
      <div className="mt-3.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={finish}
          className="text-[11px] font-medium text-white/35 transition-colors hover:text-white/75"
        >
          Skip
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => {
                setReady(false);
                setIndex((i) => Math.max(0, i - 1));
              }}
              className="rounded-full border border-white/12 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setReady(false);
              index >= steps.length ? finish() : setIndex((i) => i + 1);
            }}
            className="rounded-full bg-[#ffd444] px-5 py-2 text-[11px] font-semibold text-[#0b0b0a] transition-transform hover:-translate-y-0.5"
          >
            {index === 0 ? "Show me" : index >= steps.length ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New access tour"
      className={`fixed inset-0 z-[100] ${ready ? "opacity-100" : "opacity-0"} transition-opacity duration-500`}
    >
      {spotlighting ? (
        <>
          {/* the cutout ring — its shadow dims everything else */}
          <div
            className="pointer-events-none fixed transition-all duration-300 ease-out"
            style={{ ...ringStyle, border: "1.5px solid rgba(255,212,68,0.9)" }}
          >
            <div className="stc-onb-ring absolute inset-0 rounded-[14px]" />
          </div>
          {card(undefined, tipStyle)}
        </>
      ) : (
        /* intro / fallback — dimmed screen, card front and centre */
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4">
          {card()}
        </div>
      )}
    </div>
  );
}
