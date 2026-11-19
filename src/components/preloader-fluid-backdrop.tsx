"use client";

import { useEffect, useRef } from "react";

/* ────────────────────────────────────────────────────────────────────────
   PRELOADER FLUID BACKDROP — the liquid navy field under the opening.

   Ported from the owner's reference preloader (cinematic-text-preloader
   zip): a canvas of slowly drifting radial navy/black blobs with a liquid
   caustic shimmer, rendered at low internal resolution and blurred in CSS
   so it reads like ink moving under water. Palette sits in the site's own
   Midnight Navy family (#03060f canvas / #091540 glow) so the opening
   feels native, not bolted on.

   Reduced motion: draws ONE static frame — no animation loop, no shimmer.
   ──────────────────────────────────────────────────────────────────────── */

type Blob = {
  bx: number;
  by: number;
  r: number;
  amp: number;
  s1: number;
  s2: number;
  s3: number;
  p1: number;
  p2: number;
  p3: number;
  color: [number, number, number];
  alpha: number;
};

const PALETTE: [number, number, number][] = [
  [8, 22, 58], // deep navy
  [13, 36, 88], // navy glow
  [4, 11, 30], // near-black navy
  [20, 54, 124], // bright navy
  [3, 7, 18], // black
  [9, 26, 70],
  [28, 72, 156],
];

export default function PreloaderFluidBackdrop({
  blur = 44,
}: {
  blur?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const RES = 0.3; // internal resolution scale — blurred afterwards, so cheap
    let w = 0;
    let h = 0;
    let raf = 0;
    let blobs: Blob[] = [];

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const buildBlobs = () => {
      const count = Math.max(7, Math.min(15, Math.round((w * h) / 26000)));
      blobs = Array.from({ length: count }, () => {
        const big = Math.random() > 0.45;
        return {
          bx: rand(0.06, 0.94),
          by: rand(0.05, 0.95),
          r: big ? rand(0.42, 0.78) : rand(0.22, 0.42),
          amp: rand(0.05, 0.16),
          s1: rand(0.05, 0.16),
          s2: rand(0.09, 0.24),
          s3: rand(0.06, 0.18),
          p1: rand(0, Math.PI * 2),
          p2: rand(0, Math.PI * 2),
          p3: rand(0, Math.PI * 2),
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          alpha: big ? rand(0.16, 0.28) : rand(0.26, 0.4),
        };
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(2, Math.round(rect.width * RES));
      h = Math.max(2, Math.round(rect.height * RES));
      canvas.width = w;
      canvas.height = h;
      buildBlobs();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#03060f";
      ctx.fillRect(0, 0, w, h);
    };

    const drawCaustics = (t: number) => {
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 3; i++) {
        const base = h * (0.24 + i * 0.26);
        const amp = h * (0.045 + i * 0.02);
        const speed = 0.00022 + i * 0.00007;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 6) {
          const y =
            base +
            Math.sin(x * 0.02 + t * speed + i * 1.7) * amp +
            Math.sin(x * 0.0085 - t * speed * 1.4 + i) * amp * 0.7;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(70, 130, 230, ${0.075 - i * 0.018})`;
        ctx.stroke();
      }
    };

    const render = (now: number) => {
      const t = now;
      const min = Math.min(w, h);

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3, 6, 15, 0.34)";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      for (const b of blobs) {
        const x =
          (b.bx +
            Math.sin(t * b.s1 * 0.001 + b.p1) * b.amp +
            Math.sin(t * b.s2 * 0.001 + b.p2) * b.amp * 0.45) *
          w;
        const y =
          (b.by +
            Math.cos(t * b.s2 * 0.0011 + b.p2) * b.amp +
            Math.sin(t * b.s3 * 0.0009 + b.p3) * b.amp * 0.5) *
          h;
        const pulse = 0.78 + Math.sin(t * b.s1 * 0.0016 + b.p3) * 0.22;
        const r = b.r * min * pulse;

        const [cr, cg, cb] = b.color;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${b.alpha})`);
        g.addColorStop(0.42, `rgba(${cr},${cg},${cb},${b.alpha * 0.36})`);
        g.addColorStop(
          0.72,
          `rgba(${Math.max(0, cr - 4)},${Math.max(0, cg - 8)},${Math.max(0, cb - 18)},${b.alpha * 0.14})`,
        );
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
        ctx.fill();
      }

      drawCaustics(t);

      // soft specular core: a wide breathing radial that keeps the centre alive
      const cx = w * (0.5 + Math.sin(t * 0.00013) * 0.07);
      const cy = h * (0.46 + Math.cos(t * 0.00011) * 0.06);
      const rr = min * (0.85 + Math.sin(t * 0.0002) * 0.14);
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, rr));
      g2.addColorStop(0, "rgba(18, 42, 96, 0.22)");
      g2.addColorStop(0.55, "rgba(8, 18, 44, 0.10)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      if (!reduced) raf = requestAnimationFrame(render);
    };

    resize();
    raf = requestAnimationFrame(render);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{
          filter: `blur(${blur}px) saturate(1.15) contrast(1.05)`,
          transform: "scale(1.22)",
        }}
      />
    </div>
  );
}
