/**
 * v2.8.67.1 — D.2: the ONE shared file-type table for classroom uploads.
 *
 * Lived inside /api/portal/assignment-files until the presign route arrived;
 * both routes (multipart proxy + presigned direct) and the submit-time
 * sanitizer (sanitizeFileRefs) must agree on the same extension→MIME map and
 * the same per-file caps, so the table moved here.
 *
 * Caps (owner-approved D.2):
 *   - documents/images/audio/archives: 20 MB per file (unchanged since 43.0)
 *   - video: 100 MB per file (the owner's "100 MB video" rule)
 *   - students additionally answer to a 500 MB TOTAL bucket quota
 *     (src/lib/student-storage.ts) — teachers do not.
 */

export const BY_EXT: Record<string, string> = {
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

export const ALLOWED_EXT = new Set(Object.keys(BY_EXT));

export function extensionFor(name: string): string {
  const raw = name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "";
}

/** Every extension the server treats as a video (the 100 MB cap group). */
export const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv"]);

export function isVideoExt(ext: string): boolean {
  return VIDEO_EXTS.has(ext);
}
