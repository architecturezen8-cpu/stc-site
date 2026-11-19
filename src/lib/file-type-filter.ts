/**
 * v2.8.69.0 — ONE file-type classifier shared by every storage surface that
 * grew a filter this round: the portals' My Storage, the LMS Admin studio
 * storage panel (per-person drawer) and the main Admin Studio storage panel
 * (read-only person drawer + cleanup marks). Classification runs off the file
 * NAME first (uploads keep their original filename) with the MIME type as a
 * fallback, so one typo in a mime column can never mis-file a row.
 */

export type FileKind =
  | "all"
  | "image"
  | "pdf"
  | "doc"
  | "sheet"
  | "slides"
  | "video"
  | "audio"
  | "archive"
  | "other";

/** Filter dropdown options, in display order ("all" is the default). */
export const FILE_KIND_OPTIONS: { key: FileKind; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "image", label: "Images" },
  { key: "pdf", label: "PDF" },
  { key: "doc", label: "Documents" },
  { key: "sheet", label: "Spreadsheets" },
  { key: "slides", label: "Slides" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "archive", label: "Archives" },
  { key: "other", label: "Other" },
];

const BY_EXT: Record<string, Exclude<FileKind, "all">> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image",
  avif: "image", heic: "image", heif: "image", bmp: "image", svg: "image", ico: "image",
  pdf: "pdf",
  doc: "doc", docx: "doc", odt: "doc", rtf: "doc", txt: "doc", md: "doc", pages: "doc",
  xls: "sheet", xlsx: "sheet", csv: "sheet", ods: "sheet",
  ppt: "slides", pptx: "slides", odp: "slides", key: "slides",
  mp4: "video", webm: "video", mov: "video", m4v: "video", avi: "video", mkv: "video",
  mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio", aac: "audio",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive", gz: "archive",
};

const BY_MIME: Array<[RegExp, Exclude<FileKind, "all">]> = [
  [/^image\//, "image"],
  [/^application\/pdf/, "pdf"],
  [/msword|officedocument\.wordprocessing|opendocument\.text|^text\//, "doc"],
  [/spreadsheet|officedocument\.spreadsheet|opendocument\.spreadsheet|csv/, "sheet"],
  [/presentation|officedocument\.presentation|opendocument\.presentation/, "slides"],
  [/^video\//, "video"],
  [/^audio\//, "audio"],
  [/zip|rar|compressed|tar|x-7z/, "archive"],
];

export function extOf(fileName: string): string {
  return (fileName.split(".").pop() ?? "").toLowerCase();
}

/** The one classifier — filename extension wins, MIME type is the fallback. */
export function classifyFileKind(fileName: string, mimeType?: string | null): FileKind {
  const byExt = BY_EXT[extOf(fileName || "")];
  if (byExt) return byExt;
  const mime = (mimeType || "").toLowerCase();
  if (mime) {
    for (const [pattern, kind] of BY_MIME) {
      if (pattern.test(mime)) return kind;
    }
  }
  return "other";
}

/** True when a row passes the chosen filter ("all" always passes). */
export function fileKindMatches(
  filter: FileKind,
  fileName: string,
  mimeType?: string | null,
): boolean {
  if (filter === "all") return true;
  return classifyFileKind(fileName, mimeType) === filter;
}
