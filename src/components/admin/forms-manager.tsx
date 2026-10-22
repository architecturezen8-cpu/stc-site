"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Download,
  Loader2,
  Mail,
  Phone,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";

export type FormsTab = "grade-6" | "alevel" | "contacts" | "appointments";

type BaseRow = {
  id: number;
  status: string;
  createdAt: string;
};

type AdmissionRow = BaseRow & {
  programme: string;
  studentName: string;
  dob: string;
  gender: string;
  guardianName: string;
  relationship: string;
  phone: string;
  email: string;
  address: string;
  currentSchool: string;
  currentGrade: string | null;
  stream: string | null;
  olYear: string | null;
  olResults: string | null;
  olIndex: string | null;
  medium: string;
  siblingName: string | null;
  fatherOldThomian: string | null;
  fatherYears: string | null;
  housePreference: string | null;
  message: string | null;
};

type AppointmentRow = BaseRow & {
  name: string;
  email: string;
  phone: string;
  department: string;
  visitDate: string;
  visitTime: string;
  purpose: string;
  visitors: string;
  notes: string | null;
};

type InquiryRow = BaseRow & {
  name: string;
  email: string;
  phone: string;
  inquiryType: string;
  grade: string | null;
  message: string;
};

type AnyRow = AdmissionRow | AppointmentRow | InquiryRow;

const API_TYPE: Record<FormsTab, string> = {
  "grade-6": "admissions",
  alevel: "admissions",
  contacts: "inquiries",
  appointments: "appointments",
};

const STATUS_STYLES: Record<string, string> = {
  received: "bg-white/10 text-white/75",
  requested: "bg-white/10 text-white/75",
  unread: "bg-[#ffd444]/15 text-[#ffd444]",
  reviewing: "bg-sky-400/10 text-sky-300",
  read: "bg-sky-400/10 text-sky-300",
  confirmed: "bg-emerald-400/10 text-emerald-300",
  shortlisted: "bg-violet-400/10 text-violet-300",
  replied: "bg-emerald-400/10 text-emerald-300",
  approved: "bg-emerald-400/15 text-emerald-300",
  completed: "bg-white/10 text-white/60",
  waitlisted: "bg-amber-400/10 text-amber-300",
  rejected: "bg-red-400/10 text-red-300",
  cancelled: "bg-red-400/10 text-red-300",
  archived: "bg-white/5 text-white/40",
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

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed text-white/85">{value}</dd>
    </div>
  );
}

