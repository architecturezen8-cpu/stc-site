"use client";

import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * v2.9.15.6 — FIRST-LOGIN ONBOARDING (ALL FIVE PORTALS)
 *
 * The owner: "aluthin acc ekak create karala ena kenekta cinematic tour
 * ekak ... parents,teachers,principal,lms-admin,student portal walatath
 * danna" — the Admin Studio's beloved first-login cinema (v2.9.9.0) is
 * ported here FAITHFULLY: same three stages, same timings, same premium
 * black + gold (#ffd444) language the portals ("Obsidian & Gold") already
 * speak.
 *
 * Stage 1 — CINEMA: a full-screen black overlay; white lines blur-fade
 * from the centre, then the screen hands over to the tour (the overlay is
 * opaque from the FIRST PAINT and dissolves down while the spotlight
 * mounts beneath — v2.9.10.2, exactly as the admin studio does it).
 * Stage 2 — TOUR: a spotlight walks the REAL portal, pausing on the
 * important features (the header nav pills, the notice bell, the menu
 * button…) exactly where they live. Targets missing for a role/viewport
 * are auto-glided past by measure(). Finishing stamps
 * lms_portal_accounts.onboarded_at via POST /api/portal/onboarding/complete
 * (works for BOTH portal sessions and the lms-admin session) so it never
 * replays for the account — old accounts are backfilled as onboarded, so
 * only NEW accounts see this.
 * Stage 3 — CREDIT: black → "Project by Sasika Randunuge" → the gold
 * outline "Let's Start" → the black slowly dissolves into the portal.
 *
 * One component, five voices: the intro lines and the tour stops are
 * written per role (student / teacher / parent / principal / lms-admin),
 * selected from the `role` prop. No framer-motion — the same CSS-only
 * machinery as the admin original.
 */

type PortalRole = "student" | "teacher" | "parent" | "principal" | "lms-admin";

type Stage = "intro" | "tour" | "outro" | "done";

type TourStep = { id: string; title: string; body: string };

/* ── the tour stops ──────────────────────────────────────────────────────
   v2.9.15.6 — per role, desktop. The welcome stop first, then the header
   pill items in the order a newcomer reads them, then the bell. The ids
   match the data-tour anchors PortalShell / LmsAdminShell stamp onto the
   REAL elements (nav-{label} for the pill links, bell for the wrapped
   NotificationBell) — steps whose anchor is hidden for this viewport are
   auto-glided past by measure(), same safety net as the admin tour.
   The LAST stop of every role carries the closing line. */
const DESKTOP_STEPS: Record<PortalRole, TourStep[]> = {
  student: [
    {
      id: "welcome",
      title: "Your dashboard",
      body: "Home base — homework, marks, timetable and your teachers all live here.",
    },
    {
      id: "nav-homework",
      title: "Homework, always current",
      body: "Pending, done and due dates — tick things off and never miss a deadline.",
    },
    {
      id: "nav-chat",
      title: "Ask your teacher",
      body: "A question about homework? Send it here — your teacher replies straight to you.",
    },
    {
      id: "nav-profile",
      title: "Your profile",
      body: "Your photo, your record and your sign-out.",
    },
    {
      id: "bell",
      title: "The notice bell",
      body: "School notices land here — tap to preview, tap again to read. That's everything — you're all set!",
    },
  ],
  teacher: [
    {
      id: "welcome",
      title: "Your dashboard",
      body: "Home base — your classes, your marking and your schoolwork all live here.",
    },
    {
      id: "nav-assignments",
      title: "Assignments & marking",
      body: "Create work, collect submissions and mark them — the whole loop lives here.",
    },
    {
      id: "nav-chat",
      title: "Answer your students",
      body: "Their questions reach you here — reply without leaving your desk.",
    },
    {
      id: "nav-profile",
      title: "Your profile",
      body: "Your photo, your classes and your sign-out.",
    },
    {
      id: "bell",
      title: "The notice bell",
      body: "Notices you post and school messages arrive here. That's everything — you're all set!",
    },
  ],
  parent: [
    {
      id: "welcome",
      title: "Your dashboard",
      body: "Home base — your children's school day, all in one place.",
    },
    {
      id: "nav-homework",
      title: "Homework they can see",
      body: "Every assignment from every class — open a child to see exactly what's due.",
    },
    {
      id: "nav-marks",
      title: "Marks without waiting",
      body: "Term marks, averages and the teacher's comments — no more waiting for report day.",
    },
    {
      id: "nav-report-card",
      title: "The report card",
      body: "The official term report, verified by the school, ready to read anytime.",
    },
    {
      id: "nav-profile",
      title: "Your family profile",
      body: "Your children, your photo and your sign-out.",
    },
    {
      id: "bell",
      title: "The notice bell",
      body: "School notices arrive at this bell — tap to preview, tap again to read. That's everything — you're all set!",
    },
  ],
  principal: [
    {
      id: "welcome",
      title: "Your dashboard",
      body: "Home base — the certification desk and the school at a glance.",
    },
    {
      id: "nav-certify",
      title: "Certify report cards",
      body: "Term reports queue here for your verification — approve or return them with one tap.",
    },
    {
      id: "nav-signature",
      title: "Your signature",
      body: "Your principal's signature rides every certified report.",
    },
    {
      id: "nav-profile",
      title: "Your profile",
      body: "Your account and your sign-out.",
    },
    {
      id: "bell",
      title: "The notice bell",
      body: "School-wide messages arrive here. That's everything — you're all set!",
    },
  ],
  "lms-admin": [
    {
      id: "welcome",
      title: "Your studio",
      body: "Home base — the whole learning machine, run from this room.",
    },
    {
      id: "nav-registrations",
      title: "Registration approvals",
      body: "New student, teacher and parent sign-ups wait here for the office's yes or no.",
    },
    {
      id: "nav-registers",
      title: "Verification records",
      body: "The office registers — the source of truth every portal reads.",
    },
    {
      id: "nav-storage",
      title: "Storage & quotas",
      body: "Every file the school stores, with per-person caps and cleanup marks.",
    },
    {
      id: "nav-portal-users",
      title: "Portal users",
      body: "Every account in one place — invite, verify, disable.",
    },
    {
      id: "nav-profile",
      title: "Your profile",
      body: "Your photo, your sessions and your sign-out.",
    },
    {
      id: "bell",
      title: "The notification bell",
      body: "Approvals and alerts land here. That's everything — you're all set!",
    },
  ],
};

/* ── the mobile menu stop ─────────────────────────────────────────────────
   On phones the header pills are gone — everything lives behind the
   slide-out menu, so the tour points at the menu button instead. */
const MENU_STEP: Record<PortalRole, TourStep> = {
  student: {
    id: "nav-menu-btn",
    title: "Everything is in the menu",
    body: "Everything lives in this slide-out menu — Homework, Marks, Storage, Profile. Tap it anytime.",
  },
  teacher: {
    id: "nav-menu-btn",
    title: "Everything is in the menu",
    body: "Everything lives in this slide-out menu — Homework, Marks, Storage, Profile. Tap it anytime.",
  },
  parent: {
    id: "nav-menu-btn",
    title: "Everything is in the menu",
    body: "Everything lives in this slide-out menu — Homework, Marks, Storage, Profile. Tap it anytime.",
  },
  principal: {
    id: "nav-menu-btn",
    title: "Everything is in the menu",
    body: "Everything lives in this slide-out menu — Homework, Marks, Storage, Profile. Tap it anytime.",
  },
  "lms-admin": {
    id: "nav-menu-btn",
    title: "Everything is in the menu",
    body: "Every section of the studio lives in this slide-out menu — taps open it anytime.",
  },
};

/* Mobile keeps the compact path — welcome, the menu button, the bell.
   The first/last stops are looked up in the role's DESKTOP list (never
   duplicated), and the shared bell object carries the closing line on
   both viewports, exactly like the admin tour's mobile path. */
function mobileStepsFor(role: PortalRole): TourStep[] {
  const desktop = DESKTOP_STEPS[role];
  return [desktop[0], MENU_STEP[role], desktop[desktop.length - 1]];
}

/* ── Stage 1: the cinema ────────────────────────────────────────────────
   Each beat: [fade-in start, fade-out start] in ms. Six beats ≈ 17s —
   the SAME timing template as the admin studio. ONE uniform size for
   every line; every beat blur-fades into sharpness. Beat 1 carries the
   account name (the personal welcome), beats 2–4 are written per role,
   beats 5–6 are shared (the studio gets its own closing invitation). */
const INTRO_BEAT_AT: Array<[number, number]> = [
  [400, 2700],
  [3200, 5600],
  [6100, 8700],
  [9200, 11600],
  [12100, 14500],
  [15000, 17200],
];

/* Beats 2–4, written for THIS person's portal. */
const INTRO_MIDDLE: Record<PortalRole, [string, string, string]> = {
  student: [
    "Your school day is about to get a lot lighter.",
    "Homework, marks, timetables and your teachers — all in one place now.",
    "One portal, every answer.",
  ],
  parent: [
    "Behind every thriving student stands someone who believed first.",
    "Their attendance, marks and homework — the whole journey, live.",
    "The school's quiet, always-open window into their day.",
  ],
  teacher: [
    "Behind every great class stands a teacher who carries it.",
    "Attendance, assignments, marks — the classroom's quiet engine, ready.",
    "Less admin, more teaching.",
  ],
  principal: [
    "The school's standards pass through your desk.",
    "Report cards wait for your word — certify, return, done.",
    "A quiet office, a whole school moving.",
  ],
  "lms-admin": [
    "Behind every smooth school day stands a quieter power.",
    "Registers, accounts, timetables, storage — the whole machine, yours.",
    "Big things are run from small, calm rooms.",
  ],
};

function introBeatsFor(role: PortalRole) {
  const middle = INTRO_MIDDLE[role];
  return [
    { text: "", name: true, at: INTRO_BEAT_AT[0] }, // "Welcome, {name}"
    { text: middle[0], at: INTRO_BEAT_AT[1] },
    { text: middle[1], at: INTRO_BEAT_AT[2] },
    { text: middle[2], at: INTRO_BEAT_AT[3] },
    { text: "A short walk through the essentials — just once.", at: INTRO_BEAT_AT[4] },
    {
      text: role === "lms-admin" ? "Let the studio introduce itself." : "Let the portal introduce itself.",
      at: INTRO_BEAT_AT[5],
    },
  ];
}

/* ── Stage 3: the credit ─────────────────────────────────────────────────
   Tour ends → black → "Project by Sasika Randunuge" → 4s → "Let's Start"
   button → click → the black slowly dissolves into the portal. The SAME
   timings as the admin studio. */
const OUTRO_CREDIT_AT = 900; // credit fades in once black has settled
const OUTRO_BUTTON_AT = 4900; // owner: "4s walain passe" the button appears
const OUTRO_FADE_MS = 1500; // the slow dissolve into the studio
const INTRO_END = 18000; // the handover begins: tour mounts under the black
const INTRO_HANDOVER_MS = 1200; // v2.9.10.2 — the black's dissolve into the tour
const SETTLE_MS = 380; // wait for the smooth scroll before measuring

/* Client-only helper — never called during render, so hydration is safe.
   The hairline's shorter timeline is handled purely in CSS. */
const prefersReduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function PortalOnboarding({
  name,
  role,
}: {
  name: string;
  role: PortalRole;
}) {
  /* Memoised — a fresh array identity every render would restart the intro
     timeline effect endlessly (its deps include introBeats). */
  const introBeats = useMemo(() => introBeatsFor(role), [role]);
  const [stage, setStage] = useState<Stage>("intro");
  const [visibleLine, setVisibleLine] = useState(-1);
  /* v2.9.10.2 — handover: the black overlay fades DOWN while the tour
     mounts beneath it; introFading keeps the overlay mounted until the
     dissolve finishes, then it drops out of the tree. */
  const [introFading, setIntroFading] = useState(false);
  /* outro: black settled → credit shown → button shown → leaving */
  const [outroBoot, setOutroBoot] = useState(false);
  const [outroCredit, setOutroCredit] = useState(false);
  const [outroButton, setOutroButton] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [spotReady, setSpotReady] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const measureRaf = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* v2.9.10.0 — the tour (or its skip) hands over to the CREDIT, not
     straight to the portal: black screen → "Project by …" → Let's Start.
     v2.9.15.6 — the completion stamps lms_portal_accounts.onboarded_at
     through the SHARED portal/lms-admin endpoint (fire-and-forget —
     never trap the user in the tour). */
  const finish = useCallback(() => {
    fetch("/api/portal/onboarding/complete", { method: "POST", keepalive: true })
      .catch(() => undefined);
    setStage("outro");
  }, []);

  /* ── tour: build the step list for THIS role + viewport and begin ──── */
  const startTour = useCallback(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    setSteps(desktop ? DESKTOP_STEPS[role] : mobileStepsFor(role));
    setStepIndex(0);
    setStage("tour");
  }, [role]);

  /* ── outro timeline: black → credit → (4s) → Let's Start ───────────── */
  useEffect(() => {
    if (stage !== "outro") return;
    const speed = prefersReduced() ? 0.5 : 1;
    const t = timers.current;
    const push = (fn: () => void, ms: number) => t.push(setTimeout(fn, ms * speed));

    const raf = requestAnimationFrame(() => setOutroBoot(true));
    push(() => setOutroCredit(true), OUTRO_CREDIT_AT);
    push(() => setOutroButton(true), OUTRO_BUTTON_AT);

    return () => {
      cancelAnimationFrame(raf);
      t.forEach(clearTimeout);
      timers.current = [];
    };
  }, [stage]);

  /* Let's Start — the black dissolves slowly, then the portal takes over.
     The stage switches only AFTER the CSS fade can fully finish, so the
     dissolve never gets cut mid-way (reduced motion included). */
  const enterPortal = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    timers.current.push(
      setTimeout(() => setStage("done"), OUTRO_FADE_MS + 120),
    );
  }, [leaving]);

  /* ── intro timeline ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (stage !== "intro") return;
    const speed = prefersReduced() ? 0.5 : 1;
    const t = timers.current;
    const push = (fn: () => void, ms: number) => t.push(setTimeout(fn, ms * speed));

    introBeats.forEach((beat, i) => {
      push(() => setVisibleLine(i), beat.at[0]);
      push(() => setVisibleLine(-1), beat.at[1]);
    });
    /* v2.9.10.2 — the handover: the tour mounts UNDER the opaque black,
       then the black dissolves down. */
    push(() => {
      setIntroFading(true);
      startTour();
    }, INTRO_END);

    return () => {
      t.forEach(clearTimeout);
      timers.current = [];
    };
  }, [stage, startTour, introBeats]);

  /* v2.9.10.2 — once the handover dissolve has finished, drop the intro
     overlay from the tree. This is a separate effect because the stage
     switch above clears the intro timeline's timers. */
  useEffect(() => {
    if (!introFading) return;
    const t = setTimeout(() => setIntroFading(false), INTRO_HANDOVER_MS + 80);
    return () => clearTimeout(t);
  }, [introFading]);

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

  /* v2.9.10.2 — `&& !introFading`: the early-return must not fire while
     the handover dissolve is running — the overlay rides it out. */
  if (stage === "tour" && (tourExhausted || !ringStyle) && !introFading)
    return null;

  return (
    <>
      {/* ── STAGE 1 · the cinema ─────────────────────────────────────── */}
      {/* The overlay is OPAQUE FROM THE FIRST PAINT (SSR ships it black —
          the portal never shows before the black) and it stays mounted
          through the handover, dissolving down while the tour runs
          beneath (z-[105] keeps it above the tour layer). */}
      {(stage === "intro" || introFading) && (
        <div
          aria-label="Welcome introduction"
          role="dialog"
          aria-modal="true"
          className={`fixed inset-0 z-[105] m-0 grid place-items-center bg-black transition-opacity ease-out ${
            introFading ? "opacity-0 duration-[1200ms]" : "opacity-100"
          }`}
        >
          {/* the six white beats — stacked, cross-fading; pure cinema, no
              skip button, no progress hairline */}
          <div className="relative grid w-full place-items-center px-6 text-center">
            {introBeats.map((beat, i) => (
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

      {/* ── STAGE 3 · the credit ─────────────────────────────────────── */}
      {stage === "outro" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Project credit"
          className={`fixed inset-0 z-[100] m-0 grid place-items-center bg-black transition-opacity ease-out ${
            leaving
              ? "opacity-0 duration-[1500ms]"
              : outroBoot
                ? "opacity-100 duration-700"
                : "opacity-0 duration-700"
          }`}
        >
          <div className="flex w-full flex-col items-center px-6 text-center">
            {/* the maker's credit — blur-fades in with the beats */}
            <div
              className={`transition-all duration-[900ms] ease-out ${
                outroCredit
                  ? "translate-y-0 opacity-100 blur-0"
                  : "translate-y-2 opacity-0 blur-md"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-white/40">
                Project by
              </p>
              <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.01em] text-white sm:text-4xl">
                Sasika Randunuge
              </p>
            </div>

            {/* reserved slot — the button appears 4s later without ever
                shifting the credit above it. The owner's OUTLINE CTA:
                transparent body, white stroke, white text + arrow; on
                hover a gold fill wipes in from the left, the ink turns
                black and the arrow glides forward. */}
            <div className="mt-14 h-12">
              <div
                className={`transition-all duration-700 ease-out ${
                  outroButton
                    ? "translate-y-0 opacity-100 blur-0"
                    : "pointer-events-none translate-y-3 opacity-0 blur-sm"
                }`}
              >
                <button
                  type="button"
                  autoFocus={outroButton}
                  onClick={enterPortal}
                  className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full border border-white/80 bg-transparent px-9 py-3.5 font-display text-[14px] font-semibold text-white transition-colors duration-300 ease-out"
                >
                  {/* the gold fill — wipes in from the left on hover */}
                  <span
                    aria-hidden
                    className="absolute inset-0 origin-left scale-x-0 rounded-full bg-[#ffd444] transition-transform duration-[420ms] ease-out group-hover:scale-x-100"
                  />
                  <span className="relative transition-colors duration-300 group-hover:text-[#0b0b0a]">
                    Let&apos;s Start
                  </span>
                  <ArrowRight
                    size={16}
                    strokeWidth={2.25}
                    aria-hidden
                    className="relative transition-[transform,color] duration-300 ease-out group-hover:translate-x-1.5 group-hover:text-[#0b0b0a]"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 2 · the spotlight tour ─────────────────────────────── */}
      {stage === "tour" && ringStyle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Feature tour"
          className={`fixed inset-0 z-[100] m-0 ${spotReady ? "opacity-100" : "opacity-0"} transition-opacity duration-500`}
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
              className="fixed z-[101] m-0 rounded-2xl border border-white/12 bg-[#111110]/95 p-4 shadow-2xl backdrop-blur-md"
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
