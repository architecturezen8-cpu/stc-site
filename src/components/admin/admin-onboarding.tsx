"use client";

import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * v2.9.9.0 — FIRST-LOGIN ONBOARDING (Admin Studio)
 *
 * Stage 1 — CINEMA: a full-screen black overlay; white lines cross-fade
 * from the centre, then the screen hands over to the tour.
 * Stage 2 — TOUR: a spotlight walks the REAL dashboard, pausing on the
 * important features (Visual Editor, News, Media, Forms, notifications…)
 * exactly where they live. Finishing stamps admin_users.onboarded_at via
 * the onboarding/complete API so it never replays for the account.
 *
 * v2.9.9.1 — all intro lines at ONE size ("okkoma ekama size eken danna"),
 * every beat blur-fades into sharpness (blur-md → blur-0), tour 8 → 15 stops.
 *
 * v2.9.10.2 — the owner's handover pass:
 *  · the black screen is there from the FIRST PAINT (SSR renders the
 *    overlay fully opaque — the dashboard no longer shows before the
 *    black, owner: "mulinma eddi black screen eka show wenna one");
 *  · when the tour begins the black DISSOLVES down smoothly (1.2 s
 *    opacity fade while the spotlight layer mounts beneath — owner:
 *    "tour patangaddi black eka smoothly opacity adu wenna one");
 *  · the Let's Start button is the owner's outline CTA: transparent
 *    body, white stroke, white text + arrow; hovering wipes a gold fill
 *    across, the ink turns black and the arrow glides forward (the
 *    halo/float/sheen pass removed — "eke dan thiyana animation eka ain
 *    karanna").
 */

type Stage = "intro" | "tour" | "outro" | "done";

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
   Each beat: [fade-in start, fade-out start] in ms. Six beats ≈ 17s.
   ONE uniform size for every line (the owner: "okkoma ekama size eken
   danna"); every beat blur-fades into sharpness.
   v2.9.10.0 — six written-for-the-moment lines; beat 1 carries the
   account name (the personal welcome the owner asked for originally). */
const INTRO_BEATS: Array<{ text: string; name?: boolean; at: [number, number] }> = [
  { text: "", name: true, at: [400, 2700] }, // "Welcome, {name}"
  { text: "Behind every great school stands a quieter power.", at: [3200, 5600] },
  { text: "This studio is yours — every page, every story, every frame.", at: [6100, 8700] },
  { text: "Big things are run from small, calm rooms.", at: [9200, 11600] },
  { text: "A short walk through the essentials — just once.", at: [12100, 14500] },
  { text: "Let the studio introduce itself.", at: [15000, 17200] },
];

const INTRO_END = 18000; // the handover begins: tour mounts under the black
const INTRO_HANDOVER_MS = 1200; // v2.9.10.2 — the black's dissolve into the tour

/* v2.9.12.0 — per-access intro wording. `focus` comes from the server:
   null = full access (super admin), a list = the account's own edit
   features, an empty list = limited access without edit features. The
   third beat swaps from the owner's "every page, every story, every
   frame" to a line written for what THIS person actually holds. */
function introBeatsFor(focus: string[] | null | undefined) {
  if (focus === null || focus === undefined) return INTRO_BEATS;
  const line =
    focus.length > 0
      ? `${focus.join(" · ")} — your corner of the studio.`
      : "This studio is yours — the areas your role needs, ready to go.";
  return INTRO_BEATS.map((beat, i) => (i === 2 ? { ...beat, text: line } : beat));
}

/* ── Stage 3: the credit ─────────────────────────────────────────────────
   Tour ends → black → "Project by Sasika Randunuge" → 4s → "Let's Start"
   button → click → the black slowly dissolves into the studio. */
const OUTRO_CREDIT_AT = 900; // credit fades in once black has settled
const OUTRO_BUTTON_AT = 4900; // owner: "4s walain passe" the button appears
const OUTRO_FADE_MS = 1500; // the slow dissolve into the studio
const SETTLE_MS = 380; // wait for the smooth scroll before measuring

/* Client-only helper — never called during render, so hydration is safe.
   The hairline's shorter timeline is handled purely in CSS. */
const prefersReduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export function AdminOnboarding({
  name,
  focus,
}: {
  name: string;
  /** v2.9.12.0 — the account's own edit features (see introBeatsFor). */
  focus?: string[] | null;
}) {
  /* Memoised — a fresh array identity every render would restart the intro
     timeline effect endlessly (its deps include introBeats). */
  const introBeats = useMemo(() => introBeatsFor(focus), [focus]);
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
     straight to the studio: black screen → "Project by …" → Let's Start. */
  const finish = useCallback(() => {
    /* stamp the account (fire-and-forget — never trap the user in the tour) */
    fetch("/api/admin/onboarding/complete", { method: "POST", keepalive: true })
      .catch(() => undefined);
    setStage("outro");
  }, []);

  /* ── tour: build the step list for THIS viewport and begin ─────────── */
  const startTour = useCallback(() => {
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    setSteps(desktop ? DESKTOP_STEPS : MOBILE_STEPS);
    setStepIndex(0);
    setStage("tour");
  }, []);

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

  /* Let's Start — the black dissolves slowly, then the studio takes over.
     The stage switches only AFTER the CSS fade can fully finish, so the
     dissolve never gets cut mid-way (reduced motion included). */
  const enterStudio = useCallback(() => {
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
       then the black dissolves down (owner: "tour patangaddi black eka
       smoothly opacity adu wenna one — dan nikanma enawa ekata"). */
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

  /* v2.9.10.2 — `&& !introFading`: the old early-return fired the moment
     the tour mounted (rect still null → no ring), unmounting EVERYTHING
     and cutting the black screen off mid-handover — the owner's "dan
     nikanma enawa ekata". The overlay now rides out the dissolve. */
  if (stage === "tour" && (tourExhausted || !ringStyle) && !introFading)
    return null;

  return (
    <>
      {/* ── STAGE 1 · the cinema ─────────────────────────────────────── */}
      {/* v2.9.10.2 — the overlay is OPAQUE FROM THE FIRST PAINT (SSR ships
          it black — the dashboard never shows before the black) and it
          stays mounted through the handover, dissolving down while the
          tour runs beneath (z-[105] keeps it above the tour layer). */}
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
              skip button, no progress hairline (v2.9.10.0) */}
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
                shifting the credit above it. v2.9.10.2 — the owner's
                OUTLINE CTA: transparent body, white stroke, white text
                + arrow; on hover a gold fill wipes in from the left, the
                ink turns black and the arrow glides forward (the old
                halo/float/sheen pass removed). */}
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
                  onClick={enterStudio}
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
