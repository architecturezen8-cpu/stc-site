/**
 * v2.8.83.0 — the ONE home of the storage-bar gradient (owner ask).
 *
 * Every storage bar used to snap between three flat colors at 60% and 90%.
 * The owner asked for a smooth blend so the bar starts shifting toward amber
 * as it APPROACHES the 60% line and toward red as it approaches the 90%
 * line. The trick that keeps that smooth across ALL widths: the gradient
 * spans the FULL track and the fill only REVEALS it — the wrapper div is
 * clipped to pct%, and the inner div is stretched by 100/pct so the color
 * stops stay pinned to the track (fill at 50% shows flat base color; at 62%
 * the amber tail is peeking in; at 90% the red tail starts).
 *
 * Consumers (5 bars): portal my-storage.tsx · admin storage-panel.tsx
 * (bucket, per-student quota, teacher cap) · lms-admin storage-panel.tsx
 * UsageBar. Portal uses the theme tokens; the two dark admin panels use the
 * fixed yellow→amber→rose family that panel already had.
 */

/** Gradient with the blend zones 55→65% (base→amber) and 85→95% (amber→red). */
export function storageBarGradient(kind: "portal" | "admin"): string {
  if (kind === "portal") {
    return (
      "linear-gradient(90deg," +
      " var(--pt-accent) 0%, var(--pt-accent) 55%," +
      " #fbbf24 65%, #fbbf24 85%," +
      " var(--pt-danger-text) 95%)"
    );
  }
  return (
    "linear-gradient(90deg," +
    " #ffd444 0%, #ffd444 55%," +
    " #fbbf24 65%, #fbbf24 85%," +
    " #fb7185 95%)"
  );
}

/** The fill wrapper is pct wide, so the gradient div underneath must be
    100/pct of the wrapper to span the full track exactly once. */
export function storageBarInnerWidth(pct: number): string {
  const shown = Math.max(1.5, Math.min(100, pct));
  return `${(100 / shown) * 100}%`;
}
