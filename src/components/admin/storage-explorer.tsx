"use client";

/**
 * v2.8.85.0 — the B2 Storage Explorer (main Admin Studio → Storage).
 *
 * Browses the REAL bucket folder by folder (one delimited ListObjectsV2 per
 * view through /api/admin/storage/explorer): breadcrumb, clickable folder
 * cards, a file table with download + delete (delete only for "storage" edit
 * roles), and a per-top-level-prefix usage strip that answers "mokakda wada
 * podi podi fill karanne" — which area of the bucket is actually full.
 *
 * When the driver is "database"/"local" (the sandbox dev default) the API
 * answers { ok: false } and this component shows a friendly notice instead of
 * crashing — there is simply no bucket to browse in that environment.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Download,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderUp,
  Loader2,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import { storageBarGradient, storageBarInnerWidth } from "@/lib/storage-bar";

type ExplorerFolder = { name: string; prefix: string };
type ExplorerFile = { key: string; size: number; lastModified: string };
type PrefixStat = { prefix: string; name: string; bytes: number; files: number };

type StatsPayload = {
  ok: true;
  provider: string;
  bucket: string;
  prefixes: PrefixStat[];
  totalBytes: number;
  totalFiles: number;
  bucketBytes: number | null;
  bucketFiles: number | null;
  cachedAt: string;
  cached: boolean;
};

type ListingPayload = {
  ok: boolean;
  error?: string;
  provider?: string;
  bucket?: string;
  prefix?: string;
  folders?: ExplorerFolder[];
  files?: ExplorerFile[];
  truncated?: boolean;
  cachedAt?: string;
  cached?: boolean;
  stats?: StatsPayload | null;
  statsError?: string | null;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function baseName(key: string): string {
  return key.split("/").pop() || key;
}

export function StorageExplorer({ canEdit }: { canEdit: boolean }) {
  const [prefix, setPrefix] = useState("");
  const [data, setData] = useState<ListingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(
    async (nextPrefix: string, force = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ prefix: nextPrefix, stats: "1" });
        if (force) params.set("force", "1");
        const res = await fetch(`/api/admin/storage/explorer?${params.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as ListingPayload | null;
        if (!json) throw new Error("Could not load the bucket listing.");
        if (!json.ok) throw new Error(json.error || "Could not load the bucket listing.");
        setData(json);
      } catch (cause) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "Could not load the bucket listing.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    /* setState only from the async continuation, per the react-hooks contract. */
    void Promise.resolve().then(() => load(prefix, false));
  }, [prefix, load]);

  const descend = useCallback((next: string) => setPrefix(next), []);

  const refresh = useCallback(() => void load(prefix, true), [load, prefix]);

  const deleteObject = useCallback(
    async (key: string) => {
      const name = baseName(key);
      // The explorer's one destructive action — confirm() is intentional.
      if (!window.confirm(`Delete “${name}” from the bucket? This cannot be undone.`)) return;
      setBusyKey(key);
      setError(null);
      try {
        const res = await fetch("/api/admin/storage/explorer/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Could not delete the object.");
        }
        await load(prefix, true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not delete the object.");
      } finally {
        setBusyKey(null);
      }
    },
    [load, prefix],
  );

  const crumbs = useMemo(() => {
    const parts = prefix.split("/").filter(Boolean);
    return parts.map((part, i) => ({
      name: part,
      prefix: `${parts.slice(0, i + 1).join("/")}/`,
    }));
  }, [prefix]);

  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const stats = data?.stats ?? null;
  const statsError = data?.statsError ?? null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ffd444]/15 text-[#ffd444]">
            <FolderOpen size={20} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Bucket explorer
              {data?.bucket ? (
                <span className="ml-2 text-[11px] font-normal text-white/35">
                  {data.bucket} · {String(data.provider).toUpperCase()}
                  {data.cached ? " · cached" : ""}
                </span>
              ) : null}
            </h2>
            <p className="text-xs text-white/50">
              Walk the bucket folder by folder — download any object, and clean up strays one by one.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-medium text-white/80 transition-colors hover:border-[#ffd444]/40 disabled:opacity-50"
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Driver-missing / error state — never crash, explain instead. */}
      {error ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      ) : null}

      {loading && !data ? (
        <p className="flex items-center gap-2 py-8 text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" /> Opening the bucket…
        </p>
      ) : data?.ok ? (
        <>
          {/* Per-top-level-prefix usage strip */}
          {stats ? (
            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">
                Where the bytes live
              </p>
              <p className="mt-1 text-xs text-white/60">
                {formatBytes(stats.totalBytes)} across {stats.prefixes.length} top-level{" "}
                {stats.prefixes.length === 1 ? "area" : "areas"} ·{" "}
                {stats.totalFiles.toLocaleString()} object{stats.totalFiles === 1 ? "" : "s"}
                {stats.bucketBytes != null ? (
                  <>
                    {" "}
                    · whole bucket {formatBytes(stats.bucketBytes)}
                    {stats.bucketFiles != null
                      ? ` (${stats.bucketFiles.toLocaleString()} files)`
                      : ""}
                  </>
                ) : null}
              </p>
              {stats.prefixes.length === 0 ? (
                <p className="py-3 text-xs text-white/45">The bucket has no folders yet.</p>
              ) : (
                <ul className="mt-3 max-h-64 space-y-2.5 overflow-y-auto pr-1">
                  {stats.prefixes.map((p) => {
                    const pct =
                      stats.totalBytes > 0 ? Math.round((p.bytes / stats.totalBytes) * 100) : 0;
                    return (
                      <li key={p.prefix}>
                        <button
                          type="button"
                          onClick={() => descend(p.prefix)}
                          className="flex w-full flex-wrap items-baseline justify-between gap-x-3 text-left text-xs transition-colors hover:text-white"
                          title={`Open ${p.prefix}`}
                        >
                          <span className="font-medium text-white/85">{p.prefix}</span>
                          <span className="text-white/55">
                            {pct}% · {formatBytes(p.bytes)} · {p.files.toLocaleString()} file
                            {p.files === 1 ? "" : "s"}
                          </span>
                        </button>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full overflow-hidden rounded-full transition-all"
                            style={{ width: `${Math.max(1.5, pct)}%` }}
                          >
                            <div
                              className="h-full transition-all"
                              style={{
                                width: storageBarInnerWidth(pct),
                                background: storageBarGradient("admin"),
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : statsError ? (
            <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-xs text-amber-200/90">
              Prefix stats unavailable — {statsError}
            </p>
          ) : null}

          {/* Breadcrumb */}
          <nav aria-label="Bucket location" className="mt-4 flex flex-wrap items-center gap-0.5 text-xs">
            <button
              type="button"
              onClick={() => descend("")}
              className={`rounded-lg px-2 py-1 font-medium transition-colors hover:text-white ${
                prefix === "" ? "text-[#ffd444]" : "text-white/60"
              }`}
            >
              root
            </button>
            {crumbs.map((crumb) => (
              <span key={crumb.prefix} className="flex items-center">
                <ChevronRight size={12} className="text-white/30" />
                <button
                  type="button"
                  onClick={() => descend(crumb.prefix)}
                  className={`rounded-lg px-2 py-1 font-medium transition-colors hover:text-white ${
                    crumb.prefix === prefix ? "text-[#ffd444]" : "text-white/60"
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          {/* Up one level */}
          {prefix !== "" ? (
            <button
              type="button"
              onClick={() => {
                const parent = prefix.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
                descend(parent ? `${parent}/` : "");
              }}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/12 px-3 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/40 hover:text-white"
            >
              <FolderUp size={14} /> Up one level
            </button>
          ) : null}

          {/* Folders */}
          {folders.length > 0 ? (
            <div className="mt-3 grid max-h-72 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
              {folders.map((folder) => (
                <button
                  key={folder.prefix}
                  type="button"
                  onClick={() => descend(folder.prefix)}
                  className="flex min-h-[44px] items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-[#ffd444]/40"
                >
                  <Folder size={18} className="shrink-0 text-[#ffd444]" />
                  <span className="truncate text-[12.5px] font-medium text-white" title={folder.name}>
                    {folder.name}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Files */}
          {files.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">
                {files.length} file{files.length === 1 ? "" : "s"} in {prefix || "the bucket root"}
              </p>
              <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                {files.map((file) => {
                  const busy = busyKey === file.key;
                  return (
                    <li
                      key={file.key}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileIcon size={16} className="shrink-0 text-white/40" />
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] text-white" title={file.key}>
                            {baseName(file.key)}
                          </p>
                          <p className="text-[10.5px] text-white/40">
                            {formatBytes(file.size)} · {formatDate(file.lastModified)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <a
                          href={`/api/admin/storage/explorer/download?key=${encodeURIComponent(file.key)}`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/12 px-2.5 text-[11px] font-medium text-white/70 transition-colors hover:border-[#ffd444]/40 hover:text-white"
                          title={`Download ${baseName(file.key)}`}
                        >
                          <Download size={13} /> Download
                        </a>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => void deleteObject(file.key)}
                            disabled={busy}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-400/30 px-2.5 text-[11px] font-medium text-rose-300 transition-colors hover:border-rose-400/60 hover:text-rose-200 disabled:opacity-50"
                            title={`Delete ${baseName(file.key)}`}
                          >
                            {busy ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : folders.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">
              This folder is empty — no files and no subfolders.
            </p>
          ) : null}

          {data.truncated ? (
            <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-xs text-amber-200/90">
              This view stopped at the first 1,000 entries — open a subfolder to see the rest.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
