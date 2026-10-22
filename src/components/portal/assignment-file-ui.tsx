"use client";

import { useRef, useState } from "react";
import {
  ExternalLink,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";

/* ── client mirror of src/lib/portal-assignments.ts shapes ─────────────── */

export type AssignmentFileRef = {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** v2.8.59.0 — notice attachments are addressed by their DB id through
   *  the audience-checked notices file route (undefined elsewhere). */
  id?: number;
};

export const MAX_FILES_PER_GROUP = 8;
export const MAX_FILE_MB = 20;

export function fileObjectUrl(key: string): string {
  return `/api/portal/assignment-files/object?key=${encodeURIComponent(key)}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(fileName: string): string {
  return (fileName.split(".").pop() ?? "").toLowerCase();
}

function IconFor({ fileName }: { fileName: string }) {
  const ext = extOf(fileName);
  const cls = "h-3.5 w-3.5 shrink-0";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif", "bmp"].includes(ext))
    return <FileImage size={14} className={cls} />;
  if (["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(ext))
    return <FileVideo size={14} className={cls} />;
  if (["mp3", "wav", "m4a", "ogg", "aac"].includes(ext))
    return <FileAudio size={14} className={cls} />;
  if (["xls", "xlsx", "csv", "ods"].includes(ext))
    return <FileSpreadsheet size={14} className={cls} />;
  if (["mdb", "accdb"].includes(ext))
    return <FileSpreadsheet size={14} className={cls} />;
  if (["zip"].includes(ext))
    return <FileArchive size={14} className={cls} />;
  if (["pdf", "doc", "docx", "rtf", "odt", "txt", "md", "ppt", "pptx", "odp"].includes(ext))
    return <FileText size={14} className={cls} />;
  return <FileText size={14} className={cls} />;
}

/* ── read-only chip list (open in a new tab / download) ─────────────────── */

export function FileChipList({
  files,
  buildHref,
}: {
  files: AssignmentFileRef[];
  /** v2.8.59.0 — optional custom link builder (notice attachments open
   *  through their own audience-checked route instead of the shared
   *  assignment object server). */
  buildHref?: (file: AssignmentFileRef) => string;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {files.map((f) => (
        <li key={f.key}>
          <a
            href={buildHref ? buildHref(f) : fileObjectUrl(f.key)}
            target="_blank"
            rel="noopener noreferrer"
            title={`${f.fileName} · ${formatBytes(f.sizeBytes)}`}
            className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)]"
          >
            <IconFor fileName={f.fileName} />
            <span className="truncate">{f.fileName}</span>
            <span className="shrink-0 text-[9.5px] text-[var(--pt-muted)]">
              {formatBytes(f.sizeBytes)}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Small inline "N attached" indicator for list cards. */
export function FileCountBadge({ count, hasLink }: { count: number; hasLink: boolean }) {
  if (count <= 0 && !hasLink) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[var(--pt-accent-text)]">
      <Paperclip size={10} /> {count > 0 ? count : null}
      {hasLink ? <Link2 size={10} /> : null}
    </span>
  );
}

/** A labelled "Open link" row for a stored reference URL. */
export function LinkRow({ url, label }: { url: string; label?: string }) {
  if (!url) return null;
  const href = url.startsWith("mailto:") ? url : url;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-[var(--pt-border)] bg-[var(--pt-accent-soft)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--pt-accent-text)] transition-opacity hover:opacity-85"
    >
      <Link2 size={13} className="shrink-0" />
      <span className="truncate">{label ?? url}</span>
      <ExternalLink size={11} className="shrink-0" />
    </a>
  );
}

/* ── the uploader (pick → upload → removable chips) ─────────────────────── */

export function AttachmentUploader({
  files,
  onChange,
  disabled,
  errorRef,
}: {
  files: AssignmentFileRef[];
  onChange: (files: AssignmentFileRef[]) => void;
  disabled?: boolean;
  errorRef?: { current: ((message: string) => void) | null };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  function reportError(message: string) {
    setLocalError(message);
    errorRef?.current?.(message);
    setTimeout(() => setLocalError(null), 4200);
  }

  async function handlePicked(list: FileList | null) {
    if (!list || list.length === 0 || disabled) return;
    const picked = Array.from(list);
    if (files.length + picked.length > MAX_FILES_PER_GROUP) {
      reportError(`Up to ${MAX_FILES_PER_GROUP} files per ${"submission"}.`);
      return;
    }
    for (const f of picked) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        reportError(`"${f.name}" is larger than ${MAX_FILE_MB} MB.`);
        return;
      }
    }

    setUploading((n) => n + picked.length);
    try {
      const form = new FormData();
      for (const f of picked) form.append("file", f);
      const res = await fetch("/api/portal/assignment-files", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        files?: AssignmentFileRef[];
        error?: string;
      };
      if (!res.ok || !json.ok || !Array.isArray(json.files)) {
        throw new Error(json.error || "Could not upload the file.");
      }
      onChange([...files, ...json.files]);
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : "Could not upload the file.");
    } finally {
      setUploading((n) => Math.max(0, n - picked.length));
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handlePicked(e.target.files)}
        accept=".pdf,.doc,.docx,.rtf,.odt,.txt,.md,.ppt,.pptx,.odp,.xls,.xlsx,.csv,.ods,.mdb,.accdb,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,.bmp,.mp4,.webm,.mov,.m4v,.avi,.mkv,.mp3,.wav,.m4a,.ogg,.aac,.zip"
      />
      <button
        type="button"
        disabled={disabled || uploading > 0}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--pt-border-strong)] px-3.5 text-[11.5px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)] disabled:opacity-50"
      >
        {uploading > 0 ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Plus size={13} />
        )}
        {uploading > 0 ? `Uploading ${uploading}…` : "Attach files"}
        <span className="font-normal text-[var(--pt-muted)]">
          (PDF, Word, PPT, Excel, images, video… · {MAX_FILE_MB} MB)
        </span>
      </button>

      {files.length > 0 || uploading > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f) => (
            <li
              key={f.key}
              className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-[var(--pt-chip)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--pt-chip-text)]"
            >
              <IconFor fileName={f.fileName} />
              <span className="truncate">{f.fileName}</span>
              <span className="shrink-0 text-[9.5px] opacity-70">
                {formatBytes(f.sizeBytes)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.fileName}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((x) => x.key !== f.key))}
                className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-black/10 disabled:opacity-50"
              >
                <X size={11} />
              </button>
            </li>
          ))}
          {uploading > 0 ? (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--pt-border-strong)] px-2.5 py-1.5 text-[11px] text-[var(--pt-muted)]">
              <Loader2 size={11} className="animate-spin" /> uploading…
            </li>
          ) : null}
        </ul>
      ) : null}

      {localError ? (
        <p
          role="status"
          className="mt-2 rounded-lg bg-[var(--pt-danger-bg)] px-3 py-2 text-[11.5px] text-[var(--pt-danger-text)]"
        >
          {localError}
        </p>
      ) : null}
    </div>
  );
}

/** The shared "Reference link (optional)" input. */
export function LinkField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
        <Link2 size={11} /> Link (optional — Google Drive, YouTube, email…)
      </span>
      <input
        type="url"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        placeholder="https://drive.google.com/…"
        className="h-10 w-full rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] px-3.5 text-[12.5px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)] disabled:opacity-60"
      />
    </label>
  );
}
