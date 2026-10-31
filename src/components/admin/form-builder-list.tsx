"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { CustomFormField } from "@/db/schema";
import { isFormWindowOpenClient } from "@/lib/form-window";

/**
 * v2.8.85.0 — the builder's form LIST. Status chips (Published/Hidden,
 * window open/closed), submission counts, per-row edit / submissions /
 * delete, and the "New form" button that creates a draft then redirects.
 */

type BuilderFormRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  fields: CustomFormField[];
  published: boolean;
  openAt: string | null;
  closeAt: string | null;
  updatedAt: string;
  submissionCount: number;
};

const chip = "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

export function FormBuilderList() {
  const router = useRouter();
  const [rows, setRows] = useState<BuilderFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch("/api/admin/forms/builder", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.forms)) setRows(data.forms);
        else setError(data.error || "Could not load forms.");
      })
      .catch(() => setError("Could not load forms."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/forms/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled form" }),
      });
      const data = await res.json();
      if (!res.ok || !data.form?.id) {
        throw new Error(data.error || "Could not create the form.");
      }
      router.push(`/admin/forms/builder/${data.form.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create the form.");
      setCreating(false);
    }
  };

  const remove = async (row: BuilderFormRow) => {
    if (
      !window.confirm(
        `Delete "${row.title}" and its ${row.submissionCount} submission(s) permanently? Uploaded files are removed too.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/forms/builder/${row.id}`, { method: "DELETE" });
      if (res.ok) setRows((prev) => prev.filter((r) => r.id !== row.id));
      else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Delete failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs leading-relaxed text-white/50">
          Forms appear on the public <span className="text-white/80">/forms</span> hub once
          published. Answers land here with an SF reference and can be exported to Excel.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRefreshing(true);
              load().finally(() => setRefreshing(false));
            }}
            aria-label="Refresh the form list"
            className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={create}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ffd444] px-4 py-2.5 text-xs font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-60"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
            New form
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-white/50">
          <Loader2 size={18} className="animate-spin" /> Loading forms…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center">
          <ClipboardList size={26} className="mx-auto text-white/25" />
          <p className="mt-4 text-sm text-white/45">
            No forms yet — press <span className="text-[#ffd444]">New form</span> to build the first one.
          </p>
        </div>
      ) : (
        <div className="hscroll max-h-[64vh] space-y-2.5 overflow-y-auto pr-2.5">
          {rows.map((row) => {
            const window = isFormWindowOpenClient(row.openAt, row.closeAt);
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="truncate text-sm font-semibold text-white">{row.title}</span>
                      {row.published ? (
                        <span className={`${chip} bg-emerald-400/10 text-emerald-300`}>Published</span>
                      ) : (
                        <span className={`${chip} bg-white/10 text-white/55`}>Hidden</span>
                      )}
                      {row.published &&
                        (window.open ? (
                          <span className={`${chip} bg-sky-400/10 text-sky-300`}>Collecting</span>
                        ) : (
                          <span className={`${chip} bg-amber-400/10 text-amber-300`}>Window closed</span>
                        ))}
                    </div>
                    <p className="mt-1 truncate text-xs text-white/45">
                      /forms/{row.slug} · {row.fields.length} question
                      {row.fields.length === 1 ? "" : "s"} · {row.submissionCount} submission
                      {row.submissionCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/admin/forms/builder/${row.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:border-[#ffd444] hover:text-[#ffd444]"
                    >
                      <Pencil size={12} /> Edit
                    </Link>
                    <Link
                      href={`/admin/forms/builder/${row.id}/submissions`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:border-white/35 hover:text-white"
                    >
                      <FileSpreadsheet size={12} /> Submissions
                    </Link>
                    <a
                      href={`/forms/${row.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-white/35 hover:text-white"
                      aria-label="Open the public form"
                      title="Open the public form"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      onClick={() => remove(row)}
                      disabled={busyId === row.id}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300"
                      aria-label={`Delete ${row.title}`}
                    >
                      {busyId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
