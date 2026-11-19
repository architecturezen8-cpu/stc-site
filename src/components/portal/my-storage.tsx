"use client";

import { useMemo, useState } from "react";
import { storageBarGradient, storageBarInnerWidth } from "@/lib/storage-bar";
import {
  Check,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  HardDrive,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { formatBytes } from "@/components/portal/assignment-file-ui";
import {
  FILE_KIND_OPTIONS,
  fileKindMatches,
  type FileKind,
} from "@/lib/file-type-filter";

/* ────────────────────────────────────────────────────────────────────────
   Portal → "My Storage" (v2.8.67.3, D.3) — one client island shared by the
   student / teacher / parent storage pages (role prop switches the copy).

   Files vs Trash tabs: a live file's [Delete] is a soft TRASH (optimistic,
   stops counting toward the quota instantly); the Trash tab offers
   [Restore] and a two-step [Delete forever] (the bucket object really goes).
   Chat attachments have NO trash — their row's [Remove attachment] is a
   two-step purge that keeps the message text.
   Every action rides POST /api/portal/my-files/action; server error strings
   (403/400) surface verbatim in the inline banner.
   ──────────────────────────────────────────────────────────────────── */

export type MyFileItem = {
  kind: "submission" | "assignment" | "material" | "notice" | "chat";
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  trashed: boolean;
  context?: string | null;
};

export type MyStoragePayload = {
  used: number;
  capBytes: number | null;
  files: Partial<
    Record<"submissions" | "assignments" | "materials" | "notices" | "chat", MyFileItem[]>
  >;
};

const GROUP_LABELS: Record<string, string> = {
  submissions: "Submission files",
  assignments: "Assignment attachments",
  materials: "Material files",
  notices: "Notice attachments",
  chat: "Chat attachments",
};

const TRASHABLE = new Set(["submission", "assignment", "material", "notice"]);

function extOf(fileName: string): string {
  return (fileName.split(".").pop() ?? "").toLowerCase();
}

function FileIcon({ fileName }: { fileName: string }) {
  const ext = extOf(fileName);
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif", "bmp"].includes(ext))
    return <FileImage size={15} className="shrink-0" />;
  if (["mp4", "webm", "mov", "m4v", "avi", "mkv"].includes(ext))
    return <FileVideo size={15} className="shrink-0" />;
  if (["mp3", "wav", "m4a", "ogg", "aac"].includes(ext))
    return <FileAudio size={15} className="shrink-0" />;
  if (["xls", "xlsx", "csv", "ods", "mdb", "accdb"].includes(ext))
    return <FileSpreadsheet size={15} className="shrink-0" />;
  if (ext === "zip") return <FileArchive size={15} className="shrink-0" />;
  return <FileText size={15} className="shrink-0" />;
}

const btnSoft =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[var(--pt-border-strong)] px-3.5 text-[11.5px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)] disabled:opacity-50";
const btnDanger =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[var(--pt-danger-text)]/40 px-3.5 text-[11.5px] font-semibold text-[var(--pt-danger-text)] transition-colors hover:bg-[var(--pt-danger-bg)] disabled:opacity-50";
const tabBtn = (active: boolean) =>
  `inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold transition-colors ${
    active
      ? "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]"
      : "text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
  }`;

