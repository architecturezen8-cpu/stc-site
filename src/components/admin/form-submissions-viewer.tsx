"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Loader2, Paperclip, RefreshCw, Search, Trash2 } from "lucide-react";
import type { CustomFormField } from "@/db/schema";

/**
 * v2.8.85.0 — the submissions EXPLORER for one custom form: a scrollable
 * table (ref · date · one column per question · files), search, per-row
 * delete and the Excel export (server-generated .xlsx, one column per
 * question). Submission files download through the admin-only file route.
 */

type SubmissionFile = {
  fieldId: string;
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type SubmissionRow = {
  id: number;
  refCode: string;
  data: Record<string, string>;
  files: SubmissionFile[];
  submitterEmail: string | null;
  receiptSent: boolean;
  createdAt: string;
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FormSubmissionsViewer({
  formId,
  formSlug,
  formTitle,
  fields,
}: {
  formId: number;
  formSlug: string;
  formTitle: string;
  fields: CustomFormField[];
}) {
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/admin/forms/builder/${formId}/submissions`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.rows)) setRows(data.rows);
        else setToast(data.error || "Could not load submissions.");
      })
      .catch(() => setToast("Could not load submissions."))
      .finally(() => setLoading(false));
  }, [formId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const remove = async (row: SubmissionRow) => {
    if (!window.confirm(`Delete submission ${row.refCode} permanently?`)) return;
    setBusyId(row.id);
    try {
      /* The DELETE lives on the form resource (cascade body kept for
         symmetry with the builder API): /api/admin/forms/builder/[id]
         handles form deletion; single submissions go through the same
         submissions endpoint's DELETE below. */
      const res = await fetch(`/api/admin/forms/builder/${formId}/submissions?rowId=${row.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setToast(`Deleted ${row.refCode}.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || "Delete failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.refCode, row.submitterEmail ?? "", Object.values(row.data ?? {}).join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const fileLabel = (fieldId: string) => fields.find((f) => f.id === fieldId)?.label ?? fieldId;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, email or any answer…"
            className={`${input} pl-10`}
          />
        </div>
        <a
          href={`/api/admin/forms/builder/${formId}/submissions?export=1`}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444] ${
            rows.length ? "" : "pointer-events-none opacity-40"
          }`}
        >
          <Download size={13} /> Export Excel
        </a>
        <button
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh the list"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-white/50">
          <Loader2 size={18} className="animate-spin" /> Loading submissions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-white/40">
          {rows.length ? "No submissions match the search." : "No submissions yet."}
        </div>
      ) : (
        <div className="hscroll max-h-[64vh] overflow-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#141414]">
              <tr>
                {["Reference", "Submitted", ...fields.map((f) => f.label), "Files", ""].map(
                  (heading, i) => (
                    <th
                      key={`${heading}-${i}`}
                      className="whitespace-nowrap border-b border-white/10 px-3.5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40"
                    >
                      {heading || "Actions"}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="align-top transition-colors hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-3.5 py-3 text-xs font-semibold text-[#ffd444]">
                    {row.refCode}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-3 text-[11px] text-white/45">
                    {formatDate(row.createdAt)}
                    {row.receiptSent ? (
                      <span className="mt-0.5 block text-[9.5px] uppercase tracking-wide text-emerald-300/70">
                        receipt sent
                      </span>
                    ) : null}
                  </td>
                  {fields.map((field) => (
                    <td key={field.id} className="max-w-[260px] px-3.5 py-3 text-xs leading-relaxed text-white/80">
                      <span className="line-clamp-4 whitespace-pre-wrap break-words">
                        {row.data?.[field.id] || "—"}
                      </span>
                    </td>
                  ))}
                  <td className="min-w-[180px] px-3.5 py-3">
                    {row.files.length === 0 ? (
                      <span className="text-[11px] text-white/25">—</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {row.files.map((file) => (
                          <li key={file.key}>
                            <a
                              href={`/api/admin/forms/builder/${formId}/file?key=${encodeURIComponent(file.key)}`}
                              className="inline-flex max-w-[240px] items-center gap-1.5 text-[11px] text-white/70 transition-colors hover:text-[#ffd444]"
                              title={`${fileLabel(file.fieldId)} · ${file.fileName} · ${mb(file.sizeBytes)}`}
                            >
                              <Paperclip size={11} className="shrink-0" />
                              <span className="truncate">{file.fileName}</span>
                              <ExternalLink size={10} className="shrink-0 opacity-60" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3.5 py-3">
                    <button
                      onClick={() => remove(row)}
                      disabled={busyId === row.id}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
                      aria-label={`Delete ${row.refCode}`}
                    >
                      {busyId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-white/35">
        Public address: <span className="text-white/60">/forms/{formSlug}</span> · {formTitle}
      </p>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#181818] px-5 py-2.5 text-xs text-white shadow-lift">
          {toast}
        </div>
      )}
    </div>
  );
}
