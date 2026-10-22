"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  PRELOADER_DEFAULTS,
  barWidthPercent,
  circleScaleFactor,
  textScaleFactor,
  type OpeningScene,
  type PreloaderSettings,
} from "@/lib/preloader-settings";

/* Re-exported for client consumers (the admin manager); server components
   must import the settings contract from @/lib/preloader-settings instead. */
export { PRELOADER_DEFAULTS, normalizePreloaderSettings } from "@/lib/preloader-settings";
export type { OpeningScene, PreloaderSettings } from "@/lib/preloader-settings";

/* ────────────────────────────────────────────────────────────────────────
   SITE CINEMATIC PRELOADER — the user's exact storyboard:

     STAGE 1 — black screen; the school logo shows inside a WHITE CIRCLE;
               below it an ultra-thin SHARP-EDGED GOLD progress bar fills
               (gold only — no white), while three short professional
               sentences cycle one after another beneath the bar.
     STAGE 2 — the bar and sentences hide; the circle + logo stay; the
               school name is DRAWN letter-by-letter below the logo, and
               once shown, "Animo Et Fide" appears beneath it in a sharp
               professional font.
     STAGE 3 — everything fades and the site enters.

   Every element is admin-editable in Admin → Website → Preloaders.
   ──────────────────────────────────────────────────────────────────────── */

const SEEN_KEY = "stc:site-preloader:seen";

/** Fixed stage lengths (ms) — stage 1 is realtime-driven. */
const TITLE_MS = 2600;
const FADE_MS = 1100; // exit choreography length — keep in sync with CSS
const DRAIN_MS = 420; // meter hide beat before the name draws

