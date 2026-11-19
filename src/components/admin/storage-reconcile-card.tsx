"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, Loader2, RefreshCcw, Scale, TriangleAlert } from "lucide-react";

/**
 * v2.9.15.6 — the Storage page's TRUTH CHECK card (the owner: "profile
 * photos ehema hariyata storage eke track wenawa ne ... delete karoth ...
 * storage bucket eka full wenna puluwan ... admin eke thiyana storage
 * option eken okkoma storage hariyatama track wenna ona").
 *
 * It walks the profile-photo family prefix by prefix and shows BOTH
 * ledgers side by side:
 *   · the BUCKET truth (what the object store actually holds);
 *   · the DATABASE claim (what the rows + storage ledger count);
 * plus the two mismatches that used to hide silently:
 *   · UNCLAIMED — bytes in the bucket nothing in the database claims
 *     (the old "deleted in the UI but the bucket fills anyway" leak);
 *   · MISSING — rows still counting bytes whose object is already gone.
 *
 * The first sweep also ADOPTS legacy photos into the storage ledger with
 * their real bucket sizes, so the ledger self-heals on first read.
 *
 * variant="admin" — the main studio's fixed dark panel.
 * variant="lms"   — the LMS Admin Studio's themeable --la-* surface.
 */

type ReconcileRow = {
  prefix: string;
  label: string;
  bucketFiles: number;
  bucketBytes: number;
  trackedFiles: number;
  trackedBytes: number;
  orphanFiles: number;
  orphanBytes: number;
  ghostFiles: number;
  ghostBytes: number;
};

