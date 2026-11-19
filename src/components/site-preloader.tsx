"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  devicePreloader,
  type PreloaderDevice,
  type PreloaderSettings,
} from "@/lib/preloader-settings";
import PreloaderFluidBackdrop from "./preloader-fluid-backdrop";

/* Re-exported for client consumers (the admin manager); server components
   must import the settings contract from @/lib/preloader-settings instead. */
export { PRELOADER_DEFAULTS, devicePreloader, normalizePreloaderSettings, SIZE_MIN, SIZE_MAX } from "@/lib/preloader-settings";
export type { OpeningScene, PreloaderDevice, PreloaderSettings } from "@/lib/preloader-settings";

/* ────────────────────────────────────────────────────────────────────────
   SITE PRELOADER — THE REFERENCE OPENING, 1:1 (v2.9.15.16).

   Owner: "na na machan. dan thiyana preloader eka ain karala mn damma
   preloader eka replace karanna kiwwe. mn damma ekama" — the uploaded
   cinematic-text-preloader reference REPLACES the old custom opening
   outright. Ported verbatim from the zip (Preloader.tsx + FluidBackdrop):

     STAGE 1 — liquid navy canvas fades in; the motto ("Animo Et Fide")
               wakes letter by letter with a blur-in glide while a thin
               white progress bar fills in sync; a bloom ignites when the
               phrase is complete.
     STAGE 2 — the phrase dissolves; the WHITE DISC with OUR logo rises
               inside the halo, the faint static ring and the ORBIT RING;
               the school name blooms, then the Est. 1873 line settles.
     EXIT    — everything blurs, brightens and dissolves into the site.

   Site adaptations (only where the reference CANNOT know us): the disc
   holds the school logo image from the admin settings (fallback: a plain
   navy shield), the phrase/name read the admin title + motto, Escape key
   skips like the Skip button, and the once-per-visit gate, scroll lock
   and boot-curtain release stay exactly as they were. Poppins (the
   reference display font) is loaded next/font in the root layout.

   v2.9.15.17 — THE OPENING CONTROL ROOM (owner: "admin eke thiyenne ape
   parana preloader eka adjust karana setings ne thama. eka new preloader
   eke ewata galapena widiyata wenas karanna we ne" + "drop down ekak
   danna preloader section eke mobile kiyalai desktop kiyalai" + "white
   circal eka wateta yana animation eka … ape kalin prloader eke thibba
   animation eka use karanna golden color neme dan use wena blue+black
   mix eka" + "skip button eka show karanna hide karannath option ekak
   danna"):
     - DEVICE-AWARE opening: SitePreloader tracks max-width:767px and
       CinematicOpening renders that device's admin set (title, motto,
       skip button, ring); the admin preview forces the dropdown device.
     - the reference's white SVG arc pair is retired for THE OLD RING —
       the retired custom preloader's masked conic hairline (same 5.5s
       spin + double-arc conic gradient) recolored from gold rgba(255,
       212,68) to the opening's cool blue family, reading as blue arcs
       melting into the black canvas (.spo-legacy-ring in globals.css);
       the per-device ring switch gates it.
     - the Skip button is gated by the per-device skip switch (Escape
       keeps the same fast path either way).

   v2.9.15.18 — STAGE-2 SIZE DIALS (owner: "logo size eka, white circal
   eke size eka, text sizes ehema adjest karannath option eka danna.
   stage 2 eke witharai mn hithanne edit karanna ona. stage 1 eka aulak
   na — mobile version and desktop version"): the Stage-2 lockup's four
   dimensions become per-device admin dials (50–200% around the
   reference sizes) — the crest inside the disc, the WHITE CIRCLE
   (disc + halo + static ring + orbit ring all travel on the same dial
   so the composition never breaks), the school name and the Est. 1873
   line. Stage 1 (motto wake + progress bar) is untouched.
   ──────────────────────────────────────────────────────────────────────── */

/** The mobile breakpoint matches Tailwind's `md` — phones get their own
    admin-managed opening, everything wider plays the desktop version. */
