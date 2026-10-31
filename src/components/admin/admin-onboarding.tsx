"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * v2.9.9.0 — FIRST-LOGIN ONBOARDING (Admin Studio)
 *
 * The owner: "admin kenek mulinma eddi … full screen ekama black wenawa …
 * Center eken 'Hi' … 'Welcome Acc Name' … 'I would like to set up your
 * account.' … 'Are you all set?' … 'Let's Start' … 15sec walin smoothwa,
 * text eka white. Ita passe features eken important features witharak
 * adala locations wala explain karanna."
 *
 * Stage 1 — CINEMA: a full-screen black overlay; five white lines cross-fade
 * from the centre over ~15s, then the whole screen fades into the studio.
 * Stage 2 — TOUR: a spotlight walks the REAL dashboard, pausing on the
 * important features (Visual Editor, News, Media, Forms, notifications…)
 * exactly where they live. Either stage can be skipped; finishing stamps
 * admin_users.onboarded_at via the onboarding/complete API so it never
 * replays for the account.
 *
 * v2.9.9.1 polish — ALL five intro lines render at ONE size (the owner:
 * "okkoma ekama size eken danna"), each beat blur-fades into sharpness
 * (blur-md → blur-0 riding the same 700ms transition), and the desktop
 * tour grew from 8 stops to 15 (metrics strip, Notice Board, Events,
 * Campus Gallery, Role Management, School Notifications, Settings).
 */

type Stage = "intro" | "tour" | "done";

type TourStep = { id: string; title: string; body: string };

/* v2.9.9.1 — fifteen stops: dashboard first, then the sidebar top-to-bottom
   (the order a newcomer reads it), then the top bar. Steps whose target is
   hidden for a limited role are auto-glided past by measure(). */
const DESKTOP_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Your Dashboard",
    body: "Home base — everything on the college website is run from this studio.",
  },
  {
    id: "metrics",
    title: "The numbers, live",
    body: "These cards count by themselves — every story, event, admission and message on the site lands here the moment it happens.",
  },
  {
    id: "nav-pages",
    title: "The Visual Editor",
    body: "Every page of the website lives here. Click a page, edit it directly on the page itself, preview, then publish.",
  },
  {
    id: "nav-news",
    title: "News & Stories",
    body: "Write and publish news and stories — they appear on the website right away.",
  },
  {
    id: "nav-notices",
    title: "The Notice Board",
    body: "Official notices for parents and students — anything posted here shows on the homepage and the notices page.",
  },
  {
    id: "nav-events",
    title: "Events & Schedule",
    body: "Big Matches, prize days, term dates — keep the calendar current and the website updates itself.",
  },
  {
    id: "nav-media",
    title: "Media Library",
    body: "Upload photos and videos, organise them into folders, and reuse them anywhere on the website.",
  },
  {
    id: "nav-gallery",
    title: "Campus Gallery",
    body: "The curated photo albums visitors browse — pick your best frames and arrange them here.",
  },
  {
    id: "nav-forms",
    title: "Forms & Applications",
    body: "Grade 6 & A/L applications, contact messages and appointments all arrive here for you to review.",
  },
  {
    id: "nav-roles",
    title: "Who can do what",
    body: "Create staff accounts and set exactly what each person can see and change — a new admin only gets what you allow.",
  },
  {
    id: "nav-notifications",
    title: "School Notifications",
    body: "Post maintenance or urgent messages to every portal user — they see it the moment they sign in.",
  },
  {
    id: "nav-settings",
    title: "Settings & System",
    body: "The college's details, backups, storage and version history — the quiet machinery of the studio.",
  },
  {
    id: "nav-profile",
    title: "Your account",
    body: "Your profile, the studio's colour theme and sign out live at the bottom of the sidebar.",
  },
  {
    id: "bell",
    title: "Notifications",
    body: "The bell always shows what is unread — announcements posted to portal users land here.",
  },
  {
    id: "view-site",
    title: "See it live",
    body: "Open the real website anytime — this is exactly what visitors see. That's everything — you're all set!",
  },
];

/* Mobile keeps the compact path — id-lookup (never array indices, which
   drift as the desktop list grows). */
const byId = (id: string) => DESKTOP_STEPS.find((s) => s.id === id)!;
const MOBILE_STEPS: TourStep[] = [
  DESKTOP_STEPS[0],
  {
    id: "nav-menu-btn",
    title: "Everything is in the menu",
    body: "Pages, News, Media, Forms — every feature lives in this slide-out menu. Tap it anytime.",
  },
  byId("bell"),
  byId("view-site"),
];

