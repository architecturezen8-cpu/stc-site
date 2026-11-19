/** Shared helpers for the Live channel (admin API + public /live page). */

export type LivePlatform = "youtube" | "facebook" | "instagram" | "tiktok" | "other";

export const LIVE_PLATFORMS: { value: LivePlatform; label: string }[] = [
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "other", label: "Other" },
];

/**
 * Derive an embeddable URL for the common platforms (best effort).
 * Returns null when the platform has no reliable inline embed — those
 * render as a link-out card with their banner instead.
 */
export function toEmbedUrl(rawUrl: string, platform: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (platform === "youtube" || host === "youtu.be") {
      // watch?v=…  |  youtu.be/…  |  /shorts/…  |  /live/…
      let videoId = url.searchParams.get("v") || "";
      if (!videoId) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (host === "youtu.be" && parts[0]) videoId = parts[0];
        if (["shorts", "live", "embed"].includes(parts[0] || "") && parts[1]) {
          videoId = parts[1];
        }
      }
      if (videoId) return `https://www.youtube.com/embed/${videoId}?rel=0`;
      return null;
    }

    if (platform === "facebook" && host.endsWith("facebook.com")) {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(rawUrl)}&show_text=false`;
    }

    return null; // instagram / tiktok / other → link-out card with banner
  } catch {
    return null;
  }
}

/** Effective embed: explicit embedUrl wins, otherwise auto-derived. */
export function effectiveEmbed(url: string, platform: string, embedUrl?: string | null) {
  if (embedUrl && embedUrl.trim()) return embedUrl.trim();
  return toEmbedUrl(url, platform);
}

/** Guess the platform behind a plain URL — used to brand social links. */
export function detectPlatform(rawUrl: string): LivePlatform {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
    if (host.endsWith("facebook.com") || host === "fb.me" || host.endsWith("fb.watch")) return "facebook";
    if (host.endsWith("instagram.com")) return "instagram";
    if (host.endsWith("tiktok.com")) return "tiktok";
    return "other";
  } catch {
    return "other";
  }
}
