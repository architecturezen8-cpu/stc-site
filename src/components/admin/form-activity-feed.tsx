"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import type { FormActivityItem, FormActivityKind, FormActivityResponse } from "@/lib/form-activity";

/* ── v2.8.84.0 — FORM ACTIVITY FEED (owner item 6) ────────────────────────
   "main admin studio eke notification section ekatath appoinment, contact
   massage, grade 6 application, A/L admintion ekak wage dammama danne na ne
   aluthin ekak dalada kiyala" — the School Notifications page now ALSO
   shows every public form submission the moment it lands: kind chip, the
   reference, who/what, the office status, and a gold NEW dot while the row
   still sits on its initial status. Auto-polls every 60 s while the page
   is open, and the refresh icon re-fetches on demand (same pattern as the
   Forms tabs). Each row links into its Form Management tab. */

const KIND_META: Record<
  FormActivityKind,
  { label: string; chip: string; icon: typeof Mail; tab: string }
> = {
  "grade-6": {
    label: "Grade 6",
    chip: "bg-sky-400/10 text-sky-300",
    icon: GraduationCap,
    tab: "grade-6",
  },
  alevel: {
    label: "A/L",
    chip: "bg-violet-400/10 text-violet-300",
    icon: GraduationCap,
    tab: "alevel",
  },
  appointment: {
    label: "Appointment",
    chip: "bg-emerald-400/10 text-emerald-300",
    icon: CalendarDays,
    tab: "appointments",
  },
  contact: {
    label: "Contact",
    chip: "bg-amber-400/10 text-amber-300",
    icon: Mail,
    tab: "contacts",
  },
};

const STATUS_CHIP: Record<string, string> = {
  received: "bg-white/10 text-white/70",
  requested: "bg-white/10 text-white/70",
  unread: "bg-[#ffd444]/15 text-[#ffd444]",
  reviewing: "bg-sky-400/10 text-sky-300",
  read: "bg-sky-400/10 text-sky-300",
  confirmed: "bg-emerald-400/10 text-emerald-300",
  replied: "bg-emerald-400/10 text-emerald-300",
  approved: "bg-emerald-400/15 text-emerald-300",
  shortlisted: "bg-violet-400/10 text-violet-300",
  waitlisted: "bg-amber-400/10 text-amber-300",
  rejected: "bg-red-400/10 text-red-300",
  cancelled: "bg-red-400/10 text-red-300",
  completed: "bg-white/10 text-white/60",
  archived: "bg-white/5 text-white/40",
};

function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function FormActivityFeed() {
  const [items, setItems] = useState<FormActivityItem[]>([]);
  const [awaiting, setAwaiting] = useState<FormActivityResponse["awaiting"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* The pure loader: state moves ONLY inside the async callbacks, so the
     mount effect never sets state synchronously (react-hooks rule). */
  const load = useCallback(() => {
    return fetch("/api/admin/forms/activity", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: FormActivityResponse) => {
        setItems(Array.isArray(data.items) ? data.items : []);
        setAwaiting(data.awaiting ?? null);
      })
      .catch(() => {
        /* keep the previous list on a transient failure */
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  /* Manual refresh — a user event, so the spinner flip lives here. */
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    load();
  };

  useEffect(() => {
    load();
    /* The owner leaves this page open — a quiet 60 s poll tells them a new
       submission arrived without any manual reload. */
    const timer = window.setInterval(() => load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const totalAwaiting = awaiting
    ? awaiting.admissions + awaiting.appointments + awaiting.contacts
    : null;

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
      data-testid="form-activity-feed"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#ffd444]/15 text-[#ffd444]">
            <Inbox size={17} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-white">Form activity</h2>
            <p className="text-[11.5px] text-white/45">
              Appointments · contact messages · Grade 6 &amp; A/L applications
              {totalAwaiting !== null && totalAwaiting > 0
                ? ` — ${totalAwaiting} awaiting action`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/forms/appointments"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3.5 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
          >
            <ClipboardList size={13} />
            Form Management
          </Link>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || loading}
            aria-label="Refresh form activity"
            title="Refresh"
            data-testid="form-activity-refresh"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-3.5 py-2 text-[11px] font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444] disabled:opacity-40"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Awaiting strip */}
      {awaiting && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ["Admissions", awaiting.admissions],
              ["Appointments", awaiting.appointments],
              ["Contacts", awaiting.contacts],
            ] as const
          ).map(([label, n]) => (
            <div
              key={label}
              className={`rounded-xl border px-3 py-2.5 ${
                n > 0 ? "border-[#ffd444]/35 bg-[#ffd444]/[0.06]" : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/40">
                {label}
              </p>
              <p
                className={`mt-0.5 text-lg font-semibold ${n > 0 ? "text-[#ffd444]" : "text-white/55"}`}
              >
                {n}
                <span className="ml-1 text-[10px] font-normal text-white/40">awaiting</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2.5 py-8 text-white/50">
          <Loader2 size={16} className="animate-spin" />
          Loading form activity…
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2.5 py-8 text-white/45">
          <ScrollText size={16} className="text-white/30" />
          No submissions yet — new appointments, messages and applications will appear here.
        </div>
      ) : (
        <ul className="mt-4 max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {items.map((item) => {
            const meta = KIND_META[item.kind];
            const Icon = meta.icon;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={`/admin/forms/${meta.tab}`}
                  className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white/60 group-hover:text-white">
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${meta.chip}`}
                      >
                        {meta.label}
                      </span>
                      <span className="font-mono text-[11px] text-white/45">{item.reference}</span>
                      {item.fresh && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ffd444]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#ffd444]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#ffd444]" />
                          New
                        </span>
                      )}
                      <span className="ml-auto shrink-0 text-[10.5px] text-white/35">
                        {ago(item.createdAt)}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-[13px] font-medium text-white/85">
                      {item.name}
                      <span className="font-normal text-white/45"> — {item.detail}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] ${
                          STATUS_CHIP[item.status] || "bg-white/10 text-white/70"
                        }`}
                      >
                        {item.status}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
