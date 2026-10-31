"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { FormExtraFieldsEditor } from "@/components/admin/form-extra-fields-editor";

export type FormsTab = "grade-6" | "alevel" | "contacts" | "appointments" | "customize";

/* v2.8.88.0 — the latest VISITOR-facing send attempt for a submission
   (from email_log; office heads-ups excluded). The owner: "email send
   unoth 'email send successfully' kiyala wage badge ekak dammoth hodai
   ne. failed unoth ekata failed badge ekak."
   v2.8.88.1 — RENAMED from `email` to `emailStatus`: the API used to
   overwrite the row's own `email` column (the visitor's address) with
   this object, so opening any submission crashed — "Objects are not
   valid as a React child (found: object with keys {status, kind,
   error, createdAt})". The visitor's email is a string again. */
type EmailStatus = {
  status: string;
  kind: string;
  error: string | null;
  createdAt: string;
};

type BaseRow = {
  id: number;
  status: string;
  createdAt: string;
  email?: string;
  emailStatus?: EmailStatus | null;
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
  /* v2.8.85.0 — admin-added fixed-form extra fields (field id → value). */
  extraData: Record<string, string>;
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
  /* v2.8.85.0 — admin-added fixed-form extra fields (field id → value). */
  extraData: Record<string, string>;
};

type AnyRow = AdmissionRow | AppointmentRow | InquiryRow;

/* v2.8.91.0 — the appointment form's office-side rules (Admin → Forms →
   Appointments → Form settings). Mirrors src/lib/appointment-settings.ts
   (the lib itself is server-only; the client keeps its own shape).
   v2.8.92.0 — per-card overrides join the payload: each of the four
   appointment cards carries its own visiting times and contact details
   (the owner: "appoinment card 4 wena wenama edit karanna option ekak
   danna wei nne"). Empty text keeps the built-in value; an empty time
   list follows the default visiting times. */
type AptCardSettings = {
  name: string;
  phone: string;
  email: string;
  hours: string;
  detail: string;
  timeSlots: string[];
};

type AptCatalogEntry = {
  id: string;
  name: string;
  phone: string;
  email: string;
  hours: string;
  detail: string;
};

type AptSettings = {
  timeSlots: string[];
  maxPerDay: number;
  maxVisitors: number;
  allowWeekends: boolean;
  minDaysAhead: number;
  departments: Record<string, AptCardSettings>;
};

const EMPTY_CARD: AptCardSettings = {
  name: "",
  phone: "",
  email: "",
  hours: "",
  detail: "",
  timeSlots: [],
};

const API_TYPE: Record<FormsTab, string> = {
  "grade-6": "admissions",
  alevel: "admissions",
  contacts: "inquiries",
  appointments: "appointments",
  /* v2.8.85.0 — the customize tab renders the extra-fields editor and never
     hits the unified inbox API (it early-returns below). */
  customize: "none",
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

/* v2.8.88.0 — the per-row email badge (green sent / red failed / gray when
   a confirmed-cancelled appointment has no record at all). Front-desk
   roles see it without needing the Email Alerts screen. */
function EmailBadge({ status, row }: { status?: EmailStatus | null; row: BaseRow }) {
  if (status) {
    if (status.status === "sent") {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300"
          title={`Email sent ${status.createdAt ? new Date(status.createdAt).toLocaleString("en-GB") : ""}`}
        >
          <CheckCircle2 size={11} /> Email sent
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-400/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300"
        title={status.error || "The email failed to send — please call the visitor instead."}
      >
        <XCircle size={11} /> Email failed
      </span>
    );
  }
  if (row.status === "confirmed" || row.status === "cancelled") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/40"
        title="No email record for this appointment — it predates email logging, or the mail provider is not configured. If the visitor says nothing arrived, please call them."
      >
        No email
      </span>
    );
  }
  return null;
}

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

/* ── v2.8.81.0 — appointments calendar helpers ─────────────────────── */

/** Local calendar day as "YYYY-MM-DD" (the office machine's clock). */
function localDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

/** Monday-based week start. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** visitDate is a varchar — accept "YYYY-MM-DD…" first, then any parse. */
function parseVisitDayKey(value: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value.trim());
  if (iso) return iso[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : localDayKey(parsed);
}