const DEVICE_MQ = "(max-width: 767px)";

const SEEN_KEY = "stc:site-preloader:seen";

/* timing map (ms) — everything derives from these constants, exact. */
const INTRO = 1000; // pure black, fluid fades in
const LETTER_STAGGER = 800; // gap between each letter waking up
const LETTER_DUR = 2000; // blur-in duration of a single letter
const FILL_HOLD = 1500; // hold once the bar is full, so the bloom reads
const FADE_OUT = 900; // phrase + bar dissolve
const BRAND_DELAY = 420; // emblem starts rising as the dissolve ends
const TEXT_AT = 300; // the name blooms in just after the disc
const TAG_AT = 900; // Est. line follows once the name has settled
const BRAND_HOLD = 3000; // hold the lockup before leaving
const SKIP_HOLD = 700; // the skip button exits much faster
const EXIT_DUR = 1100;

const EASE = "cubic-bezier(0.19, 1, 0.22, 1)";
const OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

const DISPLAY_FONT = "var(--font-poppins), Poppins, ui-sans-serif, sans-serif";
const BODY_FONT = "var(--font-sans), Inter, ui-sans-serif, sans-serif";

/** The pure cinematic renderer — also mounted by the admin preview.
    scene/draining/progress remain in the signature for the manager's
    legacy timers; the reference timeline is self-driven. `device` picks
    which admin set (desktop/mobile) feeds the words + switches. */
