/**
 * v2.9.8.0 — the ONE folder + category table every media surface shares
 * (media library sidebar, upload modal, picker upload strip, asset drawer).
 * Folders are virtual slugs on media_assets.folder — a "new folder" is
 * simply a new slug written by the next upload / asset move.
 */

export const DEFAULT_MEDIA_FOLDERS = [
  "site-assets",
  "news",
  "gallery-campus",
  "gallery-academics",
  "gallery-sports",
  "gallery-arts",
  "staff",
  "cadeting",
  "academics",
  "sports",
  // v2.9.8.0 — videos have their own home so page hero clips never mix
  // with photos in the default view.
  "videos",
];

export const DEFAULT_MEDIA_CATEGORIES = [
  "Campus",
  "News",
  "Academics",
  "Sports",
  "Arts & Culture",
  "Portraits",
  "Cadeting",
  "Uncategorised",
];

/** Merge the defaults with whatever slugs already exist on real assets. */
export function mergeFolderOptions(existing: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_MEDIA_FOLDERS,
      ...existing.filter((value): value is string => Boolean(value?.trim())),
    ]),
  ).sort();
}

export function mergeCategoryOptions(existing: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_MEDIA_CATEGORIES,
      ...existing.filter((value): value is string => Boolean(value?.trim())),
    ]),
  ).sort();
}