/** "8.00 a.m." / "8:00 AM" → minutes since midnight (Infinity if unparsed). */
function visitTimeMinutes(value: string): number {
  const match = /\s*(\d{1,2})[.:](\d{2})\s*(a\.?m\.?|p\.?m\.?)/i.exec(value);
  if (!match) return Number.POSITIVE_INFINITY;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (/p/i.test(match[3]) && hours < 12) hours += 12;
  if (/a/i.test(match[3]) && hours === 12) hours = 0;
  return hours * 60 + minutes;
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

export function FormsManager({
  tab,
  extraTypeOptions,
}: {
  tab: FormsTab;
  /* v2.8.85.0 — customize tab only: the fixed-form-safe question types. */
  extraTypeOptions?: { value: string; label: string }[];
}) {
  /* v2.8.85.0 — "customize" replaces the inbox with the fixed-form extra
     fields editor. This dispatcher is HOOK-FREE: the inbox's hooks live in
     FormsInboxManager below, so no mounted instance can ever reorder them
     (the page keys FormsManager by tab as well). */
  if (tab === "customize") {
    return extraTypeOptions ? (
      <FormExtraFieldsEditor typeOptions={extraTypeOptions} />
    ) : (
      <div className="rounded-2xl border border-dashed border-white/12 py-16 text-center text-sm text-white/40">
        The field type list failed to load — reload the page.
      </div>
    );
  }
  return <FormsInboxManager tab={tab} />;
}

/** v2.8.85.0 — the four inbox tabs (everything except "customize"). */
function FormsInboxManager({ tab }: { tab: Exclude<FormsTab, "customize"> }) {
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  /* v2.8.84.0 — toolbar REFRESH (owner item 3): the icon spins while the
     list re-fetches, on every Forms tab (appointments, contacts, Grade 6,
     A/L). */
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detail, setDetail] = useState<AnyRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /* v2.8.81.0 — appointments calendar grid (List | Calendar toggle). */
  const [view, setView] = useState<"list" | "calendar">("list");
  /* Render-stable "today" (purity rule: Date confined to lazy initializers). */
  const [todayKey] = useState(() => localDayKey(new Date()));
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  /* v2.8.90.0 — direction-aware slide for the week grid (same cal-* taste
     as the events calendar, kept light). */
  const [weekDir, setWeekDir] = useState<"next" | "prev">("next");
  const shiftWeek = (delta: number) => {
    setWeekDir(delta < 0 ? "prev" : "next");
    setWeekStart((w) => addDays(w, delta));
  };
  /* v2.8.91.0 — the appointment FORM SETTINGS dialog (appointments tab). */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aptSettings, setAptSettings] = useState<AptSettings | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  /* v2.8.92.0 — the built-in cards + which card's editor is open. */
  const [aptCatalog, setAptCatalog] = useState<AptCatalogEntry[]>([]);
  const [openCard, setOpenCard] = useState<string | null>(null);

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

  /* v2.8.85.0 — labels for the fixed-form extra fields, so a submission's
     extraData rows render as "Preferred interview day" instead of "x1-ab". */
  const [extraLabels, setExtraLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/admin/forms/extra-fields", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, string> = {};
        for (const f of [...(data.contact ?? []), ...(data.admission ?? [])]) {
          if (f && typeof f.id === "string" && typeof f.label === "string") map[f.id] = f.label;
        }
        setExtraLabels(map);
      })
      .catch(() => undefined);
  }, []);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  /* v2.8.91.0 — load the live appointment rules when the dialog opens.
     v2.8.92.0 — the four built-in cards come along so the per-card
     editors can prefill from the catalog even before any override. */
  const openSettings = () => {
    setSettingsOpen(true);
    setAptSettings(null);
    setOpenCard(null);
    fetch("/api/admin/appointment-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => {
        const s = data.settings as AptSettings;
        setAptSettings({ ...s, departments: s.departments ?? {} });
        setAptCatalog(Array.isArray(data.catalog) ? data.catalog : []);
      })
      .catch(() => {
        setSettingsOpen(false);
        setToast("Could not load the appointment settings.");
      });
  };

  /* v2.8.92.0 — per-card editor accessors. */
  const cardOverride = (id: string): AptCardSettings =>
    aptSettings?.departments[id] ?? EMPTY_CARD;

  const setCardField = (id: string, patch: Partial<AptCardSettings>) => {
    setAptSettings((s) =>
      s
        ? {
            ...s,
            departments: {
              ...s.departments,
              [id]: { ...EMPTY_CARD, ...(s.departments[id] ?? {}), ...patch },
            },
          }
        : s,
    );
  };

  /* v2.8.92.0 — the slot-rows editor is SHARED by the default list and
     each card's own list (same rows, same remove, same aria pattern). */
  const slotRows = (slots: string[], set: (next: string[]) => void, ariaPrefix: string) => (
    <div className="mt-2.5 space-y-2">
      {slots.map((slot, i) => (
        <div key={`${ariaPrefix}-${i}`} className="flex items-center gap-2">
          <input
            value={slot}
            onChange={(e) => set(slots.map((v, j) => (j === i ? e.target.value : v)))}
            maxLength={24}
            className="h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#ffd444]/60"
            aria-label={`${ariaPrefix} time slot ${i + 1}`}
          />
          <button
            onClick={() => set(slots.length > 1 ? slots.filter((_, j) => j !== i) : slots)}
            disabled={slots.length <= 1}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300 disabled:opacity-30"
            aria-label={`Remove ${ariaPrefix.toLowerCase()} time slot ${slot}`}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );

  const saveSettings = async () => {
    if (!aptSettings || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const res = await fetch("/api/admin/appointment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: aptSettings }),
      });
      const data = await res.json();
      if (res.ok) {
        setAptSettings(data.settings as AptSettings);
        setToast("Appointment form settings published.");
        setSettingsOpen(false);
      } else {
        setToast(data.error || "Save failed.");
      }
    } catch {
      setToast("Save failed.");
    } finally {
      setSettingsBusy(false);
    }
  };

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
        /* v2.8.88.0 — the status email now rides after()/waitUntil, so the
           send lands a second or two after this response: re-check once,
           quietly, and the row's badge refreshes itself. */
        if (
          apiType === "appointments" &&
          (status === "confirmed" || status === "cancelled")
        ) {
          window.setTimeout(() => {
            void load();
          }, 5000);
        }
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
    /* v2.8.88.1 — emailStatus is an object; flatten it out so the CSV
       keeps only the visitor-facing columns (its email string included). */
    const flat = rows.map(({ emailStatus: _status, ...rest }) => rest);
    const csv = toCsv(flat as unknown as Record<string, unknown>[]);
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

  /* ── v2.8.81.0 — calendar grouping (appointments tab only) ─────────── */
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const calendar = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    const unparsed: AppointmentRow[] = [];
    for (const row of filtered) {
      if (tab !== "appointments") continue;
      const key = parseVisitDayKey((row as AppointmentRow).visitDate);
      if (!key) {
        unparsed.push(row as AppointmentRow);
        continue;
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row as AppointmentRow);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          visitTimeMinutes(a.visitTime) - visitTimeMinutes(b.visitTime) ||
          a.id - b.id,
      );
    }
    return { map, unparsed };
  }, [filtered, tab]);

  const weekLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
    const end = weekDays[6];
    const startLabel = fmt.format(weekDays[0]);
    const endLabel = `${fmt.format(end)} ${end.getFullYear()}`;
    return `${startLabel} – ${endLabel}`;
  }, [weekDays]);

  const weekCount = useMemo(
    () => weekDays.reduce((sum, d) => sum + (calendar.map.get(localDayKey(d))?.length ?? 0), 0),
    [weekDays, calendar],
  );

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
        {/* v2.8.84.0 — the owner's refresh icon (item 3), all four tabs. */}
        <button
          onClick={refresh}
          disabled={refreshing}
          aria-label="Refresh the list"
          title="Refresh"
          data-testid="forms-refresh"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444] disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
        {/* v2.8.91.0 — the office's appointment form rules (appointments only). */}
        {tab === "appointments" && (
          <button
            onClick={openSettings}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
          >
            <SlidersHorizontal size={13} />
            Form settings
          </button>
        )}
        {/* v2.8.81.0 — List | Calendar toggle (appointments only). */}
        {tab === "appointments" && (
          <div className="flex rounded-xl border border-white/12 p-1">
            <button
              onClick={() => setView("list")}
              className={`rounded-lg px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
                view === "list"
                  ? "bg-[#ffd444] text-[#0b0b0a]"
                  : "text-white/55 hover:text-white"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`rounded-lg px-3.5 py-1.5 text-[11px] font-medium transition-colors ${
                view === "calendar"
                  ? "bg-[#ffd444] text-[#0b0b0a]"
                  : "text-white/55 hover:text-white"
              }`}
            >
              Calendar
            </button>
          </div>
        )}
      </div>

      {/* ── v2.8.81.0 — CALENDAR VIEW (appointments) ─────────────────── */}
      {tab === "appointments" && view === "calendar" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => shiftWeek(-7)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/60 transition-colors hover:border-white/35 hover:text-white"
                aria-label="Previous week"
              >
                ‹
              </button>
              <button
                onClick={() => {
                  const target = startOfWeek(new Date());
                  setWeekDir(target.getTime() < weekStart.getTime() ? "prev" : "next");
                  setWeekStart(target);
                }}
                className="rounded-lg border border-white/12 px-3 py-1.5 text-[11px] text-white/70 transition-colors hover:border-white/35 hover:text-white"
              >
                Today
              </button>
              <button
                onClick={() => shiftWeek(7)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/60 transition-colors hover:border-white/35 hover:text-white"
                aria-label="Next week"
              >
                ›
              </button>
            </div>
            <p className="text-[11px] text-white/50">
              <span className="text-white/85">{weekLabel}</span> · {weekCount} appointment
              {weekCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="hscroll mt-3 overflow-x-auto pb-1">
            <div
              key={weekStart.getTime()}
              className={`grid min-w-[820px] grid-cols-7 gap-1.5 ${
                weekDir === "prev" ? "cal-grid-prev" : "cal-grid-next"
              }`}
            >
              {weekDays.map((day) => {
                const key = localDayKey(day);
                const items = calendar.map.get(key) ?? [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    className={`min-h-[150px] rounded-xl border p-1.5 ${
                      isToday
                        ? "border-[#ffd444]/50 bg-[#ffd444]/[0.04]"
                        : "border-white/[0.08] bg-white/[0.02]"
                    }`}
                  >
                    <p
                      className={`text-center text-[9.5px] font-semibold uppercase tracking-[0.12em] ${
                        isToday ? "text-[#ffd444]" : "text-white/40"
                      }`}
                    >
                      {new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(day)}{" "}
                      {day.getDate()}
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {items.map((row) => (
                        <button
                          key={row.id}
                          onClick={() => setDetail(row)}
                          className={`w-full rounded-lg border border-white/10 px-1.5 py-1 text-left transition-colors hover:border-white/35 ${
                            STATUS_STYLES[row.status] || "bg-white/10 text-white/70"
                          }`}
                          title={`${row.visitTime} · ${row.name} · ${row.department} (${row.status})`}
                        >
                          <span className="block truncate text-[9px] font-semibold uppercase tracking-wide">
                            {row.visitTime}
                          </span>
                          <span className="block truncate text-[10px] font-medium">{row.name}</span>
                        </button>
                      ))}
                      {items.length === 0 && (
                        <p className="pt-3 text-center text-[9px] text-white/20">—</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {calendar.unparsed.length > 0 && (
            <p className="mt-2 text-[10.5px] text-amber-300/80">
              {calendar.unparsed.length} appointment(s) have an unreadable visit date — the List
              view still shows them.
            </p>
          )}
        </div>
      )}

      {/* List */}
      {(tab !== "appointments" || view === "list") && (loading ? (
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
                    <EmailBadge status={row.emailStatus} row={row} />
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
      ))}

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
              {/* v2.8.85.0 — the admin-added extra questions, labelled from the
                  current extra-fields settings (unknown ids fall back to raw). */}
              {Object.entries((detail as { extraData?: Record<string, string> }).extraData ?? {}).map(
                ([id, value]) => <Field key={id} label={extraLabels[id] ?? id} value={value} />,
              )}
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

      {/* v2.8.91.0 — Appointment FORM SETTINGS dialog (appointments tab).
          The office's own rules: time slots, per-day cap, party size,
          weekend policy and the booking window — published instantly. */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6">
          <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/12 bg-[#101010] p-6 sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-white">
                  Appointment form settings
                </h3>
                <p className="mt-0.5 text-xs text-white/40">
                  The public form follows these rules the moment you save.
                </p>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/60 hover:text-white"
                aria-label="Close form settings"
              >
                <X size={15} />
              </button>
            </div>

            {!aptSettings ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-white/45">
                <Loader2 size={15} className="animate-spin" /> Loading the current rules…
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {/* Time slots */}
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                    Default visiting time slots
                  </p>
                  {slotRows(
                    aptSettings.timeSlots,
                    (next) => setAptSettings((s) => (s ? { ...s, timeSlots: next } : s)),
                    "Default",
                  )}
                  <button
                    onClick={() =>
                      setAptSettings((s) =>
                        s ? { ...s, timeSlots: [...s.timeSlots, ""] } : s,
                      )
                    }
                    disabled={aptSettings.timeSlots.length >= 16}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3.5 py-2 text-[11.5px] font-medium text-white/65 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444] disabled:opacity-40"
                  >
                    <Plus size={12} /> Add slot
                  </button>
                  <p className="mt-2 text-[11px] text-white/35">
                    e.g. “8.00 a.m.” — every card follows these until you give it its own list below. Empty rows are dropped on save.
                  </p>
                </div>

                {/* Numbers + weekend policy */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                      Bookings per day
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={aptSettings.maxPerDay}
                      onChange={(e) =>
                        setAptSettings((s) =>
                          s ? { ...s, maxPerDay: Number(e.target.value) } : s,
                        )
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition-colors focus:border-[#ffd444]/60"
                    />
                    <span className="mt-1.5 block text-[11px] text-white/35">
                      0 = no limit · cancelled bookings free their slot
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                      Visitors per booking
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={aptSettings.maxVisitors}
                      onChange={(e) =>
                        setAptSettings((s) =>
                          s ? { ...s, maxVisitors: Number(e.target.value) } : s,
                        )
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition-colors focus:border-[#ffd444]/60"
                    />
                    <span className="mt-1.5 block text-[11px] text-white/35">
                      The form offers 1 up to this many
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                      Book from (days ahead)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={aptSettings.minDaysAhead}
                      onChange={(e) =>
                        setAptSettings((s) =>
                          s ? { ...s, minDaysAhead: Number(e.target.value) } : s,
                        )
                      }
                      className="mt-2 h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition-colors focus:border-[#ffd444]/60"
                    />
                    <span className="mt-1.5 block text-[11px] text-white/35">
                      1 = from tomorrow onwards
                    </span>
                  </label>
                  <div className="flex items-end pb-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={aptSettings.allowWeekends}
                      onClick={() =>
                        setAptSettings((s) =>
                          s ? { ...s, allowWeekends: !s.allowWeekends } : s,
                        )
                      }
                      className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors ${
                        aptSettings.allowWeekends
                          ? "border-[#ffd444]/60 text-white"
                          : "border-white/12 text-white/60 hover:text-white"
                      }`}
                    >
                      <span
                        className={`grid h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
                          aptSettings.allowWeekends ? "bg-[#ffd444]" : "bg-white/15"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-[#101010] transition-transform ${
                            aptSettings.allowWeekends ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </span>
                      Allow weekend bookings
                    </button>
                  </div>
                </div>

                {/* v2.8.92.0 — THE 4 APPOINTMENT CARDS, edited one by one
                    (the owner: "appoinment card 4 wena wenama edit karanna
                    option ekak danna wei nne"). Each card can carry its own
                    visiting times and details; empty fields keep the
                    built-in values. */}
                <div className="border-t border-white/10 pt-5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                    The 4 appointment cards
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                    Edit each card on its own — visiting times, name, phone,
                    email, office hours, description. A card with no own
                    times follows the default times above.
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {aptCatalog.map((entry) => {
                      const card = cardOverride(entry.id);
                      const ownTimes = card.timeSlots.filter((t) => t.trim()).length;
                      const isOpen = openCard === entry.id;
                      return (
                        <div key={entry.id} className="overflow-hidden rounded-2xl border border-white/10">
                          <button
                            onClick={() => setOpenCard(isOpen ? null : entry.id)}
                            aria-expanded={isOpen}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-white">
                                {card.name.trim() || entry.name}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-white/40">
                                {ownTimes
                                  ? `${ownTimes} own visiting time${ownTimes === 1 ? "" : "s"}`
                                  : "Follows the default visiting times"}
                              </span>
                            </span>
                            <span
                              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                                isOpen
                                  ? "border-[#ffd444]/60 text-[#ffd444]"
                                  : "border-white/15 text-white/55"
                              }`}
                            >
                              {isOpen ? "Close" : "Edit"}
                              <ChevronDown
                                size={12}
                                className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                              />
                            </span>
                          </button>
                          {isOpen && (
                            <div className="space-y-4 border-t border-white/10 p-4">
                              <div>
                                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                                  Own visiting times
                                </p>
                                {slotRows(
                                  card.timeSlots,
                                  (next) => setCardField(entry.id, { timeSlots: next }),
                                  entry.name,
                                )}
                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                  <button
                                    onClick={() =>
                                      setCardField(entry.id, {
                                        timeSlots: [...card.timeSlots, ""],
                                      })
                                    }
                                    disabled={card.timeSlots.length >= 16}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3.5 py-2 text-[11.5px] font-medium text-white/65 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444] disabled:opacity-40"
                                  >
                                    <Plus size={12} /> Add slot
                                  </button>
                                  <button
                                    onClick={() =>
                                      setCardField(entry.id, {
                                        timeSlots: [...aptSettings.timeSlots],
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3.5 py-2 text-[11.5px] font-medium text-white/65 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
                                  >
                                    <Copy size={12} /> Copy the default times
                                  </button>
                                </div>
                                <p className="mt-2 text-[11px] text-white/30">
                                  Leave the list empty and this card follows the default visiting times.
                                </p>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {(
                                  [
                                    ["name", "Card name", entry.name],
                                    ["phone", "Phone", entry.phone],
                                    ["email", "Email", entry.email],
                                    ["hours", "Office hours", entry.hours],
                                  ] as const
                                ).map(([field, label, builtin]) => (
                                  <label key={field} className="block">
                                    <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                                      {label}
                                    </span>
                                    <input
                                      value={card[field]}
                                      onChange={(e) =>
                                        setCardField(entry.id, {
                                          [field]: e.target.value,
                                        } as Partial<AptCardSettings>)
                                      }
                                      maxLength={field === "name" ? 80 : 120}
                                      placeholder={builtin}
                                      className="mt-1.5 h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#ffd444]/60"
                                      aria-label={`${entry.name} ${label.toLowerCase()}`}
                                    />
                                  </label>
                                ))}
                                <label className="block sm:col-span-2">
                                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/35">
                                    Description
                                  </span>
                                  <textarea
                                    rows={2}
                                    value={card.detail}
                                    onChange={(e) =>
                                      setCardField(entry.id, { detail: e.target.value })
                                    }
                                    maxLength={400}
                                    placeholder={entry.detail}
                                    className="mt-1.5 w-full resize-none rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#ffd444]/60"
                                    aria-label={`${entry.name} description`}
                                  />
                                </label>
                              </div>
                              <p className="text-[11px] text-white/30">
                                Leave a field empty to keep the built-in value.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-5">
                  <button
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-full border border-white/12 px-5 py-2.5 text-xs font-medium text-white/65 transition-colors hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSettings}
                    disabled={settingsBusy}
                    className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-2.5 text-xs font-semibold text-[#0b0b0a] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {settingsBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Save &amp; publish
                  </button>
                </div>
              </div>
            )}
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
