"use client";

import { Ban, Check, CloudUpload, TriangleAlert, X } from "lucide-react";
import type { UploadTaskState } from "@/lib/upload-task";

/**
 * v2.8.68.1 — the ONE visual for "bytes are moving": file name + size, a
 * live progress bar with the percentage, the measured network speed and an
 * ETA, and a Cancel button while the upload is in flight.
 *
 * Three colour themes so the same row works everywhere:
 *   portal — the student/teacher/parent `--pt-*` palette
 *   studio — the LMS admin studio `--la-*` palette
 *   admin  — the website Admin Studio's dark + gold (#ffd444) look
 */
export function UploadProgressRow({
  task,
  onCancel,
  theme = "portal",
}: {
  task: UploadTaskState;
  onCancel?: (id: string) => void;
  theme?: "portal" | "studio" | "admin";
}) {
  const c = THEMES[theme];
  const pct = Math.max(0, Math.min(100, task.pct));

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${c.frame}`}
      role="status"
      aria-label={`Uploading ${task.name}: ${pct}%`}
    >
      <span className={`shrink-0 ${c.icon}`}>
        {task.status === "done" ? (
          <Check size={13} aria-hidden="true" />
        ) : task.status === "error" ? (
          <TriangleAlert size={13} aria-hidden="true" />
        ) : task.status === "cancelled" ? (
          <Ban size={13} aria-hidden="true" />
        ) : (
          <CloudUpload size={13} aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`min-w-0 truncate text-[11.5px] font-semibold ${c.title}`}>
            {task.name}
          </span>
          <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${c.meta}`}>
            {task.status === "uploading" ? (
              <>
                {pct}%{speedLabel(task.bytesPerSecond) ? ` · ${speedLabel(task.bytesPerSecond)}` : ""}
                {etaLabel(task.etaSeconds) ? ` · ${etaLabel(task.etaSeconds)} left` : ""}
              </>
            ) : task.status === "done" ? (
              "Done"
            ) : task.status === "cancelled" ? (
              "Cancelled"
            ) : (
              "Failed"
            )}
          </span>
        </div>
        <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${c.track}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              task.status === "error" ? c.trackError : task.status === "done" ? c.trackDone : c.trackActive
            }`}
            style={{ width: `${task.status === "uploading" ? pct : 100}%` }}
          />
        </div>
        <p className={`mt-0.5 truncate text-[9.5px] ${c.meta}`}>
          {task.status === "error"
            ? task.error || "Upload failed."
            : `${humanBytes(task.size)}${task.status === "uploading" ? ` · ${humanBytes(task.loaded)} sent` : ""}`}
        </p>
      </div>

      {task.status === "uploading" && onCancel ? (
        <button
          type="button"
          onClick={() => onCancel(task.id)}
          aria-label={`Cancel uploading ${task.name}`}
          title="Cancel this upload"
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${c.cancelBtn}`}
        >
          <X size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function speedLabel(bps: number | null | undefined): string {
  if (!bps || !Number.isFinite(bps) || bps <= 0) return "";
  if (bps < 1024 * 1024) return `${Math.max(1, Math.round(bps / 1024))} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function etaLabel(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const THEMES = {
  portal: {
    frame: "border-[var(--pt-border)] bg-[var(--pt-panel-soft)]",
    icon: "text-[var(--pt-accent-text)]",
    title: "text-[var(--pt-heading)]",
    meta: "text-[var(--pt-muted)]",
    track: "bg-[var(--pt-border)]",
    trackActive: "bg-[var(--pt-accent)]",
    trackDone: "bg-[var(--pt-good,#4a9e5b)]",
    trackError: "bg-[var(--pt-danger-text,#c0392b)]",
    cancelBtn:
      "text-[var(--pt-muted)] hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)]",
  },
  studio: {
    frame: "border-[var(--la-border)] bg-[var(--la-accent-soft)]",
    icon: "text-[var(--la-accent-text)]",
    title: "text-[var(--la-heading)]",
    meta: "text-[var(--la-muted)]",
    track: "bg-[var(--la-border)]",
    trackActive: "bg-[var(--la-accent)]",
    trackDone: "bg-[var(--la-good-text,#3f7a4e)]",
    trackError: "bg-[var(--la-danger-text,#b3261e)]",
    cancelBtn:
      "text-[var(--la-muted)] hover:bg-[var(--la-danger-bg)] hover:text-[var(--la-danger-text)]",
  },
  admin: {
    frame: "border-white/10 bg-white/[0.025]",
    icon: "text-[#ffd444]",
    title: "text-white",
    meta: "text-white/50",
    track: "bg-white/10",
    trackActive: "bg-[#ffd444]",
    trackDone: "bg-emerald-400",
    trackError: "bg-red-400",
    cancelBtn: "text-white/50 hover:bg-red-500/15 hover:text-red-300",
  },
} as const;
