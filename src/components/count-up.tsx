"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * v2.8.90.0 — a quiet, professional counting animation for the site's
 * stat numbers (hero bands and stat cards).
 *
 * - Server-renders the FINAL value (no SSR flash, no layout shift, SEO-safe).
 * - When the number scrolls into view it counts up once with an ease-out
 *   quartic curve — the same restrained taste as the site's Reveal fades.
 * - Understands the site's stat formats: "153", "2,000+", "99.2%", "40+".
 * - Values that are not a single leading number ("1:14", "B.Sc (Peradeniya)")
 *   render untouched.
 * - Honours prefers-reduced-motion (final value immediately).
 */

type Parsed = {
  prefix: string;
  target: number;
  suffix: string;
  decimals: number;
  hasGrouping: boolean;
};

function parseStat(raw: string): Parsed | null {
  const m = raw.match(/^([^0-9]*)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const [, prefix, num, suffix] = m;
  // "1:14" or "2020 — 2025" style ranges carry digits after the first
  // number — animating those would look broken, so leave them alone.
  if (/\d/.test(suffix)) return null;
  const target = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(target)) return null;
  return {
    prefix,
    target,
    suffix,
    decimals: num.includes(".") ? num.split(".")[1].length : 0,
    hasGrouping: num.includes(","),
  };
}

function formatStat(p: Parsed, n: number): string {
  const [int, dec] = (p.decimals ? n.toFixed(p.decimals) : String(Math.round(n))).split(".");
  const grouped = p.hasGrouping ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  return `${p.prefix}${grouped}${dec ? `.${dec}` : ""}${p.suffix}`;
}

export function CountUp({
  value,
  className = "",
  duration = 1500,
  delay = 0,
}: {
  value: string | number;
  className?: string;
  /** Animation length in ms. */
  duration?: number;
  /** Extra delay (ms) before the count starts — for staggering siblings. */
  delay?: number;
}) {
  const raw = String(value);
  // useMemo (not parse-per-render) keeps the effect stable.
  const parsed = useMemo(() => parseStat(raw), [raw]);
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(() =>
    parsed ? formatStat(parsed, parsed.target) : raw,
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || !parsed) return;

    // Reduced motion: the initial render already shows the final value —
    // simply never start the observer.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let started = false;

    const run = () => {
      const start = performance.now() + delay;
      const tick = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        const eased = 1 - Math.pow(1 - t, 4);
        setDisplay(formatStat(parsed, parsed.target * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            setDisplay(formatStat(parsed, 0));
            run();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [parsed, duration, delay]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