export function FormsManager({ tab }: { tab: FormsTab }) {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState<AnyRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const apiType = API_TYPE[tab];

  // NOTE: no synchronous setState here — initial state is already `loading`,
  // and re-loads after mutations swap data in place.
  const load = useCallback(() => {
    return fetch(`/api/admin/forms?type=${apiType}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data.rows) ? data.rows : []);
        if (Array.isArray(data.statuses)) setStatuses(data.statuses);
      })
      .catch(() => setToast("Could not load submissions."))
      .finally(() => setLoading(false));
  }, [apiType]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const updateStatus = async (row: AnyRow, status: string) => {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/forms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: apiType, id: row.id, status }),
      });
      const data = await res.json();
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
        if (detail?.id === row.id) setDetail({ ...detail, status });
        setToast("Status updated.");
      } else {
        setToast(data.error || "Update failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: AnyRow) => {
    if (!window.confirm("Delete this submission permanently?")) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/forms?type=${apiType}&id=${row.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setDetail((d) => (d?.id === row.id ? null : d));
        setToast("Submission deleted.");
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || "Delete failed.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const csv = toCsv(rows as unknown as Record<string, unknown>[]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab}-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (tab === "grade-6" && (row as AdmissionRow).programme !== "grade-6") return false;
      if (tab === "alevel" && (row as AdmissionRow).programme !== "advanced-level") return false;
      if (!q) return true;
      const haystack = [
        (row as AdmissionRow).studentName ?? (row as { name?: string }).name ?? "",
        (row as { email?: string }).email ?? "",
        (row as { phone?: string }).phone ?? "",
        (row as AppointmentRow).department ?? "",
        (row as InquiryRow).inquiryType ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, statusFilter, tab]);

  const displayName = (row: AnyRow) =>
    (row as AdmissionRow).studentName ?? (row as { name?: string }).name ?? "—";

  const displaySub = (row: AnyRow) => {
    if (apiType === "admissions") {
      const r = row as AdmissionRow;
      return r.stream ? `${r.stream} · ${r.medium}` : `Grade ${r.currentGrade ?? "—"} · ${r.medium}`;
    }
    if (apiType === "appointments") {
      const r = row as AppointmentRow;
      return `${r.department} · ${r.visitDate} ${r.visitTime}`;
    }
    const r = row as InquiryRow;
    return `${r.inquiryType}${r.grade ? ` · Grade ${r.grade}` : ""}`;
  };

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
            placeholder="Search name, email, phone…"
            className={`${input} pl-10`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${input} sm:w-44`}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-40"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-white/50">
          <Loader2 size={18} className="animate-spin" /> Loading submissions…
        </div>
      ) : !filtered.length ? (
        <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-white/40">
          {rows.length ? "No submissions match the filters." : "No submissions yet."}
        </div>
      ) : (
        <div className="hscroll max-h-[64vh] space-y-2.5 overflow-y-auto pr-2.5">
          {filtered.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  onClick={() => setDetail(row)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`Open submission from ${displayName(row)}`}
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="truncate text-sm font-semibold text-white">
                      {displayName(row)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        STATUS_STYLES[row.status] || "bg-white/10 text-white/70"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/45">{displaySub(row)}</p>
                  <p className="mt-0.5 text-[11px] text-white/30">{formatDate(row.createdAt)}</p>
                </button>

                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={row.status}
                    onChange={(e) => updateStatus(row, e.target.value)}
                    disabled={busyId === row.id}
                    className="rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11px] text-white/80 outline-none focus:border-[#ffd444]"
                    aria-label="Change status"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(row)}
                    disabled={busyId === row.id}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300"
                    aria-label="Delete submission"
                  >
                    {busyId === row.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      {detail && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/12 bg-[#101010] p-6 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-white">
                  {displayName(detail)}
                </h3>
                <p className="mt-0.5 text-xs text-white/40">
                  {displaySub(detail)} · {formatDate(detail.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/60 hover:text-white"
                aria-label="Close details"
              >
                <X size={15} />
              </button>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {apiType === "admissions" && (() => {
                const r = detail as AdmissionRow;
                return (
                  <>
                    <Field label="Programme" value={r.programme === "grade-6" ? "Grade 6 Intake" : "Advanced Level"} />
                    <Field label="Status" value={r.status} />
                    <Field label="Date of birth" value={r.dob} />
                    <Field label="Gender" value={r.gender} />
                    <Field label="Guardian" value={`${r.guardianName} (${r.relationship})`} />
                    <Field label="Medium" value={r.medium} />
                    <Field
                      label="Phone"
                      value={
                        <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 text-[#ffd444] hover:underline">
                          <Phone size={12} /> {r.phone}
                        </a>
                      }
                    />
                    <Field
                      label="Email"
                      value={
                        <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-[#ffd444] hover:underline">
                          <Mail size={12} /> {r.email}
                        </a>
                      }
                    />
                    <Field label="Address" value={r.address} />
                    <Field label="Current school" value={r.currentSchool} />
                    <Field label="Current grade" value={r.currentGrade} />
                    <Field label="Stream" value={r.stream} />
                    <Field label="O/L year" value={r.olYear} />
                    <Field label="O/L index" value={r.olIndex} />
                    <Field label="O/L results" value={r.olResults} />
                    <Field label="Sibling at college" value={r.siblingName} />
                    <Field
                      label="Father Old Thomian"
                      value={r.fatherOldThomian === "yes" ? `Yes${r.fatherYears ? ` · ${r.fatherYears} yrs` : ""}` : r.fatherOldThomian === "no" ? "No" : r.fatherOldThomian}
                    />
                    <Field label="House preference" value={r.housePreference} />
                    <Field label="Message" value={r.message} />
                  </>
                );
              })()}
              {apiType === "appointments" && (() => {
                const r = detail as AppointmentRow;
                return (
                  <>
                    <Field label="Department" value={r.department} />
                    <Field label="Status" value={r.status} />
                    <Field
                      label="Visit"
                      value={
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={12} /> {r.visitDate} at {r.visitTime}
                        </span>
                      }
                    />
                    <Field label="Visitors" value={`${r.visitors} person(s)`} />
                    <Field
                      label="Phone"
                      value={
                        <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 text-[#ffd444] hover:underline">
                          <Phone size={12} /> {r.phone}
                        </a>
                      }
                    />
                    <Field
                      label="Email"
                      value={
                        <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-[#ffd444] hover:underline">
                          <Mail size={12} /> {r.email}
                        </a>
                      }
                    />
                    <Field label="Purpose" value={r.purpose} />
                    <Field label="Notes" value={r.notes} />
                  </>
                );
              })()}
              {apiType === "inquiries" && (() => {
                const r = detail as InquiryRow;
                return (
                  <>
                    <Field label="Inquiry type" value={r.inquiryType} />
                    <Field label="Status" value={r.status} />
                    <Field label="Grade (if admission)" value={r.grade} />
                    <Field
                      label="Phone"
                      value={
                        <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 text-[#ffd444] hover:underline">
                          <Phone size={12} /> {r.phone}
                        </a>
                      }
                    />
                    <Field
                      label="Email"
                      value={
                        <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-[#ffd444] hover:underline">
                          <Mail size={12} /> {r.email}
                        </a>
                      }
                    />
                    <Field label="Message" value={r.message} />
                  </>
                );
              })()}
            </dl>

            {/* Quick actions */}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
              {statuses
                .filter((s) => s !== detail.status)
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(detail, s)}
                    disabled={busyId === detail.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3.5 py-1.5 text-[11px] font-medium text-white/65 transition-colors hover:border-[#ffd444] hover:text-white disabled:opacity-40"
                  >
                    {busyId === detail.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Check size={11} />
                    )}
                    Mark {s}
                  </button>
                ))}
              <a
                href={`mailto:${(detail as { email?: string }).email ?? ""}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3.5 py-1.5 text-[11px] font-medium text-white/65 transition-colors hover:border-[#ffd444] hover:text-white"
              >
                <Mail size={11} /> Reply by email
              </a>
              <a
                href={`tel:${(detail as { phone?: string }).phone ?? ""}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3.5 py-1.5 text-[11px] font-medium text-white/65 transition-colors hover:border-[#ffd444] hover:text-white"
              >
                <Phone size={11} /> Call
              </a>
              <button
                onClick={() => remove(detail)}
                disabled={busyId === detail.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-400/25 px-3.5 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-400/10 disabled:opacity-40"
              >
                <Trash2 size={11} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#181818] px-5 py-2.5 text-xs text-white shadow-lift">
          <User size={12} className="text-[#ffd444]" /> {toast}
        </div>
      )}
    </div>
  );
}
