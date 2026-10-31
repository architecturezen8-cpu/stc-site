"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { isVideoUrl, resolveVideoOptions } from "@/lib/media-kind";
import { usePublishedPatchFor } from "@/components/visual-patch-context";

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
 * · v2.9.8.0 — PATCH-AWARE VIDEO SWAP: when the published visual patch for
 *   this key replaces the image with a video (the owner's "images thiyana
 *   than walata videos replace karanna" request), the component renders a
 *   real <video> element server-side — hydration-safe, no flash of the old
 *   image, no DOM surgery. Picking an image again flips it straight back.
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
  const published = usePublishedPatchFor(visualKey);
  // A published src override wins; an empty string means "revert to source".
  const resolvedSrc =
    typeof published?.src === "string" && published.src ? published.src : src;
  const resolvedAlt =
    typeof published?.alt === "string" && published.alt ? published.alt : alt;
  const video = isVideoUrl(resolvedSrc);

  const [current, setCurrent] = useState(resolvedSrc);
  const [failed, setFailed] = useState(false);
  const [prevSrc, setPrevSrc] = useState(resolvedSrc);

  // Keep the rendered source in sync when the upstream value changes
  // (render-time state adjustment — recommended over an effect).
  if (prevSrc !== resolvedSrc) {
    setPrevSrc(resolvedSrc);
    setCurrent(resolvedSrc);
    setFailed(false);
  }

  if (failed) {
    if (fallbackSrc && current !== fallbackSrc) {
      // First failure — retry once with the safe fallback image.
      return (
        <SiteImage
          src={fallbackSrc}
          alt={resolvedAlt}
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
        aria-label={resolvedAlt}
      >
        <span className="px-3 text-center font-sans text-[9px] uppercase tracking-[0.25em] text-current opacity-50">
          {fallbackLabel || resolvedAlt || "Image"}
        </span>
      </span>
    );
  }

  if (video) {
    /* Replaced-by-video: same visual contract as the image (className,
       style, fill geometry, editor key) with hero-style playback defaults
       that the inspector's video options override. */
    const options = resolveVideoOptions(published ?? undefined);
    return (
      <video
        data-visual-key={visualKey}
        data-visual-media-src={current}
        data-visual-video="1"
        /* v2.9.8.1 — the ORIGINAL page image this video replaced. The
           editor's "Restore original image" action and the post-hydration
           revert pass read this when the video is removed (the owner:
           "video eka ain karala aya image eka danna ba"). */
        data-visual-original-src={src}
        /* v2.9.8.1 — which patch row owns this slot (keyed rows are stored
           under their key selector), so editor saves never drift into a
           second row after the img→video tag swap. */
        data-visual-patch-selector={
          visualKey ? `[data-visual-key="${visualKey}"]` : undefined
        }
        src={current}
        {...(fill ? { "data-visual-fill": "1" } : {})}
        autoPlay={options.autoplay}
        loop={options.loop}
        muted={options.muted}
        playsInline
        controls={options.controls}
        preload="auto"
        ref={(element) => {
          // React's muted prop historically lands after autoplay starts —
          // force the property so silent autoplay works on every browser.
          if (element) element.muted = options.muted;
        }}
        onError={() => setFailed(true)}
        className={
          fill
            ? `absolute inset-0 h-full w-full object-cover ${className}`
            : className
        }
        style={style}
      />
    );
  }

  return (
    <Image
      src={current}
      alt={resolvedAlt}
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