export function CinematicOpening({
  settings,
  device = "desktop",
  closing,
  onComplete,
}: {
  settings: PreloaderSettings;
  /** "mobile" renders the mobile admin set — the site passes its live
      matchMedia verdict, the admin preview passes the dropdown choice. */
  device?: PreloaderDevice;
  closing?: boolean;
  /** Fired once the exit dissolve has fully played. */
  onComplete?: () => void;
  /** Legacy manager props — accepted, ignored by the self-timed opening. */
  scene?: unknown;
  draining?: boolean;
  progress?: number;
}) {
  const dev = devicePreloader(settings, device);
  const phrase = dev.motto.trim() || "Animo Et Fide";
  const fullTitle = dev.title;
  const tagline = "Est. 1873";
  const showSkip = dev.skip;
  const showRing = dev.ring;

  /* v2.9.15.18 — Stage-2 sizing dials (per device, % of the reference
     sizes). calc() multiplies each reference clamp so every layer keeps
     its own responsive behavior while scaling with the dial. */
  const circleK = dev.circleScale / 100;
  const logoK = dev.logoScale / 100;
  const nameK = dev.nameScale / 100;
  const tagK = dev.tagScale / 100;
  const DISC = `calc(clamp(112px, 15.5vw, 140px) * ${circleK})`;
  const HALO = `calc(clamp(156px, 21vw, 196px) * ${circleK})`;
  const RING = `calc(clamp(124px, 17.2vw, 156px) * ${circleK})`;
  const CREST = `calc(64% * ${logoK})`;

  const [phase, setPhase] = useState<"intro" | "letters" | "brand" | "exit">("intro");
  const [filled, setFilled] = useState(false);

  const barRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const pctRef = useRef<HTMLSpanElement | null>(null);
  const timers = useRef<number[]>([]);
  const stopped = useRef(false);

  /* Reduced motion compresses the whole timeline (~14.5s → ~3.4s); the
     choreography and order stay identical. Client-only render (the gate
     returns null on the server), so reading the media query here is safe. */
  const K =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? 0.22
      : 1;

  const STAGGER = LETTER_STAGGER * K;
  const LETTER_DUR_EFF = LETTER_DUR * K;
  const FILL_HOLD_EFF = FILL_HOLD * K;
  const FADE_OUT_EFF = FADE_OUT * K;
  const BRAND_DELAY_EFF = BRAND_DELAY * K;
  const BRAND_HOLD_EFF = BRAND_HOLD * K;
  const SKIP_HOLD_EFF = SKIP_HOLD * K;

  const VISIBLE = [...phrase].filter((c) => c !== " ").length;
  const LETTER_TOTAL = Math.max(1, (VISIBLE - 1) * STAGGER + LETTER_DUR_EFF);
  const EXIT_AT =
    INTRO + LETTER_TOTAL + FILL_HOLD_EFF + FADE_OUT_EFF + BRAND_DELAY_EFF + BRAND_HOLD_EFF;

  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /* ---------------- timeline ---------------- */
  useEffect(() => {
    after(INTRO, () => setPhase("letters"));
    after(INTRO + LETTER_TOTAL + FILL_HOLD_EFF, () => setPhase("brand"));
    after(EXIT_AT, () => setPhase("exit"));
    after(EXIT_AT + EXIT_DUR + 140, () => onComplete?.());

    const store = timers.current;
    return () => {
      store.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* External closing demand (admin preview legacy timers) → exit now. */
  useEffect(() => {
    if (closing && !stopped.current) {
      stopped.current = true;
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      setPhase("exit");
      timers.current.push(
        window.setTimeout(() => onComplete?.(), EXIT_DUR + 120),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  /* ---------------- reset the bar without React managing transform ---------------- */
  useEffect(() => {
    if (barRef.current) barRef.current.style.transform = "scaleX(0)";
    if (headRef.current) headRef.current.style.left = "0%";
  }, []);

  /* ---------------- optional skip for the long reveal ---------------- */
  const skip = useCallback(() => {
    if (stopped.current) return;
    stopped.current = true;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];

    if (barRef.current) {
      barRef.current.style.transition = "transform 520ms cubic-bezier(0.4,0,0.2,1)";
      barRef.current.style.transform = "scaleX(1)";
    }
    if (headRef.current) {
      headRef.current.style.transition = "left 520ms cubic-bezier(0.4,0,0.2,1)";
      headRef.current.style.left = "100%";
    }
    if (pctRef.current) pctRef.current.textContent = "100";
    setFilled(true);
    setPhase("brand");

    timers.current.push(window.setTimeout(() => setPhase("exit"), SKIP_HOLD_EFF));
    timers.current.push(
      window.setTimeout(() => onComplete?.(), SKIP_HOLD_EFF + EXIT_DUR + 160),
    );
  }, [onComplete, SKIP_HOLD_EFF]);

  /* Escape skips exactly like the Skip button. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skip]);

  /* ---------------- progress synced to the letters ---------------- */
  useEffect(() => {
    if (phase !== "letters") return;
    const start = performance.now();
    let raf = 0;
    let done = false;

    const tick = (now: number) => {
      if (stopped.current) return;
      const raw = Math.min(1, (now - start) / LETTER_TOTAL);
      // gentle ease-in-out so the fill glides rather than racing linearly
      const p = -(Math.cos(Math.PI * raw) - 1) / 2;

      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
      if (headRef.current) headRef.current.style.left = `${p * 100}%`;
      if (pctRef.current)
        pctRef.current.textContent = String(Math.round(raw * 100)).padStart(2, "0");

      if (p >= 1 && !done) {
        done = true;
        setFilled(true);
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, LETTER_TOTAL]);

  /* ---------------- letter delay helper ---------------- */
  let visibleIndex = -1;
  const letterDelays = [...phrase].map((c) => {
    if (c !== " ") visibleIndex += 1;
    return Math.max(0, visibleIndex) * STAGGER;
  });

  const lettersOut = phase === "brand" || phase === "exit";
  const showBrand = phase === "brand" || phase === "exit";
  const showLetters = phase !== "brand" && phase !== "exit";

  /* Stage 2 lockup — school name split like the reference ("St. Thomas'
     College" + "Matale"). */
  const sp = fullTitle.lastIndexOf(" ");
  const nameA = sp > 0 ? fullTitle.slice(0, sp) : fullTitle;
  const nameB = sp > 0 ? fullTitle.slice(sp + 1) : "";

  const crest = settings.logo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={settings.logo}
      alt=""
      className="relative object-contain"
      style={{ width: CREST, height: CREST }}
    />
  ) : (
    <svg
      viewBox="0 0 64 64"
      className="relative"
      style={{ width: CREST, height: CREST }}
      fill="none"
      stroke="#071230"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="M32 6 L54 16 V34 C54 47 44 55 32 58 C20 55 10 47 10 34 V16 Z" />
      <path d="M32 18 L43 23 V33 C43 40 38 44.5 32 46.5 C26 44.5 21 40 21 33 V23 Z" fill="#071230" opacity=".92" />
      <path d="M32 6 V58" stroke="rgba(7,18,48,.25)" strokeWidth="1" />
    </svg>
  );

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center overflow-hidden"
      style={{
        backgroundColor: "#02040a",
        opacity: phase === "exit" ? 0 : 1,
        filter: phase === "exit" ? "blur(14px)" : "blur(0px)",
        transform: phase === "exit" ? "scale(1.04)" : "scale(1)",
        transitionProperty: "opacity, filter, transform",
        transitionDuration: `${EXIT_DUR}ms`,
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* ---- layer 1: liquid navy / black radial flow ---- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          animation: "spoFluidIn 1900ms cubic-bezier(0.4, 0, 0.2, 1) 140ms forwards",
        }}
      >
        <PreloaderFluidBackdrop blur={44} />
      </div>

      {/* ---- layer 2: vignette + grain ---- */}
      <div className="spo-vignette pointer-events-none absolute inset-0" />
      <div className="spo-grain pointer-events-none absolute inset-0 opacity-[0.07]" />

      {/* ================= STAGE 1 — phrase + progress ================= */}
      <div
        className="pointer-events-none absolute inset-0 grid place-items-center px-6"
        style={{
          opacity: showLetters ? 1 : 0,
          filter: lettersOut ? "blur(16px)" : "blur(0px)",
          transform: lettersOut ? "scale(1.06)" : "scale(1)",
          transitionProperty: "opacity, filter, transform",
          transitionDuration: `${FADE_OUT_EFF}ms`,
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="flex flex-col items-center">
          {/* the phrase, letter by letter */}
          <div
            className="relative flex whitespace-nowrap text-white"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: "clamp(1.35rem, 4.2vw, 2.4rem)",
              fontWeight: 400,
              letterSpacing: "0.32em",
              marginRight: "-0.32em",
              textShadow: filled
                ? "0 0 14px rgba(255,255,255,0.55), 0 0 48px rgba(190,215,255,0.40), 0 0 120px rgba(120,170,255,0.30)"
                : "0 0 18px rgba(255,255,255,0.16)",
              transition: "text-shadow 1500ms cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            {[...phrase].map((ch, i) => {
              const revealed = phase !== "intro";
              return (
                <span
                  key={`${ch}-${i}`}
                  className="inline-block shrink-0"
                  style={{
                    opacity: revealed ? 1 : 0,
                    filter: revealed ? "blur(0px)" : "blur(15px)",
                    transform: revealed
                      ? "translateY(0) scale(1)"
                      : "translateY(14px) scale(1.1)",
                    transitionProperty: "opacity, filter, transform",
                    transitionDuration: `${LETTER_DUR_EFF}ms`,
                    transitionTimingFunction: EASE,
                    transitionDelay: `${letterDelays[i]}ms`,
                  }}
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              );
            })}

            {/* bloom halo behind the phrase — ignites only when every letter is in */}
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 h-[220%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(255,255,255,0.16), rgba(150,190,255,0.10) 38%, transparent 72%)",
                opacity: filled ? 1 : 0,
                filter: "blur(30px)",
                transition: "opacity 1600ms cubic-bezier(0.4,0,0.2,1)",
              }}
            />

            {/* the bloom itself: a blurred duplicate of the sentence */}
            <span
              className="pointer-events-none absolute inset-0 flex whitespace-nowrap text-white"
              style={{
                fontFamily: DISPLAY_FONT,
                fontSize: "clamp(1.35rem, 4.2vw, 2.4rem)",
                fontWeight: 400,
                letterSpacing: "0.32em",
                marginRight: "-0.32em",
                opacity: filled ? 1 : 0,
                filter: "blur(20px)",
                transition: "opacity 1500ms cubic-bezier(0.4,0,0.2,1), filter 1500ms ease",
              }}
            >
              {[...phrase].map((ch, i) => (
                <span key={`bloom-${i}`} className="inline-block shrink-0">
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>
          </div>

          {/* premium thin progress bar — exactly the width of the phrase */}
          <div
            className="mt-8 w-full"
            style={{
              opacity: phase === "intro" ? 0 : 1,
              transition: "opacity 900ms cubic-bezier(0.4,0,0.2,1) 260ms",
            }}
          >
            <div className="relative h-[1.5px] w-full rounded-full bg-white/10">
              <div
                ref={barRef}
                className="absolute inset-y-0 left-0 w-full origin-left rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.25), rgba(255,255,255,0.75), #ffffff)",
                  boxShadow: "0 0 16px rgba(255,255,255,0.45)",
                }}
              />
              {/* travelling glow head */}
              <div
                ref={headRef}
                className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{
                  filter: "blur(1.5px)",
                  boxShadow: "0 0 14px 4px rgba(255,255,255,0.45)",
                  opacity: phase === "intro" ? 0 : 1,
                  transition: "opacity 900ms ease 260ms",
                }}
              />
            </div>

            <div className="mt-3.5 flex w-full items-baseline justify-between">
              <span className="text-[8.5px] font-light tracking-[0.46em] text-white/30">
                LOADING
              </span>
              <span
                ref={pctRef}
                className="text-[10px] tracking-[0.3em] text-white/50"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                00
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= STAGE 2 — emblem + welcome lockup ================= */}
      <div
        className="pointer-events-none absolute inset-0 grid place-items-center px-6"
        style={{
          opacity: showBrand ? 1 : 0,
          transition: "opacity 700ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div className="relative flex flex-col items-center text-center">
          {/* ---------- the white circle with our logo ---------- */}
          <div
            className="relative grid place-items-center"
            style={{
              opacity: showBrand ? 1 : 0,
              filter: showBrand ? "blur(0px)" : "blur(16px)",
              transform: showBrand ? "scale(1)" : "scale(0.82)",
              transitionProperty: "opacity, filter, transform",
              transitionDuration: "1200ms",
              transitionTimingFunction: OUT,
              transitionDelay: showBrand ? "80ms" : "0ms",
            }}
          >
            {/* faint halo sitting behind the disc, pulsing with it */}
            <div
              className="absolute rounded-full"
              style={{
                width: HALO,
                height: HALO,
                background:
                  "radial-gradient(circle, rgba(190,215,255,0.24), rgba(90,140,235,0.10) 46%, transparent 74%)",
                filter: "blur(22px)",
                animation: "spoHalo 6s ease-in-out infinite",
              }}
            />

            {/* faint static ring so the arc has something to travel against */}
            <span
              className="absolute rounded-full border border-white/[0.13]"
              style={{
                width: RING,
                height: RING,
                opacity: showBrand ? 1 : 0,
                transition: "opacity 1400ms ease 640ms",
              }}
            />

            {/* THE OLD RING, REBORN IN BLUE — the retired custom preloader's
                masked conic hairline (v2.9.15.17), recolored from gold to
                this opening's blue+black family; same 5.5s spin. */}
            {showRing && (
              <div
                className="spo-legacy-ring pointer-events-none absolute"
                style={{
                  width: `calc(${RING} + 8px)`,
                  height: `calc(${RING} + 8px)`,
                  opacity: showBrand ? 1 : 0,
                  transition: "opacity 900ms ease 780ms",
                  animation: "spoArcSpin 5.5s linear infinite",
                }}
                aria-hidden="true"
              />
            )}

            {/* the disc */}
            <div
              className="relative grid place-items-center overflow-hidden rounded-full"
              style={{
                width: DISC,
                height: DISC,
                background:
                  "radial-gradient(circle at 50% 24%, #ffffff, #eef3fb 52%, #dde6f4 100%)",
                boxShadow:
                  "0 0 52px rgba(190,215,255,0.34), 0 10px 42px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.95)",
                animation: "spoBreathe 6s ease-in-out infinite",
              }}
            >
              {/* light band gliding across the face — sits UNDER the crest */}
              <span
                className="pointer-events-none absolute inset-y-0 left-0 w-[62%]"
                aria-hidden="true"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.92) 46%, rgba(255,255,255,0.92) 54%, transparent)",
                  filter: "blur(10px)",
                  transform: "skewX(-14deg) translateX(-120%)",
                  animation: "spoSheen 5s cubic-bezier(0.5,0,0.3,1) infinite 600ms",
                }}
              />
              {/* a whisper of blue rising from the bottom, gives the disc volume */}
              <span
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                  background:
                    "radial-gradient(circle at 50% 118%, rgba(120,165,235,0.34), transparent 58%)",
                  animation: "spoPool 6s ease-in-out infinite",
                }}
              />

              {crest}
            </div>
          </div>

          {/* ---------- school name ---------- */}
          <h2
            className="mt-7 text-white"
            style={{
              fontFamily: DISPLAY_FONT,
              fontSize: `calc(clamp(1.06rem, 3.6vw, 2rem) * ${nameK})`,
              fontWeight: 400,
              letterSpacing: "0.12em",
              lineHeight: 1.34,
              opacity: showBrand ? 1 : 0,
              filter: showBrand ? "blur(0px)" : "blur(20px)",
              transform: showBrand ? "translateY(0) scale(1)" : "translateY(10px) scale(1.05)",
              transitionProperty: "opacity, filter, transform",
              transitionDuration: "1500ms",
              transitionTimingFunction: EASE,
              transitionDelay: `${TEXT_AT}ms`,
              textShadow:
                "0 0 18px rgba(255,255,255,0.30), 0 0 66px rgba(150,195,255,0.22)",
            }}
          >
            <span className="block whitespace-nowrap sm:inline">{nameA}</span>{" "}
            {nameB && (
              <span className="block whitespace-nowrap sm:inline">{nameB}</span>
            )}
          </h2>

          {/* ---------- Est. 1873 ---------- */}
          <div
            className="mt-4 text-white"
            style={{
              fontFamily: BODY_FONT,
              fontSize: `calc(clamp(0.5rem, 1.5vw, 0.62rem) * ${tagK})`,
              fontWeight: 300,
              letterSpacing: "0.44em",
              marginRight: "-0.44em",
              opacity: showBrand ? 1 : 0,
              filter: showBrand ? "blur(0px)" : "blur(9px)",
              transitionProperty: "opacity, filter",
              transitionDuration: "1200ms",
              transitionTimingFunction: EASE,
              transitionDelay: `${TAG_AT}ms`,
            }}
          >
            {tagline}
          </div>
        </div>
      </div>

      {/* ---- discreet skip, handy on a 14.5 second reveal — the admin
              can hide it per device (Escape keeps the fast path) ---- */}
      {showSkip && (
        <button
          onClick={skip}
          className="group absolute bottom-7 right-6 z-20 flex items-center gap-2.5 rounded-full border border-white/15 px-5 py-2 text-[9px] font-light tracking-[0.36em] text-white/35 uppercase transition-all duration-500 hover:border-white/45 hover:bg-white/5 hover:text-white/85 lg:right-10"
          style={{ opacity: phase === "exit" ? 0 : 1, transition: "opacity 400ms ease" }}
          aria-label="Skip intro"
        >
          Skip
          <span className="h-[1px] w-4 bg-current opacity-50 transition-all duration-500 group-hover:w-7" />
        </button>
      )}
    </div>
  );
}