export function MyStorage({ role, data }: { role: "student" | "teacher" | "parent"; data: MyStoragePayload }) {
  const [items, setItems] = useState<MyFileItem[]>(
    Object.values(data.files).flat().filter((f): f is MyFileItem => f != null),
  );
  const [used, setUsed] = useState(data.used);
  const [view, setView] = useState<"files" | "trash">("files");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* v2.8.69.0 — owner ask: filter my files by type (same shared classifier
     the two admin studios use). Applies to BOTH Files and Trash views. */
  const [kindFilter, setKindFilter] = useState<FileKind>("all");

  const capBytes = data.capBytes;
  const pct =
    capBytes && capBytes > 0 ? Math.min(100, Math.round((used / capBytes) * 100)) : 0;

  const grouped = useMemo(() => {
    const order: { key: string; kind: MyFileItem["kind"] }[] =
      role === "teacher"
        ? [
            { key: "assignments", kind: "assignment" },
            { key: "materials", kind: "material" },
            { key: "notices", kind: "notice" },
            { key: "chat", kind: "chat" },
          ]
        : [
            { key: "submissions", kind: "submission" },
            { key: "chat", kind: "chat" },
          ];
    return order
      .map(({ key, kind }) => ({
        key,
        label: GROUP_LABELS[key] ?? key,
        items: items
          .filter((f) => (view === "trash" ? f.trashed : !f.trashed))
          .filter((f) => f.kind === kind)
          .filter((f) => fileKindMatches(kindFilter, f.fileName, f.mimeType))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }))
      .filter((g) => g.items.length > 0);
  }, [items, view, role, kindFilter]);

  const trashCount = items.filter((f) => f.trashed).length;

  function flash(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(null), 4200);
  }

  async function act(
    file: MyFileItem,
    action: "trash" | "restore" | "purge",
    onDone: () => void,
  ) {
    const key = `${file.kind}-${file.id}-${action}`;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/portal/my-files/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: file.kind, id: file.id, action }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Could not ${action} the file.`);
      }
      onDone();
      if (action === "purge") {
        flash(
          file.kind === "chat"
            ? "Attachment removed — the message text stays."
            : `Deleted forever — ${formatBytes(file.sizeBytes)} freed.`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} the file.`);
    } finally {
      setBusyKey(null);
      setConfirmKey(null);
    }
  }

  const trash = (file: MyFileItem) =>
    act(file, "trash", () => {
      setItems((list) =>
        list.map((f) => (f.kind === file.kind && f.id === file.id ? { ...f, trashed: true } : f)),
      );
      setUsed((u) => Math.max(0, u - file.sizeBytes));
    });

  const restore = (file: MyFileItem) =>
    act(file, "restore", () => {
      setItems((list) =>
        list.map((f) => (f.kind === file.kind && f.id === file.id ? { ...f, trashed: false } : f)),
      );
      setUsed((u) => u + file.sizeBytes);
    });

  const purge = (file: MyFileItem) =>
    act(file, "purge", () => {
      setItems((list) => list.filter((f) => !(f.kind === file.kind && f.id === file.id)));
      if (file.kind !== "chat" && !file.trashed) setUsed((u) => Math.max(0, u - file.sizeBytes));
    });

  return (
    <div className="space-y-4">
      {/* header — used / cap */}
      <div className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
              <HardDrive size={20} />
            </span>
            <div>
              <p className="font-display text-[19px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)]">
                {formatBytes(used)}
                {capBytes != null ? (
                  <span className="text-[13px] font-normal text-[var(--pt-body)]">
                    {" "}
                    of {formatBytes(capBytes)} used
                  </span>
                ) : (
                  <span className="text-[13px] font-normal text-[var(--pt-body)]"> used</span>
                )}
              </p>
              <p className="text-[11px] text-[var(--pt-muted)]">
                Trashed files don&apos;t count toward your space.
              </p>
            </div>
          </div>
          {capBytes != null ? (
            <span
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                pct >= 90
                  ? "bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
                  : "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]"
              }`}
            >
              {pct}% of cap
            </span>
          ) : (
            <span className="rounded-full bg-[var(--pt-chip)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-chip-text)]">
              No cap set
            </span>
          )}
        </div>
        {capBytes != null && capBytes > 0 ? (
          /* v2.8.83.0 — gradient fill: blends toward amber near 60% and red
             near 90% instead of snapping (shared lib src/lib/storage-bar.ts). */
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--pt-divider,rgba(0,0,0,0.08))]">
            <div
              className="h-full overflow-hidden rounded-full transition-all"
              style={{ width: `${Math.max(1.5, pct)}%` }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: storageBarInnerWidth(pct),
                  background: storageBarGradient("portal"),
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {role === "parent" ? (
        <p className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] bg-[var(--pt-panel-soft)] px-5 py-6 text-center text-[12.5px] leading-relaxed text-[var(--pt-body)]">
          You don&apos;t upload anything yet — homework answers and chat files belong to your
          child&apos;s account. This page is ready for the day the school adds parent uploads.
        </p>
      ) : null}

      {error ? (
        <p
          role="status"
          className="rounded-xl bg-[var(--pt-danger-bg)] px-4 py-3 text-[12px] text-[var(--pt-danger-text)]"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-xl bg-[var(--pt-good-bg)] px-4 py-3 text-[12px] text-[var(--pt-good-text)]"
        >
          {notice}
        </p>
      ) : null}

      {/* tabs */}
      <div className="flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-1.5">
        <button type="button" className={tabBtn(view === "files")} onClick={() => setView("files")}>
          <Check size={14} /> Files
          <span className="text-[10.5px] font-normal opacity-70">
            {items.filter((f) => !f.trashed).length}
          </span>
        </button>
        <button type="button" className={tabBtn(view === "trash")} onClick={() => setView("trash")}>
          <Trash2 size={14} /> Trash
          {trashCount > 0 ? (
            <span className="rounded-full bg-[var(--pt-chip)] px-2 py-0.5 text-[10px] font-bold text-[var(--pt-chip-text)]">
              {trashCount}
            </span>
          ) : null}
        </button>
        {/* v2.8.69.0 — file-type filter (shared classifier) */}
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as FileKind)}
          className="ml-auto h-9 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 text-[11.5px] font-medium text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
          aria-label="Filter by file type"
        >
          {FILE_KIND_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* grouped lists */}
      {grouped.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--pt-border-strong)] px-5 py-10 text-center text-[12.5px] text-[var(--pt-body)]">
          {view === "trash"
            ? kindFilter !== "all"
              ? "No trashed files of that type."
              : "Trash is empty — deleted files stay here until you remove them forever."
            : kindFilter !== "all"
              ? "No files of that type yet."
              : role === "parent"
                ? "Nothing to show yet."
                : "No files yet — files you submit with homework or attach in chat appear here."}
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <section key={g.key}>
              <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                {g.label} ({g.items.length})
              </p>
              <ul className="pt-scrollbar max-h-96 space-y-2 overflow-y-auto pr-0.5">
                {g.items.map((f) => {
                  const key = `${f.kind}-${f.id}`;
                  const busy = busyKey !== null;
                  return (
                    <li
                      key={key}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3.5 py-3 transition-opacity ${
                        f.trashed ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 text-[var(--pt-accent-text)]">
                          <FileIcon fileName={f.fileName} />
                        </span>
                        <div className="min-w-0">
                          <p
                            className="truncate text-[12.5px] font-semibold text-[var(--pt-heading)]"
                            title={f.fileName}
                          >
                            {f.fileName}
                          </p>
                          <p className="truncate text-[10.5px] text-[var(--pt-muted)]">
                            {f.context ? `${f.context} · ` : ""}
                            {formatBytes(f.sizeBytes)} ·{" "}
                            {new Date(f.createdAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {!f.trashed && TRASHABLE.has(f.kind) ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => trash(f)}
                            className={btnSoft}
                            aria-label={`Delete ${f.fileName}`}
                          >
                            {busyKey === `${f.kind}-${f.id}-trash` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Delete
                          </button>
                        ) : null}

                        {f.trashed ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => restore(f)}
                              className={btnSoft}
                              aria-label={`Restore ${f.fileName}`}
                            >
                              {busyKey === `${f.kind}-${f.id}-restore` ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <RotateCcw size={13} />
                              )}
                              Restore
                            </button>
                            {confirmKey === `${key}-purge` ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => purge(f)}
                                  className={btnDanger}
                                >
                                  {busyKey === `${f.kind}-${f.id}-purge` ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                  Really delete forever
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmKey(null)}
                                  className={btnSoft}
                                >
                                  <X size={13} /> Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmKey(`${key}-purge`)}
                                className={btnDanger}
                                aria-label={`Delete ${f.fileName} forever`}
                              >
                                <Trash2 size={13} /> Delete forever
                              </button>
                            )}
                          </>
                        ) : null}

                        {f.kind === "chat" ? (
                          confirmKey === `${key}-purge` ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => purge(f)}
                                className={btnDanger}
                              >
                                {busyKey === `${f.kind}-${f.id}-purge` ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Trash2 size={13} />
                                )}
                                Remove it
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmKey(null)}
                                className={btnSoft}
                              >
                                <X size={13} /> Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmKey(`${key}-purge`)}
                              className={btnDanger}
                              aria-label={`Remove attachment ${f.fileName}`}
                            >
                              <Trash2 size={13} /> Remove attachment
                            </button>
                          )
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {view === "trash" ? (
                <p className="mt-1.5 px-1 text-[10.5px] text-[var(--pt-muted)]">
                  Deleted forever removes the file from the school&apos;s storage for good.
                </p>
              ) : null}
              {g.key === "chat" && view === "files" ? (
                <p className="mt-1.5 px-1 text-[10.5px] text-[var(--pt-muted)]">
                  Removing an attachment keeps the message text — only the file goes.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
