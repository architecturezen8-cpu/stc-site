/**
 * v2.9.8.0 — media-kind: ONE client-safe source of truth for "is this URL a
 * video?" shared by the visual editor, the SiteImage renderer, the media
 * library and the picker.
 *
 * WHY a helper: uploaded videos are stored under `videos/…-master.mp4` (etc.)
 * and served through `/api/media/file?key=videos%2F…` — the extension is in
 * the QUERY STRING, not the path, so a naive `.mp4$` path test misses every
 * proxied video. Direct R2 public-base URLs and raw uploads keep the
 * extension in the path. Both shapes are handled here.
 */

export const VIDEO_MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  ogv: "video/ogg",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

const VIDEO_EXT_RE = /\.(mp4|m4v|webm|ogg|ogv|mov|mkv)$/i;

/** True when the URL points at a playable video file (never an embed page). */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const clean = url.trim();
  if (!clean) return false;
  // Proxied storage URLs: /api/media/file?key=videos%2F2026%2Fclip-master.mp4
  if (clean.startsWith("/api/media/file")) {
    try {
      const key = new URLSearchParams(
        clean.slice(clean.indexOf("?") + 1) || "",
      ).get("key");
      if (key) return VIDEO_EXT_RE.test(key) || key.startsWith("videos/");
    } catch {
      return false;
    }
  }
  return VIDEO_EXT_RE.test(clean.split("?")[0]);
}

/** Known-file defaults for a rendered video element. */
export type VideoRenderOptions = {
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  controls: boolean;
};

/** When a patch carries no explicit flags, videos behave like site heroes:
 *  silent, looping, self-playing, no chrome. */
export const DEFAULT_VIDEO_OPTIONS: VideoRenderOptions = {
  autoplay: true,
  loop: true,
  muted: true,
  controls: false,
};

export function resolveVideoOptions(flags?: {
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoControls?: boolean;
}): VideoRenderOptions {
  return {
    autoplay: flags?.videoAutoplay ?? DEFAULT_VIDEO_OPTIONS.autoplay,
    loop: flags?.videoLoop ?? DEFAULT_VIDEO_OPTIONS.loop,
    muted: flags?.videoMuted ?? DEFAULT_VIDEO_OPTIONS.muted,
    controls: flags?.videoControls ?? DEFAULT_VIDEO_OPTIONS.controls,
  };
}
