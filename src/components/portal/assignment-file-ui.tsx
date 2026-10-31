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
import {
  isUploadCancelled,
  portalRemainingBytes,
  type UploadProgressInfo,
  xhrUpload,
} from "@/lib/upload-client";
import type { UploadTaskState } from "@/lib/upload-task";
import { UploadProgressRow } from "@/components/portal/upload-progress-row";

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
/** v2.8.67.1 — D.2: videos get the 100 MB cap; docs stay at 20 MB. */
export const MAX_VIDEO_MB = 100;
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv"]);

function capMbFor(fileName: string): number {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  return VIDEO_EXTS.has(ext) ? MAX_VIDEO_MB : MAX_FILE_MB;
}

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

/* ── the uploader (pick → upload with live progress → removable chips) ──── */

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
  /* v2.8.68.1 — every in-flight file gets a live progress row (percentage,
     measured speed, ETA and a Cancel button) instead of the old silent
     "uploading…" chip. Aborts live in a ref so the row's ✕ can reach them. */
  const [tasks, setTasks] = useState<UploadTaskState[]>([]);
  const abortsRef = useRef<Map<string, () => void>>(new Map());
  const [localError, setLocalError] = useState<string | null>(null);

  const uploading = tasks.some((t) => t.status === "uploading");

  function reportError(message: string) {
    setLocalError(message);
    errorRef?.current?.(message);
    setTimeout(() => setLocalError(null), 4200);
  }

  function upsertTask(next: UploadTaskState) {
    setTasks((list) =>
      list.some((t) => t.id === next.id)
        ? list.map((t) => (t.id === next.id ? next : t))
        : [...list, next],
    );
  }

  function dropTask(id: string) {
    abortsRef.current.delete(id);
    setTasks((list) => list.filter((t) => t.id !== id));
  }

  function cancelTask(id: string) {
    abortsRef.current.get(id)?.();
  }

  /**
   * v2.8.68.4 — the storage probe moved into the shared upload engine
   * (portalRemainingBytes) so the pick-time pre-check and the failure
   * re-probe below read the SAME source. null remaining (unlimited
   * teacher / read failure) → skip, the server gates stay authoritative.
   */
  const remainingBytes = portalRemainingBytes;

  /** One file: presign → direct XHR PUT (progress!) or single-file proxy
   *  POST (progress!). Returns the pinned ref on success. */
  type PresignResponse = {
    ok?: boolean;
    mode?: "direct" | "proxy";
    error?: string;
    url?: string;
    key?: string;
    mimeType?: string;
  } | null;

  async function uploadOne(
    f: File,
    id: string,
    onProgress: (info: UploadProgressInfo) => void,
  ): Promise<AssignmentFileRef> {
    let presign: PresignResponse = null;
    try {
      const presignRes = await fetch("/api/portal/assignment-files/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: f.name, sizeBytes: f.size }),
      });
      if (presignRes.ok) presign = (await presignRes.json().catch(() => null)) as PresignResponse;
    } catch {
      presign = null; /* presign unreachable — the proxy gate decides below */
    }

    /* The server REFUSED this file (type / per-file cap / quota) — its
       message is the authoritative one (includes the storage-full wording). */
    if (presign?.ok === false && presign.error) {
      throw new Error(presign.error);
    }

    /* v2.8.67.1 contract kept — the direct PUT is the only way a 100 MB
       video ever leaves the browser; now it also REPORTS its progress and
       can be cancelled mid-flight. A cancelled PUT is never retried through
       the proxy (the user asked to stop). */
    if (presign?.ok && presign.mode === "direct" && presign.url && presign.key) {
      const direct = xhrUpload({
        url: presign.url,
        method: "PUT",
        headers: { "Content-Type": presign.mimeType || "application/octet-stream" },
        body: f,
        onProgress,
      });
      abortsRef.current.set(id, direct.abort);
      try {
        const put = await direct.promise;
        if (put.ok) {
          return {
            key: presign.key,
            fileName: f.name.slice(0, 180),
            mimeType: presign.mimeType || "application/octet-stream",
            sizeBytes: f.size,
          };
        }
      } catch (cause) {
        if (isUploadCancelled(cause)) throw cause;
        /* PUT failed (network / signed-URL expiry) — degrade to proxy. */
      } finally {
        abortsRef.current.delete(id);
      }
    }

    const form = new FormData();
    form.append("file", f);
    const proxy = xhrUpload({
      url: "/api/portal/assignment-files",
      method: "POST",
      body: form,
      onProgress,
    });
    abortsRef.current.set(id, proxy.abort);
    try {
      const res = await proxy.promise;
      if (res.status === 413) {
        throw new Error(
          `"${f.name}" is too large for the server right now — keep files under 4.5 MB until the school bucket's direct-upload rule is switched on.`,
        );
      }
      const json = (res.json ?? {}) as {
        ok?: boolean;
        files?: AssignmentFileRef[];
        error?: string;
      };
      if (!res.ok || !json.ok || !Array.isArray(json.files) || json.files.length === 0) {
        throw new Error(json.error || "Could not upload the file.");
      }
      return json.files[0];
    } finally {
      abortsRef.current.delete(id);
    }
  }

  async function handlePicked(list: FileList | null) {
    if (!list || list.length === 0 || disabled) return;
    const picked = Array.from(list);
    if (files.length + picked.length > MAX_FILES_PER_GROUP) {
      reportError(`Up to ${MAX_FILES_PER_GROUP} files per ${"submission"}.`);
      return;
    }
    for (const f of picked) {
      const capMb = capMbFor(f.name);
      if (f.size > capMb * 1024 * 1024) {
        reportError(`"${f.name}" is larger than ${capMb} MB.`);
        return;
      }
    }

    /* Storage pre-check — the whole batch must fit what's left. */
    const remaining = await remainingBytes();
    const needed = picked.reduce((sum, f) => sum + f.size, 0);
    if (remaining != null && needed > remaining) {
      reportError(
        `Not enough storage — these files need ${formatBytes(needed)} but only ${formatBytes(remaining)} is left. Delete old files in My Storage (or ask for a bigger cap) and try again.`,
      );
      return;
    }

    if (inputRef.current) inputRef.current.value = "";

    /* Sequential on purpose: the server buffers whole files in memory, so
       one-at-a-time keeps the sandbox's 4 GB box breathing. Each file owns
       a progress row; a cancel stops ONLY that file. */
    let collected: AssignmentFileRef[] = [];
    for (const f of picked) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const task: UploadTaskState = {
        id,
        name: f.name,
        size: f.size,
        loaded: 0,
        pct: 0,
        bytesPerSecond: null,
        etaSeconds: null,
        status: "uploading",
      };
      upsertTask(task);
      try {
        const ref = await uploadOne(f, id, (info) =>
          upsertTask({
            ...task,
            loaded: info.loaded,
            pct: info.pct,
            bytesPerSecond: info.bytesPerSecond,
            etaSeconds: info.etaSeconds,
          }),
        );
        collected = [...collected, ref];
        onChange([...files, ...collected]);
        upsertTask({ ...task, loaded: f.size, pct: 100, status: "done" });
        setTimeout(() => dropTask(id), 1200);
      } catch (cause) {
        if (isUploadCancelled(cause)) {
          dropTask(id);
          continue; /* this file stops — the rest of the queue carries on */
        }
        dropTask(id);
        /* v2.8.68.4 — failure re-probe: the server now refuses over-cap
           uploads from the Content-Length header BEFORE buffering, and
           some browsers surface that early response as a network error.
           One cheap re-probe turns any such failure into the honest
           "not enough storage — free up space" message when the numbers
           say storage is the reason. */
        const raw = cause instanceof Error ? cause.message : "Could not upload the file.";
        let message = raw;
        try {
          const left = await remainingBytes();
          if (left != null && f.size > left) {
            message = `Not enough storage — "${f.name}" needs ${formatBytes(f.size)} but only ${formatBytes(left)} is left. Delete old files in My Storage (or ask for a bigger cap) and try again.`;
          }
        } catch {
          /* the re-probe never worsens the original error */
        }
        reportError(message);
        break; /* a real failure stops the batch — no error spam */
      }
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
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--pt-border-strong)] px-3.5 text-[11.5px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)] disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Plus size={13} />
        )}
        {uploading ? "Uploading…" : "Attach files"}
        <span className="font-normal text-[var(--pt-muted)]">
          (PDF, Word, PPT, Excel, images… · {MAX_FILE_MB} MB · video {MAX_VIDEO_MB} MB)
        </span>
      </button>

      {tasks.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {tasks.map((t) => (
            <UploadProgressRow key={t.id} task={t} onCancel={cancelTask} theme="portal" />
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
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
        </ul>
      ) : null}

      {localError ? (
        <div
          role="status"
          className="mt-2 rounded-lg bg-[var(--pt-danger-bg)] px-3 py-2 text-[11.5px] text-[var(--pt-danger-text)]"
        >
          <p>{localError}</p>
          {/storage/i.test(localError) ? (
            <a
              href={`${window.location.pathname.startsWith("/teacher") ? "/teacher" : "/student"}/storage`}
              className="mt-1 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              Open My Storage →
            </a>
          ) : null}
        </div>
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