/** The pure cinematic renderer — also mounted by the admin preview. */
export function CinematicOpening({
  settings,
  scene,
  closing,
  draining = false,
  progress,
}: {
  settings: PreloaderSettings;
  scene: OpeningScene;
  closing: boolean;
  /** True during the brief beat where the bar + sentence fade out. */
  draining?: boolean;
  /** 0–100 realtime load progress; drives the thin gold bar. */
  progress: number;
}) {
  /* White circle size is controlled ONLY by the circle-scale setting.
     The crest size (logoScale) is independent — it sizes the crest inside
     the circle, never the circle itself (bug fix: crest slider used to
     inflate the white disc too). 100% = crest fills the classic content
     area (64% of the disc), larger values grow toward the rim, clamped. */
  const scale = Math.min(220, Math.max(40, Number(settings.logoScale) || 100)) / 100;
  const circleScale = circleScaleFactor(settings.circleScale);
  const crestPct = Math.min(100, Math.max(26, Math.round(64 * scale)));
  const barPct = barWidthPercent(settings.barWidth);
  /* Text size sliders — title (school name), motto (subheading) and the
     rotating loading sentences, each clamped around their 100% default. */
  const titleScale = textScaleFactor(settings.titleScale, 60, 200);
  const mottoScale = textScaleFactor(settings.mottoScale, 60, 220);
  const linesScale = textScaleFactor(settings.linesScale, 60, 220);
  const ringOn = settings.circleRing !== "false" && settings.whiteCircle !== "false";
  const discSize = Math.round(124 * circleScale);
  const title = settings.title || PRELOADER_DEFAULTS.title;
  const chars = Array.from(title);
  const lines = (settings.lines || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  /* Rotating sentences under the progress bar (stage 1 only). */
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    if (scene !== "logo" || lines.length < 2) return;
    const timer = window.setInterval(
      () => setLineIdx((i) => (i + 1) % lines.length),
      1600,
    );
    return () => window.clearInterval(timer);
  }, [scene, lines.length]);

  const exitClass = closing
    ? settings.exit === "curtain"
      ? "spo-out-curtain"
      : "spo-out-fade"
    : "";
  const activeLine = lines.length > 0 ? lines[lineIdx % lines.length] : "";

  const crest = settings.logo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={settings.logo} alt="" className="spo-crest" />
  ) : (
    <svg viewBox="0 0 64 64" className="spo-crest" fill="none" aria-hidden="true">
      <path
        d="M32 6 L54 16 V34 C54 47 44 55 32 58 C20 55 10 47 10 34 V16 Z"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M32 18 L43 23 V33 C43 40 38 44.5 32 46.5 C26 44.5 21 40 21 33 V23 Z"
        fill="currentColor"
        opacity=".92"
      />
      <path d="M32 6 V58" stroke="rgba(255,255,255,.25)" strokeWidth="1" />
    </svg>
  );

  const reveal = scene === "title" || scene === "final";

  return (
    <div
      className={`spo-root ${exitClass}`}
      aria-hidden="true"
      style={
        {
          "--spo-name-scale": titleScale,
          "--spo-motto-scale": mottoScale,
          "--spo-lines-scale": linesScale,
        } as React.CSSProperties
      }
    >
      {/* Cinema curtains — only animated by the curtain exit */}
      <div className="spo-curtain spo-curtain-l" />
      <div className="spo-curtain spo-curtain-r" />

      {/* One persistent stage: circle + logo on top, the slot below swaps
          between the progress/sentence beat and the name reveal. */}
      <div className="spo-stage">
        <div
          className={`spo-disc ${settings.whiteCircle === "false" ? "spo-disc-plain" : ""}`}
          style={{ width: discSize, height: discSize }}
        >
          {ringOn && <div className="spo-ring" />}
          <div className="spo-crest-box" style={{ width: `${crestPct}%`, height: `${crestPct}%` }}>
            {crest}
          </div>
        </div>

        <div className="spo-slot">
          {(scene === "logo" || draining) && settings.progress !== "false" && (
            <div className={`spo-meter ${draining ? "spo-meter-out" : ""}`}>
              <div
                className="spo-track"
                style={{
                  width: `min(${Math.round(barPct * 6.6)}px, ${Math.round(barPct * 0.94)}vw)`,
                }}
              >
                <div className="spo-fill" style={{ width: `${progress}%` }} />
              </div>
              {activeLine && (
                <p key={lineIdx} className="spo-line">
                  {activeLine}
                </p>
              )}
            </div>
          )}

          {reveal && (
            <div className="spo-reveal">
              <h1 className="spo-name">
                {chars.map((ch, i) => (
                  <span
                    key={i}
                    className="spo-name-char"
                    style={{ animationDelay: `${320 + i * 30}ms` }}
                  >
                    {ch === " " ? "\u00A0" : ch}
                  </span>
                ))}
              </h1>
              {settings.motto && (
                <p
                  className="spo-motto"
                  style={{ animationDelay: `${420 + chars.length * 30 + 320}ms` }}
                >
                  {settings.motto}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Site gate — plays the opening once per visit rules, then unlocks scroll. */
export function SitePreloader({ settings }: { settings: PreloaderSettings }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"pending" | "playing" | "closing" | "gone">("pending");
  const [scene, setScene] = useState<OpeningScene>("logo");
  const [draining, setDraining] = useState(false);
  const [progress, setProgress] = useState(4);
  const creepRef = useRef(0);

  const finishTo = useCallback((next: "closing") => {
    window.clearInterval(creepRef.current);
    setProgress(100);
    setPhase(next);
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
     the overlay takes over) is lifted here too — during "playing" the
     opaque overlay covers anyway, and lifting it at "closing" crossfades
     the site in beneath the exit fade. During "pending" the decision
     hasn't run yet — do not touch the bootstrap state. */
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

  /* Stage 1 — realtime progress: fast ramps while the document streams in,
     a calm creep, completes the moment the browser reports a full load
     AND the minimum hold has elapsed (3 s stall cap). */
  useEffect(() => {
    if (phase !== "playing" || scene !== "logo") return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? 800 : Math.max(1400, Math.min(9000, Number(settings.hold) || 2600));

    const ramp1 = window.setTimeout(() => setProgress((p) => (p < 42 ? 42 : p)), 340);
    const ramp2 = window.setTimeout(() => setProgress((p) => (p < 68 ? 68 : p)), 850);
    creepRef.current = window.setInterval(() => setProgress((p) => (p < 92 ? p + 1 : p)), 230);

    let held = false;
    let loaded = document.readyState === "complete";
    let cancelled = false;
    let advanced = false;

    const advance = () => {
      if (cancelled || advanced) return;
      advanced = true;
      window.clearInterval(creepRef.current);
      setProgress(100);
      /* The bar + sentence drain away, the circle stays, the name draws. */
      setDraining(true);
      window.setTimeout(() => {
        if (!cancelled) {
          setScene("title");
          setDraining(false);
        }
      }, reduced ? 120 : DRAIN_MS);
    };
    const maybeFinish = () => {
      if (!cancelled && held && loaded) advance();
    };
    const holdTimer = window.setTimeout(() => {
      held = true;
      maybeFinish();
      /* Stall cap — never wait forever on a hung asset. */
      window.setTimeout(() => {
        if (!cancelled) {
          loaded = true;
          maybeFinish();
        }
      }, 3000);
    }, hold);
    const onLoad = () => {
      loaded = true;
      maybeFinish();
    };
    if (loaded) onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => {
      cancelled = true;
      window.clearInterval(creepRef.current);
      window.clearTimeout(ramp1);
      window.clearTimeout(ramp2);
      window.clearTimeout(holdTimer);
      window.removeEventListener("load", onLoad);
    };
  }, [phase, scene, settings.hold]);

  /* Stage 2 — the name draws, the motto lands, then the exit (compressed
     for reduced motion). */
  useEffect(() => {
    if (phase !== "playing") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const k = reduced ? 0.35 : 1;
    if (scene === "title") {
      const t = window.setTimeout(() => setPhase("closing"), TITLE_MS * k);
      return () => window.clearTimeout(t);
    }
  }, [phase, scene]);

  /* Closing → gone: release the lock, remember "seen", let the exit play. */
  useEffect(() => {
    if (phase !== "closing") return;
    document.documentElement.classList.remove("stc-preloader-live");
    try {
      if (settings.frequency === "once") window.localStorage.setItem(SEEN_KEY, "1");
      else if (settings.frequency !== "always") window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage unavailable — preloader simply plays every visit */
    }
    const t = window.setTimeout(() => setPhase("gone"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase, settings.frequency]);

  /* Click / Escape to skip. */
  useEffect(() => {
    if (phase !== "playing") return;
    const skip = () => finishTo("closing");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, finishTo]);

  if (phase === "pending" || phase === "gone") return null;

  return (
    <div
      data-spo-root=""
      onClick={() => phase === "playing" && finishTo("closing")}
      className={pathname.startsWith("/admin") || pathname.startsWith("/lms-admin") ? "hidden" : undefined}
    >
      <CinematicOpening
        settings={settings}
        scene={scene}
        closing={phase === "closing"}
        draining={draining}
        progress={progress}
      />
    </div>
  );
}