type ReconcilePayload = {
  ok: boolean;
  rows?: ReconcileRow[];
  freedBytes?: number;
  freedFiles?: number;
  adopted?: number;
  error?: string;
};

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = value;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function StorageReconcileCard({
  variant = "admin",
}: {
  variant?: "admin" | "lms";
}) {
  const dark = variant === "admin";
  const [data, setData] = useState<ReconcilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/storage/reconcile${force ? "?force=1" : ""}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as ReconcilePayload;
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not reconcile storage.");
      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reconcile storage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* The fetch starts one tick late so the effect never sets state
       synchronously (the React lint rule) — the card shows its loading
       state from the initial render anyway. */
    const t = setTimeout(() => void load(false), 0);
    return () => clearTimeout(t);
  }, [load]);

  const rows = data?.rows ?? [];
  const totalOrphanBytes = rows.reduce((sum, r) => sum + r.orphanBytes, 0);
  const totalOrphanFiles = rows.reduce((sum, r) => sum + r.orphanFiles, 0);
  const totalGhostBytes = rows.reduce((sum, r) => sum + r.ghostBytes, 0);
  const clean =
    !loading && !error && totalOrphanBytes === 0 && totalGhostBytes === 0 && rows.length > 0;

  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${
        dark ? "border-white/10 bg-white/[0.03]" : "la-panel-shadow border-[var(--la-border)] bg-[var(--la-panel)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
              dark
                ? "bg-emerald-400/15 text-emerald-300"
                : "bg-[var(--la-accent-soft,#f2f4f8)] text-[var(--la-heading)]"
            }`}
          >
            <Scale size={20} />
          </span>
          <div>
            <h2
              className={`font-display text-lg font-semibold ${
                dark ? "text-white" : "text-[var(--la-heading)]"
              }`}
            >
              Truth check — bucket vs database
            </h2>
            <p className={`text-xs ${dark ? "text-white/50" : "text-[var(--la-body)]"}`}>
              Every profile photo and avatar, both ledgers side by side — the bucket is audited, the
              database is counted, the difference is named.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors ${
            dark
              ? "border-white/10 text-white/80 hover:border-[#ffd444]/40"
              : "border-[var(--la-border)] text-[var(--la-body)] hover:border-[var(--la-accent)]/40"
          }`}
        >
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Re-walk
        </button>
      </div>

      {loading && !data ? (
        <p className={`mt-4 flex items-center gap-2 text-sm ${dark ? "text-white/50" : "text-[var(--la-body)]"}`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Comparing the bucket with the database…
        </p>
      ) : error ? (
        <p
          className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
            dark
              ? "border-amber-400/25 bg-amber-400/10 text-amber-200/90"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {error}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {clean ? (
            <p
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                dark
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Every byte is accounted for — the bucket
              and the database agree.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div
                className={`rounded-xl border px-3.5 py-3 ${
                  dark
                    ? "border-amber-400/25 bg-amber-400/10"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <p
                  className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${
                    dark ? "text-amber-200" : "text-amber-700 dark:text-amber-300"
                  }`}
                >
                  <TriangleAlert className="h-3.5 w-3.5" /> Unclaimed in bucket
                </p>
                <p className={`mt-1 font-display text-xl font-semibold ${dark ? "text-white" : "text-[var(--la-heading)]"}`}>
                  {formatBytes(totalOrphanBytes)}{" "}
                  <span className={`text-[11px] font-normal ${dark ? "text-white/45" : "text-[var(--la-muted)]"}`}>
                    · {totalOrphanFiles} file{totalOrphanFiles === 1 ? "" : "s"}
                  </span>
                </p>
                <p className={`mt-1 text-[11px] leading-relaxed ${dark ? "text-white/45" : "text-[var(--la-body)]"}`}>
                  Bytes the bucket holds but no database row claims — upload leftovers from before
                  the ledger existed. The Media Library explorer can delete them by hand.
                </p>
              </div>
              <div
                className={`rounded-xl border px-3.5 py-3 ${
                  dark ? "border-white/10 bg-white/[0.04]" : "border-[var(--la-border)] bg-[var(--la-bg)]"
                }`}
              >
                <p
                  className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] ${
                    dark ? "text-white/60" : "text-[var(--la-muted)]"
                  }`}
                >
                  <HelpCircle className="h-3.5 w-3.5" /> Counted but missing
                </p>
                <p className={`mt-1 font-display text-xl font-semibold ${dark ? "text-white" : "text-[var(--la-heading)]"}`}>
                  {formatBytes(totalGhostBytes)}
                </p>
                <p className={`mt-1 text-[11px] leading-relaxed ${dark ? "text-white/45" : "text-[var(--la-body)]"}`}>
                  Database rows whose object is already gone — they stop counting the moment the
                  reconciliation sweep re-walks.
                </p>
              </div>
            </div>
          )}

          <div className={`overflow-hidden rounded-xl border ${dark ? "border-white/10" : "border-[var(--la-border)]"}`}>
            <table className="w-full text-left text-xs">
              <thead>
                <tr
                  className={`border-b text-[10px] uppercase tracking-[0.14em] ${
                    dark
                      ? "border-white/10 bg-white/[0.04] text-white/40"
                      : "border-[var(--la-border)] bg-[var(--la-bg)] text-[var(--la-muted)]"
                  }`}
                >
                  <th className="px-3 py-2 font-semibold">Folder</th>
                  <th className="px-3 py-2 text-right font-semibold">Bucket</th>
                  <th className="px-3 py-2 text-right font-semibold">Database</th>
                  <th className="px-3 py-2 text-right font-semibold">Unclaimed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.prefix}
                    className={`border-b last:border-0 ${dark ? "border-white/5" : "border-[var(--la-border)]"}`}
                  >
                    <td className="px-3 py-2.5">
                      <p className={`font-medium ${dark ? "text-white/85" : "text-[var(--la-heading)]"}`}>
                        {row.label}
                      </p>
                      <p className={`font-mono text-[10px] ${dark ? "text-white/30" : "text-[var(--la-muted)]"}`}>
                        {row.prefix}
                      </p>
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${dark ? "text-white/70" : "text-[var(--la-body)]"}`}>
                      {formatBytes(row.bucketBytes)}
                      <span className={`block text-[10px] ${dark ? "text-white/30" : "text-[var(--la-muted)]"}`}>
                        {row.bucketFiles} file{row.bucketFiles === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${dark ? "text-white/70" : "text-[var(--la-body)]"}`}>
                      {formatBytes(row.trackedBytes)}
                      <span className={`block text-[10px] ${dark ? "text-white/30" : "text-[var(--la-muted)]"}`}>
                        {row.trackedFiles} file{row.trackedFiles === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.orphanBytes > 0 ? (
                        <span className={dark ? "font-semibold text-amber-300" : "font-semibold text-amber-600 dark:text-amber-400"}>
                          {formatBytes(row.orphanBytes)}
                        </span>
                      ) : (
                        <span className={dark ? "text-emerald-300/80" : "text-emerald-600 dark:text-emerald-400"}>
                          0 B
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data?.freedBytes ? (
            <p className={`text-[11px] ${dark ? "text-white/40" : "text-[var(--la-muted)]"}`}>
              History: {formatBytes(data.freedBytes)} across {data.freedFiles} photo
              {data.freedFiles === 1 ? "" : "s"} already removed — those bytes are gone from the
              bucket for good.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
