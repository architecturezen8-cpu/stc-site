"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ManageFiltersLink } from "@/components/admin/manage-filters-link";
import {
  colomboInputToIso,
  formatScheduleLabel,
  isoToColomboInput,
} from "@/lib/post-visibility";

type EventItem = {
  id: number;
  title: string;
  description: string;
  category: string;
  startsAt: string;
  timeLabel: string;
  location: string;
  isNew: boolean;
  /* v2.8.89.0 — scheduled auto-publish (NULL = live now). */
  scheduledAt: string | null;
};

const CAL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const CAL_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

export function EventsManager() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newCatModal, setNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  /* ── v2.8.89.0 — List | Calendar toggle (the owner: sections with nice
     calendars should show the auto-publish pipeline) ─────────────────── */
  const [view, setView] = useState<"list" | "calendar">("list");
  const [nowMs] = useState(() => Date.now());
  const [calYear, setCalYear] = useState(() => new Date().getUTCFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getUTCMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  /* v2.8.90.0 — the same buttery cal-* month transitions the public
     calendar uses, matched to the admin's restrained motion taste. */
  const [calDir, setCalDir] = useState<"next" | "prev">("next");

  const isScheduledFuture = (value: string | null | undefined) =>
    Boolean(value && new Date(value).getTime() > nowMs);

  /* "Schedule" defaults to tomorrow 8.00 a.m. Sri Lanka time (news pattern). */
  const defaultScheduleIso = () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const datePart = isoToColomboInput(tomorrow.toISOString()).slice(0, 10);
    return colomboInputToIso(`${datePart}T08:00`) ?? "";
  };

  /* Events grouped by their UTC day (startsAt is written date-only → UTC
     midnight, exactly how the cards and the public calendar read it). */
  const byDayKey = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const ev of events) {
      const d = new Date(ev.startsAt);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      map.set(key, [...(map.get(key) ?? []), ev]);
    }
    return map;
  }, [events]);

  const calCells = useMemo(() => {
    const firstDow = (new Date(Date.UTC(calYear, calMonth, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(calYear, calMonth + 1, 0)).getUTCDate();
    const out: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [calYear, calMonth]);

  const stepMonth = (delta: number) => {
    setCalDir(delta < 0 ? "prev" : "next");
    const next = calMonth + delta;
    if (next < 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else if (next > 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth(next);
    }
    setSelectedDay(null);
  };

  const goToday = () => {
    const now = new Date();
    const from = calYear * 12 + calMonth;
    const to = now.getUTCFullYear() * 12 + now.getUTCMonth();
    if (to !== from) setCalDir(to < from ? "prev" : "next");
    setCalYear(now.getUTCFullYear());
    setCalMonth(now.getUTCMonth());
    setSelectedDay(now.getUTCDate());
  };

  const monthEvents = events.filter((ev) => {
    const d = new Date(ev.startsAt);
    return d.getUTCFullYear() === calYear && d.getUTCMonth() === calMonth;
  });
  const selectedEvents = selectedDay
    ? monthEvents.filter((ev) => new Date(ev.startsAt).getUTCDate() === selectedDay)
    : [];

  const loadData = () => {
    Promise.all([
      fetch("/api/admin/events", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/collections", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([evData, collData]) => {
        setEvents(evData.events ?? []);
        if (collData.eventCategories) setCategories(collData.eventCategories);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "event", name: newCatName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCategories((prev) => Array.from(new Set([...prev, data.name])));
        if (editing) setEditing({ ...editing, category: data.name });
        setNewCatName("");
        setNewCatModal(false);
        setToast(`Category "${data.name}" added!`);
      } else {
        setToast(data.error || "Failed to add category");
      }
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New College Event",
        description: "Event details and timetable…",
        category: categories[0] || "Ceremony",
        timeLabel: "8.00 a.m.",
        location: "Robinson Memorial Hall",
        startsAt: new Date().toISOString(),
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setEvents((prev) => [...prev, json.event]);
      setEditing(json.event);
      setToast("Event created — edit it now");
    } else setToast(json.error);
    setBusy(false);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const res = await fetch("/api/admin/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (res.ok) {
      setEvents((prev) => prev.map((item) => (item.id === json.event.id ? json.event : item)));
      setEditing(null);
      setToast("Event saved");
    } else setToast(json.error);
    setBusy(false);
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this event from the calendar?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setEvents((prev) => prev.filter((item) => item.id !== id));
      setEditing(null);
      setToast("Event deleted");
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/45">
          {events.length} events on the calendar
          {events.some((ev) => isScheduledFuture(ev.scheduledAt)) &&
            ` · ${events.filter((ev) => isScheduledFuture(ev.scheduledAt)).length} scheduled to auto-publish`}
        </p>
        <div className="flex items-center gap-2">
          {/* v2.8.89.0 — List | Calendar toggle (appointments pattern). */}
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
          <ManageFiltersLink tab="event" />
          <button
            onClick={add}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
            Schedule Event
          </button>
        </div>
      </div>

      {view === "list" && (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {events.map((ev) => {
          const date = new Date(ev.startsAt);
          return (
            <div
              key={ev.id}
              className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[#ffd444]/50"
            >
              <div className="flex items-start gap-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ffd444] font-display text-xl font-bold text-[#0b0b0a]">
                  {date.getUTCDate()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-sans text-[8px] uppercase tracking-[0.2em] text-[#ffd444]">
                      {ev.category}
                    </span>
                    <span className="text-[10px] text-white/40">
                      {date.toLocaleString("default", { month: "short", year: "numeric" })}
                    </span>
                    {isScheduledFuture(ev.scheduledAt) && (
                      <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-amber-300">
                        Scheduled
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 line-clamp-1 font-display text-base font-semibold text-white">
                    {ev.title}
                  </h3>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-white/50">
                {ev.description}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-[10px] text-white/40">
                <span className="flex items-center gap-1">
                  <Clock size={12} className="text-[#ffd444]" />
                  {ev.timeLabel}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-[#ffd444]" />
                  {ev.location}
                </span>
              </div>

              {isScheduledFuture(ev.scheduledAt) && (
                <p className="mt-2.5 rounded-lg bg-amber-400/[0.07] px-3 py-2 text-[10px] leading-relaxed text-amber-300/85">
                  Auto-publishes {formatScheduleLabel(ev.scheduledAt ?? "")} — hidden from the
                  public site until then.
                </p>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3">
                <button
                  onClick={() => setEditing(ev)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[11px] font-semibold text-[#ffd444] hover:bg-white/5"
                >
                  <Pencil size={12} /> Edit Event
                </button>
                <button
                  onClick={() => remove(ev.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-white/30 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete event"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* ── v2.8.89.0 — CALENDAR VIEW: the month grid shows every event
          INCLUDING scheduled ones, with amber dots + a go-live label, so
          the office sees the auto-publish pipeline at a glance. ─────── */}
      {view === "calendar" && (
        <div className="cal-item rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => stepMonth(-1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/60 transition-colors hover:border-white/35 hover:text-white"
                aria-label="Previous month"
              >
                ‹
              </button>
              <button
                onClick={goToday}
                className="rounded-lg border border-white/12 px-3 py-1.5 text-[11px] text-white/70 transition-colors hover:border-white/35 hover:text-white"
              >
                Today
              </button>
              <button
                onClick={() => stepMonth(1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-white/12 text-white/60 transition-colors hover:border-white/35 hover:text-white"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <p className="text-[11px] text-white/50">
              <span
                key={`cal-title-${calYear}-${calMonth}`}
                className={`inline-block font-semibold text-white/85 ${
                  calDir === "prev" ? "cal-title-prev" : "cal-title-next"
                }`}
              >
                {CAL_MONTHS[calMonth]} {calYear}
              </span>{" "}
              · {monthEvents.length} event{monthEvents.length === 1 ? "" : "s"}
              {monthEvents.some((ev) => isScheduledFuture(ev.scheduledAt))
                ? ` · ${monthEvents.filter((ev) => isScheduledFuture(ev.scheduledAt)).length} scheduled`
                : ""}
            </p>
          </div>

          <div
            key={`cal-grid-${calYear}-${calMonth}`}
            className={`mt-3 grid grid-cols-7 gap-1.5 ${
              calDir === "prev" ? "cal-grid-prev" : "cal-grid-next"
            }`}
          >
            {CAL_DOW.map((d) => (
              <div
                key={d}
                className="pb-1 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35"
              >
                {d}
              </div>
            ))}
            {calCells.map((day, i) => {
              if (day === null) return <div key={`x${i}`} className="aspect-square" />;
              const key = `${calYear}-${calMonth}-${day}`;
              const dayEvents = byDayKey.get(key) ?? [];
              const has = dayEvents.length > 0;
              const isSelected = selectedDay === day;
              const isToday =
                new Date().getUTCFullYear() === calYear &&
                new Date().getUTCMonth() === calMonth &&
                new Date().getUTCDate() === day;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(has ? (isSelected ? null : day) : null)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-[12px] transition-colors ${
                    isSelected
                      ? "border-transparent bg-[#ffd444] font-bold text-[#0b0b0a]"
                      : has
                        ? "border-[#ffd444]/40 bg-[#ffd444]/[0.06] font-semibold text-white hover:border-[#ffd444]"
                        : "cursor-default border-transparent text-white/35"
                  } ${isToday && !isSelected ? "ring-1 ring-inset ring-white/25" : ""}`}
                >
                  {day}
                  {has && (
                    <span className="absolute bottom-1.5 flex items-center gap-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id}
                          className={`h-[5px] w-[5px] rounded-full ${
                            isSelected
                              ? "bg-[#0b0b0a]"
                              : isScheduledFuture(ev.scheduledAt)
                                ? "bg-amber-400"
                                : "bg-[#ffd444]/80"
                          }`}
                        />
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[7.5px] font-bold leading-none text-white/50">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 text-[9.5px] text-white/40">
            <span className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] rounded-full bg-[#ffd444]/80" /> Live event
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[5px] w-[5px] rounded-full bg-amber-400" /> Scheduled (auto-publish pending)
            </span>
          </div>

          {selectedDay !== null && (
            <div
              key={`cal-day-${calYear}-${calMonth}-${selectedDay}`}
              className="mt-3 space-y-2"
            >
              <p
                className={`cal-title-next text-[10px] uppercase tracking-[0.2em] text-white/40`}
              >
                {CAL_MONTHS[calMonth]} {selectedDay}, {calYear} — {selectedEvents.length} event
                {selectedEvents.length === 1 ? "" : "s"}
              </p>
              {selectedEvents.map((ev, i) => (
                <div
                  key={ev.id}
                  className="cal-item rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-[#ffd444]/40"
                  style={{ animationDelay: `${90 + i * 70}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.18em] text-[#ffd444]">
                      {ev.category}
                    </span>
                    <span className="text-[12.5px] font-semibold text-white">{ev.title}</span>
                    {isScheduledFuture(ev.scheduledAt) && (
                      <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-amber-300">
                        Scheduled
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10.5px] text-white/45">
                    {ev.timeLabel} · {ev.location}
                  </p>
                  {isScheduledFuture(ev.scheduledAt) && (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-amber-300/85">
                      Auto-publishes {formatScheduleLabel(ev.scheduledAt ?? "")} — hidden from the
                      public site until then.
                    </p>
                  )}
                </div>
              ))}
              {selectedEvents.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/12 px-4 py-6 text-center text-[11px] text-white/35">
                  No events on this day.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div className="g-panel flex max-h-[90svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h3 className="font-display text-lg font-semibold">Edit Event</h3>
              <button
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 hover:bg-white/10"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Event Title
                </span>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className={`${input} h-11 text-[14px] font-semibold`}
                  placeholder="Event title"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Category
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setEditing({ ...editing, category: cat })}
                      className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                        editing.category === cat
                          ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                          : "border-white/12 text-white/45 hover:text-white"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    onClick={() => setNewCatModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                  >
                    <Plus size={10} /> Add Category
                  </button>
                  <button
                    onClick={() => setEditing({ ...editing, isNew: !editing.isNew })}
                    className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      editing.isNew
                        ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    NEW badge
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                    Event Date
                  </span>
                  <input
                    type="date"
                    value={editing.startsAt.slice(0, 10)}
                    onChange={(e) =>
                      setEditing({ ...editing, startsAt: new Date(e.target.value).toISOString() })
                    }
                    className={`${input} h-11 text-[13px]`}
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                    Time Label
                  </span>
                  <input
                    value={editing.timeLabel}
                    onChange={(e) => setEditing({ ...editing, timeLabel: e.target.value })}
                    className={`${input} h-11 text-[13px]`}
                    placeholder="e.g. 8.00 a.m. – 2.00 p.m."
                  />
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Location
                </span>
                <input
                  value={editing.location}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                  className={`${input} h-11 text-[13px]`}
                  placeholder="e.g. College Cricket Grounds"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                  Description
                </span>
                <textarea
                  rows={3}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className={`${input} resize-none py-3 text-[13px] leading-relaxed`}
                  placeholder="Short description of the event…"
                />
              </div>

              {/* ── v2.8.89.0 — scheduled auto-publish (news v2.8.80.0 pattern) ── */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-white/40">
                    Go live
                  </span>
                  <button
                    onClick={() => setEditing({ ...editing, scheduledAt: null })}
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      !editing.scheduledAt
                        ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    Publish now
                  </button>
                  <button
                    onClick={() =>
                      setEditing({
                        ...editing,
                        scheduledAt: editing.scheduledAt || defaultScheduleIso(),
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      editing.scheduledAt
                        ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    Schedule
                  </button>
                  {editing.scheduledAt && (
                    <label className="ml-auto flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={isoToColomboInput(editing.scheduledAt)}
                        onChange={(e) => {
                          const iso = colomboInputToIso(e.target.value);
                          if (iso) setEditing({ ...editing, scheduledAt: iso });
                        }}
                        className="rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11.5px] text-white outline-none focus:border-[#ffd444] [color-scheme:dark]"
                      />
                      <span className="text-[10px] text-white/35">Sri Lanka time</span>
                    </label>
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-white/35">
                  {editing.scheduledAt
                    ? `Hidden from the public site until ${formatScheduleLabel(editing.scheduledAt)} — it appears automatically then, everywhere events show (news page, calendar, portal school calendar).`
                    : "Live immediately on save — or schedule it and every public surface shows it at exactly that moment."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 p-4">
              <button
                onClick={() => setEditing(null)}
                className="rounded-full border border-white/15 px-5 py-2.5 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-2.5 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Collection Modal */}
      {newCatModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121210] p-6 text-white shadow-2xl">
            <h3 className="font-display text-lg font-semibold">New Event Category</h3>
            <p className="mt-1 text-[12px] text-white/50">
              Create a custom category for schedule events.
            </p>
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Workshop, Big Match…"
              className="mt-4 h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory();
                if (e.key === "Escape") setNewCatModal(false);
              }}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setNewCatModal(false)}
                className="rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={addCategory}
                disabled={!newCatName.trim() || busy}
                className="rounded-full bg-[#ffd444] px-5 py-2 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                Create Category
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="g-fade fixed bottom-6 left-1/2 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-7">
          <Check size={14} /> {toast}
        </div>
      )}
    </>
  );
}