/** Site gate — plays the reference opening once per visit rules, then
    unlocks scroll. The gate logic (skip decisions, scroll-lock release,
    seen key, boot curtain) is untouched infrastructure. */
export function SitePreloader({ settings }: { settings: PreloaderSettings }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"pending" | "playing" | "closing" | "gone">("pending");
  /* v2.9.15.17 — the opening is device-aware: phones (max-width:767px,
     Tailwind's md line) play the MOBILE admin set, everything wider the
     desktop set. Client-only overlay (server renders null), so the
     matchMedia verdict is always known before the opening ever paints. */
  const [device, setDevice] = useState<PreloaderDevice>("desktop");
  useEffect(() => {
    const mq = window.matchMedia(DEVICE_MQ);
    const apply = () => setDevice(mq.matches ? "mobile" : "desktop");
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  /* Skip-vs-play decision — resolved AFTER hydration, in an effect. The
     overlay is CLIENT-ONLY markup: rendering it on the server used to leave
     an un-hydrated copy in the DOM for skipped visits (already-seen flag or
     arriving from /admin), and that abandoned node kept the
     `body:has([data-spo-root])` scroll-lock rule alive FOREVER — the "home
     page can't scroll" bug. Server renders null; the black screen + scroll
     lock still start from the very first paint via the <head> bootstrap
     class, so the cinematic still feels instant. */
  useEffect(() => {
    if (phase !== "pending") return;
    const decide = () => {
      let skip = false;
      try {
        skip =
          document.documentElement.classList.contains("stc-preloader-skip") ||
          // Never replay for visitors arriving from the admin studio — their
          // new tab carries no "seen" flag and the replay scroll-locks the
          // page they think is broken.
          document.referrer.includes("/admin");
      } catch {
        skip = false;
      }
      if (skip || settings.enabled === "false" || pathname.startsWith("/admin") || pathname.startsWith("/lms-admin")) {
        setPhase("gone");
      } else {
        setPhase("playing");
      }
    };
    /* The decision reads DOM state that only exists after hydration, so it
       resolves in a timeout callback — never synchronously in the effect
       body (the boot curtain still covers the ~0 ms gap). */
    const timer = window.setTimeout(decide, 0);
    return () => window.clearTimeout(timer);
  }, [phase, pathname, settings.enabled]);

  /* SCROLL-LOCK GUARANTEE — the <head> bootstrap adds `stc-preloader-live`
     before first paint; this effect releases it on EVERY path out of the
     playing phase (closing, gone, unmount), so a stuck lock is impossible.
     The BOOT CURTAIN (`stc-preloader-boot`, which hides the document until
     the overlay takes over) is lifted here too. During "pending" the
     decision hasn't run yet — do not touch the bootstrap state. */
  useEffect(() => {
    if (phase === "pending") return;
    const release = () => {
      document.documentElement.classList.remove("stc-preloader-live");
      document.documentElement.classList.remove("stc-preloader-boot");
      document.body.style.removeProperty("overflow");
    };
    if (phase !== "playing") release();
    return release;
  }, [phase]);

  /* The opening calls onComplete AFTER its own exit dissolve has played —
     "closing" only releases the lock, stores the seen flag and unmounts. */
  const handleComplete = useCallback(() => setPhase("closing"), []);

  useEffect(() => {
    if (phase !== "closing") return;
    document.documentElement.classList.remove("stc-preloader-live");
    try {
      if (settings.frequency === "once") window.localStorage.setItem(SEEN_KEY, "1");
      else if (settings.frequency !== "always") window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage unavailable — preloader simply plays every visit */
    }
    const t = window.setTimeout(() => setPhase("gone"), 200);
    return () => window.clearTimeout(t);
  }, [phase, settings.frequency]);

  if (phase === "pending" || phase === "gone") return null;

  return (
    <div
      data-spo-root=""
      className={pathname.startsWith("/admin") || pathname.startsWith("/lms-admin") ? "hidden" : undefined}
    >
      <CinematicOpening settings={settings} device={device} onComplete={handleComplete} />
    </div>
  );
}
