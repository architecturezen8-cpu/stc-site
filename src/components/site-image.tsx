"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

type SiteImageProps = {
  /** Any site image source — static `/images/…`, media API URLs or HTTPS. */
  src: string;
  alt: string;
  /** Stable identity used by the visual editor — `[data-visual-key="…"]`. */
  visualKey?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Inline styling for the rendered image (e.g. photo zoom transforms). */
  style?: CSSProperties;
  /** Rendered instead of a broken icon if the source fails to load. */
  fallbackSrc?: string;
  /** Optional label shown inside the fallback panel. */
  fallbackLabel?: string;
};

function isMediaApiUrl(src: string) {
  return src.startsWith("/api/media/file");
}

/**
 * The canonical image component for the whole site.
 *
 * · Renders every site image through one place, so behaviour stays in sync
 *   (optimisation, editor keys, fallbacks) instead of each page hand-rolling
 *   <Image> tags.
 * · If a source 404s (e.g. a media file was removed), the component swaps to
 *   `fallbackSrc` or a neutral panel — the page itself never breaks and no
 *   broken-image icon can appear.
 * · `visualKey` stamps a stable `data-visual-key` so visual-editor patches
 *   target this exact element forever, even if surrounding DOM shifts.
 */
export function SiteImage({
  src,
  alt,
  visualKey,
  fill = false,
  width,
  height,
  sizes,
  priority = false,
  className = "",
  style,
  fallbackSrc = "/images/about.jpg",
  fallbackLabel,
}: SiteImageProps) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  // Keep the rendered source in sync when the upstream value changes
  // (render-time state adjustment — recommended over an effect).
  if (prevSrc !== src) {
    setPrevSrc(src);
    setCurrent(src);
    setFailed(false);
  }

  if (failed) {
    if (fallbackSrc && current !== fallbackSrc) {
      // First failure — retry once with the safe fallback image.
      return (
        <SiteImage
          src={fallbackSrc}
          alt={alt}
          visualKey={visualKey}
          fill={fill}
          width={width}
          height={height}
          sizes={sizes}
          priority={priority}
          className={className}
          style={style}
          fallbackSrc={fallbackSrc}
          fallbackLabel={fallbackLabel}
        />
      );
    }
    return (
      <span
        data-visual-key={visualKey}
        data-visual-image-fallback=""
        className={`grid place-items-center bg-gradient-to-br from-white/10 via-white/5 to-transparent ${fill ? "absolute inset-0" : className}`}
        role="img"
        aria-label={alt}
      >
        <span className="px-3 text-center font-sans text-[9px] uppercase tracking-[0.25em] text-current opacity-50">
          {fallbackLabel || alt || "Image"}
        </span>
      </span>
    );
  }

  return (
    <Image
      src={current}
      alt={alt}
      {...(fill ? { fill: true } : { width: width ?? 1200, height: height ?? 800 })}
      sizes={sizes}
      priority={priority}
      data-visual-key={visualKey}
      data-visual-media-src={current}
      onError={() => setFailed(true)}
      className={className}
      style={style}
      // Media-API URLs are re-validated per upload; skip long-lived optimiser caching issues.
      unoptimized={isMediaApiUrl(current) ? false : undefined}
    />
  );
}
