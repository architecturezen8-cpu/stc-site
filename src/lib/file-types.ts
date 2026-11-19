/**
 * v2.8.53.0 — the ONE file-type table every upload surface shares.
 *
 * Extracted from the assignment-files upload route so the chat attachments
 * (and any future uploader) accept exactly the same extensions with the
 * same MIME mapping — one place to add a type, no drift between surfaces.
 */

export const FILE_MIME_BY_EXT: Record<string, string> = {
  // documents
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain",
  md: "text/markdown",
  // slides
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
  // sheets
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  // databases (MS Access)
  mdb: "application/x-msaccess",
  accdb: "application/x-msaccess",
  // images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  bmp: "image/bmp",
  // video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  // audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  aac: "audio/aac",
  // archives
  zip: "application/zip",
};

export const ALLOWED_FILE_EXTS = new Set(Object.keys(FILE_MIME_BY_EXT));

/** "Photo.PNG" → "png"; anything odd → "" (rejected by the callers). */
export function extensionFor(fileName: string): string {
  const raw = fileName.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "";
}

/** "photo.png" → "image/png" — undefined for extensions outside the table. */
export function mimeForExtension(ext: string): string | undefined {
  return FILE_MIME_BY_EXT[ext];
}

/** The `accept` attribute for file inputs — one shared string. */
export const FILE_ACCEPT_ATTR = Object.keys(FILE_MIME_BY_EXT)
  .map((ext) => `.${ext}`)
  .join(",");

/** 1.4 MB → "1.4 MB"; 800 bytes → "800 KB"-style human label for chips. */
export function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}
