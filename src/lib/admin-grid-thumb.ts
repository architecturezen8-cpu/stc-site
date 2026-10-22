/**
 * Admin grid thumbnails — performance helper (v2.8.24).
 *
 * Uploaded assets already carry a small WebP `thumbnail` variant in
 * `thumbnailUrl`. Legacy assets only have the master URL, so admin grids
 * used to decode full-resolution JPEGs (or 800×1200 Pexels portraits) for
 * ~200px cards. This helper maps those to light sources:
 *
 *  - `/images/*.jpg|png`  → `/api/media/thumb?src=…` (disk-cached 480px WebP)
 *  - Pexels URLs          → the same photo with crop params scaled down
 *  - anything else        → returned unchanged (uploads keep their variant)
 */
export function adminGridThumbSrc(url: string): string {
  if (!url) return "";

  if (url.startsWith("/images/") && /\.(jpe?g|png)$/i.test(url)) {
    return `/api/media/thumb?src=${encodeURIComponent(url)}`;
  }

  if (url.includes("images.pexels.com")) {
    try {
      const parsed = new URL(url);
      const width = Number(parsed.searchParams.get("w"));
      const height = Number(parsed.searchParams.get("h"));
      if (width > 640 && height > 0) {
        const scale = 640 / width;
        parsed.searchParams.set("w", String(Math.round(width * scale)));
        parsed.searchParams.set("h", String(Math.round(height * scale)));
        return parsed.toString();
      }
    } catch {
      return url;
    }
  }

  return url;
}

/** Convenience wrapper for asset-shaped objects used by admin grids. */
export function assetGridThumbSrc(asset: {
  thumbnailUrl?: string | null;
  url?: string | null;
}): string {
  return adminGridThumbSrc(asset.thumbnailUrl || asset.url || "");
}