/* ── Stage 1: the cinema ────────────────────────────────────────────────
   Each beat: [fade-in start, fade-out start] in ms. Five beats ≈ 15s.
   v2.9.9.1 — no per-beat sizes any more: ONE uniform size for every line
   (the owner: "okkoma ekama size eken danna"). */
const INTRO_BEATS: Array<{ text: string; name?: boolean; at: [number, number] }> = [
  { text: "Hi", at: [400, 2800] },
  { text: "", name: true, at: [3300, 6000] }, // filled with the account name
  { text: "I would like to set up your account.", at: [6500, 9200] },
  { text: "Are you all set?", at: [9700, 12400] },
  { text: "Let's Start", at: [12900, 14600] },
];

const INTRO_END = 15400; // overlay fully faded → the tour begins
const SETTLE_MS = 380; // wait for the smooth scroll before measuring

/* Client-only helper — never called during render, so hydration is safe.
   The hairline's shorter timeline is handled purely in CSS. */
const prefersReduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function AdminOnboarding({ name }: { name: string }) {
  const [stage, setStage] = useState<Stage>("intro");
  /* booted → the black overlay has finished fading in (drives opacity) */
  const [booted, setBooted] = useState(false);
  const [visibleLine, setVisibleLine] = useState(-1);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [spotReady, setSpotReady] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const measureRaf = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    /* stamp the account (fire-and-forget — never trap the user in the tour) */
    fetch("/api/admin/onboarding/complete", { method: "POST", keepalive: true })
      .catch(() => undefined);
    setStage("done");
  }, []);

  /* ── tour: build the step list for THIS viewport and begin ─────────── */
  const startTour = useCallback(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    setSteps(desktop ? DESKTOP_STEPS : MOBILE_STEPS);
    setStepIndex(0);
    setStage("tour");
  }, []);

  /* ── intro timeline ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (stage !== "intro") return;
    const speed = prefersReduced() ? 0.5 : 1;
    const t = timers.current;
    const push = (fn: () => void, ms: number) => t.push(setTimeout(fn, ms * speed));

    const raf = requestAnimationFrame(() => setBooted(true));
    INTRO_BEATS.forEach((beat, i) => {
      push(() => setVisibleLine(i), beat.at[0]);
      push(() => setVisibleLine(-1), beat.at[1]);
    });
    push(() => startTour(), INTRO_END);

    return () => {
      cancelAnimationFrame(raf);
      t.forEach(clearTimeout);
      timers.current = [];
    };
  }, [stage, startTour]);

  /* ── scroll lock while the experience is on screen ──────────────────── */
  useEffect(() => {
    if (stage === "done") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stage]);

  /* ── measure one step's target (scroll it into view first) ──────────── */
  const measure = useCallback((list: TourStep[], index: number) => {
    const target = list[index];
    if (!target) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${target.id}"]`);
    if (!el || el.offsetParent === null) {
      /* target missing for this role/viewport — glide past it (async, so
         the effect body never sets state synchronously) */
      setTimeout(() => setStepIndex((v) => v + 1), 0);
      return;
    }
    const reduced = prefersReduced();
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    cancelAnimationFrame(measureRaf.current);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    measureRaf.current = requestAnimationFrame(() => {
      settleTimer.current = setTimeout(() => {
        setRect(el.getBoundingClientRect());
        setSpotReady(true);
      }, reduced ? 30 : SETTLE_MS);
    });
  }, []);

  /* run measurement on step change + keep the spotlight glued on reflow */
  useEffect(() => {
    if (stage !== "tour") return;
    if (stepIndex >= steps.length && steps.length > 0) {
      const id = setTimeout(finish, 0);
      return () => clearTimeout(id);
    }
    const kick = setTimeout(() => measure(steps, stepIndex), 0);
    const onReflow = () => {
      cancelAnimationFrame(measureRaf.current);
      measureRaf.current = requestAnimationFrame(() => {
        const target = steps[stepIndex];
        if (!target) return;
        const el = document.querySelector<HTMLElement>(`[data-tour="${target.id}"]`);
        if (el && el.offsetParent !== null) setRect(el.getBoundingClientRect());
      });
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
  }, [stage, stepIndex, steps, measure, finish]);

  /* keyboard: → next · ← back · Esc skip */
  useEffect(() => {
    if (stage !== "tour") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") setStepIndex((i) => i + 1);
      else if (e.key === "ArrowLeft") setStepIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, finish]);

  if (stage === "done") return null;

  /* ── spotlight geometry ─────────────────────────────────────────────── */
  const PAD = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const isDesktop = vw >= 1024;
  const step = steps[stepIndex];
  const tourExhausted = stage === "tour" && stepIndex >= steps.length;

  let ringStyle: React.CSSProperties | undefined;
  let tipStyle: React.CSSProperties | undefined;
  if (stage === "tour" && rect && !tourExhausted) {
    ringStyle = {
      top: rect.top - PAD,
      left: rect.left - PAD,
      width: rect.width + PAD * 2,
      height: rect.height + PAD * 2,
      borderRadius: 14,
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.84)",
    };
    if (!isDesktop) {
      tipStyle = {
        bottom: "max(0.85rem, env(safe-area-inset-bottom))",
        left: "0.85rem",
        right: "0.85rem",
      };
    } else {
      const TIP_H = 205;
      const below = rect.bottom + PAD + 12;
      const top = below + TIP_H < vh - 14 ? below : Math.max(14, rect.top - PAD - TIP_H - 12);
      const left = Math.min(Math.max(14, rect.left), Math.max(14, vw - 340 - 14));
      tipStyle = { top, left, width: 340 };
    }
  }

  if (stage === "tour" && (tourExhausted || !ringStyle)) return null;

  return (
    <>
      {/* ── STAGE 1 · the cinema ─────────────────────────────────────── */}
      {stage === "intro" && (
        <div
          aria-label="Welcome introduction"
          role="dialog"
          aria-modal="true"
          className={`fixed inset-0 z-[100] grid place-items-center bg-black transition-opacity duration-[900ms] ease-out ${
            booted ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* progress hairline (15s, CSS-timed; halves under reduced motion) */}
          <div className="pointer-events-none absolute bottom-10 left-1/2 h-px w-40 -translate-x-1/2 overflow-hidden bg-white/15">
            <div className="stc-onb-progress h-full w-full origin-left bg-[#ffd444]/70" />
          </div>

          {/* skip */}
          <button
            type="button"
            onClick={finish}
            className="absolute bottom-6 right-6 text-[10px] font-medium uppercase tracking-[0.28em] text-white/35 transition-colors hover:text-white/85"
          >
            Skip
          </button>

          {/* the five white beats — stacked, cross-fading */}
          <div className="relative grid w-full place-items-center px-6 text-center">
            {INTRO_BEATS.map((beat, i) => (
              <p
                key={i}
                aria-hidden={visibleLine !== i}
                className={`font-display absolute max-w-3xl text-3xl font-semibold tracking-[-0.01em] text-white transition-all duration-700 ease-out sm:text-5xl ${
                  visibleLine === i
                    ? "translate-y-0 scale-100 opacity-100 blur-0"
                    : "translate-y-3 scale-[0.985] opacity-0 blur-md"
                }`}
              >
                {beat.name ? `Welcome, ${name}` : beat.text}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── STAGE 2 · the spotlight tour ─────────────────────────────── */}
      {stage === "tour" && ringStyle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Feature tour"
          className={`fixed inset-0 z-[100] ${spotReady ? "opacity-100" : "opacity-0"} transition-opacity duration-500`}
        >
          {/* the cutout ring — its shadow dims everything else */}
          <div
            className="pointer-events-none fixed transition-all duration-300 ease-out"
            style={{ ...ringStyle, border: "1.5px solid rgba(255,212,68,0.9)" }}
          >
            <div className="stc-onb-ring absolute inset-0 rounded-[14px]" />
          </div>

          {/* the explanation card */}
          {step && tipStyle && (
            <div
              className="fixed z-[101] rounded-2xl border border-white/12 bg-[#111110]/95 p-4 shadow-2xl backdrop-blur-md"
              style={tipStyle}
              role="status"
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[#ffd444]/80">
                {stepIndex + 1} / {steps.length} · Tour
              </p>
              <h3 className="mt-1.5 font-display text-[16px] font-semibold tracking-[-0.01em] text-white">
                {step.title}
              </h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{step.body}</p>
              <div className="mt-3.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={finish}
                  className="text-[11px] font-medium text-white/35 transition-colors hover:text-white/75"
                >
                  Skip tour
                </button>
                <div className="flex items-center gap-2">
                  {stepIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                      className="rounded-full border border-white/12 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/30 hover:text-white"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      stepIndex + 1 >= steps.length ? finish() : setStepIndex((i) => i + 1)
                    }
                    className="rounded-full bg-[#ffd444] px-5 py-2 text-[11px] font-semibold text-[#0b0b0a] transition-transform hover:-translate-y-0.5"
                  >
                    {stepIndex + 1 >= steps.length ? "Finish" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
