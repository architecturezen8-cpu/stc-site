"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
} from "lucide-react";
import { NewBadge } from "@/components/new-badge";

export type CalendarEvent = {
  id: number;
  title: string;
  description: string;
  category: string;
  startsAt: string;
  timeLabel: string;
  location: string;
  isNew?: boolean;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* v2.8.93.0 — the legend is no longer hard-coded: the five classic
   categories always render first, then every category actually present on
   the passed events (the owner's "Chill" never showed — D9). */
const DEFAULT_CATEGORIES = ["Sports", "Culture", "Ceremony", "Admissions", "Academic"];

type Dir = "next" | "prev";

function ymd(iso: string) {
  const d = new Date(iso);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
  };
}

export function EventsCalendar({ events }: { events: CalendarEvent[] }) {
  const firstEvent = events[0] ? ymd(events[0].startsAt) : null;
  const [year, setYear] = useState(firstEvent?.y ?? new Date().getUTCFullYear());
  const [month, setMonth] = useState(firstEvent?.m ?? new Date().getUTCMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [dir, setDir] = useState<Dir>("next");

  const years = useMemo(() => {
    const set = new Set(events.map((e) => ymd(e.startsAt).y));
    set.add(year);
    return [...set].sort();
  }, [events, year]);

  /** Legend categories: defaults first, then every category in the data. */
  const categories = useMemo(() => {
    const extras = [
      ...new Set(
        events
          .map((e) => e.category?.trim())
          .filter((c) => c && !DEFAULT_CATEGORIES.includes(c)),
      ),
    ].sort((a, b) => a.localeCompare(b));
    return [...DEFAULT_CATEGORIES, ...extras];
  }, [events]);

  /** events grouped by day-of-month for the visible month */
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    events.forEach((e) => {
      const { y, m, d } = ymd(e.startsAt);
      if (y === year && m === month) {
        map.set(d, [...(map.get(d) ?? []), e]);
      }
    });
    return map;
  }, [events, year, month]);

  /** Monday-first grid */
  const cells = useMemo(() => {
    const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const out: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  const step = (delta: number) => {
    setDir(delta < 0 ? "prev" : "next");
    const next = month + delta;
    if (next < 0) {
      setMonth(11);
      setYear(year - 1);
    } else if (next > 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(next);
    }
    setSelected(null);
  };

  const jumpToMonth = (m: number) => {
    if (m === month) return;
    // Animate in the direction of travel through the year
    const from = year * 12 + month;
    const to = year * 12 + m;
    setDir(to < from ? "prev" : "next");
    setMonth(m);
    setSelected(null);
  };

  const jumpToYear = (y: number) => {
    if (y === year) return;
    setDir(y < year ? "prev" : "next");
    setYear(y);
    setSelected(null);
  };

  const monthEvents = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const selectedEvents = selected
    ? events.filter((e) => {
        const { y, m, d } = ymd(e.startsAt);
        return `${y}-${m}-${d}` === selected;
      })
    : null;

  const viewKey = `${year}-${month}`;
  const listEvents = selectedEvents ?? monthEvents.flatMap(([, evs]) => evs);

  return (
    <div className="overflow-hidden rounded-2xl border border-fg/10">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-fg/10 bg-surface-2 px-5 py-5 md:px-7">
        <div className="flex items-center gap-3">
          <button
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="grid h-11 w-11 place-items-center rounded-full border border-fg/15 transition-all duration-300 hover:bg-fg hover:text-surface active:scale-90 active:duration-100"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            onClick={() => step(1)}
            aria-label="Next month"
            className="grid h-11 w-11 place-items-center rounded-full border border-fg/15 transition-all duration-300 hover:bg-fg hover:text-surface active:scale-90 active:duration-100"
          >
            <ChevronRight size={17} />
          </button>

          {/* Sliding month/year title */}
          <div className="ml-1 overflow-hidden">
            <p
              key={viewKey}
              className={`font-display text-2xl font-semibold tracking-[-0.02em] md:text-3xl ${
                dir === "prev" ? "cal-title-prev" : "cal-title-next"
              }`}
            >
              {MONTHS[month]} {year}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month */}
          <div className="relative">
            <select
              value={month}
              onChange={(e) => jumpToMonth(Number(e.target.value))}
              aria-label="Select month"
              className="h-11 w-[138px] cursor-pointer appearance-none rounded-full border border-fg/15 bg-surface pl-4 pr-10 text-[13px] font-medium leading-none text-fg transition-colors duration-300 hover:border-fg/40 focus:border-gold focus:outline-none"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i} className="bg-surface text-fg">
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-fg/45"
            />
          </div>

          {/* Year */}
          <div className="relative">
            <select
              value={year}
              onChange={(e) => jumpToYear(Number(e.target.value))}
              aria-label="Select year"
              className="h-11 w-[104px] cursor-pointer appearance-none rounded-full border border-fg/15 bg-surface pl-4 pr-10 text-[13px] font-medium leading-none text-fg transition-colors duration-300 hover:border-fg/40 focus:border-gold focus:outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-surface text-fg">
                  {y}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-fg/45"
            />
          </div>
        </div>
      </div>

      <div data-structured-content className="grid lg:grid-cols-[1.45fr_1fr]">
        {/* Month grid — slides in the direction of travel */}
        <div className="overflow-hidden border-b border-fg/10 p-4 md:p-6 lg:border-b-0 lg:border-r">
          <div
            key={viewKey}
            className={`grid grid-cols-7 gap-1.5 ${
              dir === "prev" ? "cal-grid-prev" : "cal-grid-next"
            }`}
          >
            {DOW.map((d) => (
              <div
                key={d}
                className="pb-2 text-center font-sans text-[9.5px] uppercase tracking-[0.2em] text-fg/40"
              >
                {d}
              </div>
            ))}

            {cells.map((day, i) => {
              if (day === null)
                return <div key={`x${i}`} className="aspect-square" />;

              const dayEvents = byDay.get(day) ?? [];
              const has = dayEvents.length > 0;
              const key = `${year}-${month}-${day}`;
              const isSelected = selected === key;

              return (
                <button
                  key={key}
                  onClick={() => setSelected(has ? (isSelected ? null : key) : null)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border text-sm transition-all duration-300 ease-out md:rounded-xl ${
                    isSelected
                      ? "border-transparent bg-fg text-surface shadow-lift"
                      : has
                        ? "border-gold/50 bg-gold/10 font-semibold text-fg hover:-translate-y-0.5 hover:border-gold hover:bg-gold/20 active:scale-90"
                        : "cursor-default border-transparent text-fg/35"
                  }`}
                  style={{ animationDelay: `${i * 10}ms` }}
                >
                  {day}
                  {has && (
                    <span className="absolute bottom-2 flex items-center gap-1 md:bottom-2.5">
                      <span
                        className={`h-[3px] rounded-full transition-all duration-300 ${
                          isSelected ? "w-3 bg-gold" : "w-4 bg-gold/70 group-hover:w-6"
                        }`}
                      />
                      {dayEvents.length > 1 && (
                        <span
                          className={`font-sans text-[8px] font-semibold leading-none ${
                            isSelected ? "text-gold" : "text-fg/40"
                          }`}
                        >
                          {dayEvents.length}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Categories — refined chips, no colour dots */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-fg/10 pt-5">
            {categories.map((cat) => {
              const count = listEvents.filter((e) => e.category === cat).length;
              return (
                <span
                  key={cat}
                  className={`rounded-full border px-3.5 py-1.5 font-sans text-[9px] uppercase tracking-[0.2em] transition-colors duration-300 ${
                    count > 0
                      ? "border-fg/25 text-fg/65"
                      : "border-fg/10 text-fg/35"
                  }`}
                >
                  {cat}
                </span>
              );
            })}
          </div>
        </div>

        {/* Side list — staggered card entrances, keyed per view */}
        <div className="max-h-[560px] overflow-y-auto p-4 md:p-6">
          <div className="overflow-hidden">
            <p
              key={`label-${viewKey}-${selected ?? "all"}`}
              className={`font-sans text-[10px] uppercase tracking-[0.3em] text-fg/45 ${
                dir === "prev" ? "cal-title-prev" : "cal-title-next"
              }`}
            >
              {selectedEvents ? "Selected day" : `${MONTHS[month]} schedule`}
            </p>
          </div>

          <div
            key={`list-${viewKey}-${selected ?? "all"}`}
            className={`mt-5 space-y-3 ${
              dir === "prev" ? "cal-grid-prev" : "cal-grid-next"
            }`}
          >
            {listEvents.map((e, i) => {
              const { d } = ymd(e.startsAt);
              return (
                <div
                  key={e.id}
                  className="cal-item rounded-xl bg-card p-5 text-white transition-transform duration-300 hover:-translate-y-0.5"
                  style={{ animationDelay: `${120 + i * 70}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold font-display text-lg font-semibold text-ink">
                      {d}
                    </span>
                    <div className="min-w-0">
                      <h4 className="flex items-center gap-2 truncate font-display text-base font-semibold tracking-[-0.01em]">
                        <span className="truncate">{e.title}</span>
                        {e.isNew && <NewBadge />}
                      </h4>
                      <span className="mt-1.5 inline-flex rounded-full border border-white/15 px-2.5 py-1 font-sans text-[8.5px] uppercase tracking-[0.2em] text-gold/90">
                        {e.category}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3.5 text-[13px] leading-relaxed text-white/60">
                    {e.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-3.5 font-sans text-[9.5px] uppercase tracking-[0.18em] text-white/50">
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} className="text-gold" />
                      {e.timeLabel}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-gold" />
                      {e.location}
                    </span>
                  </div>
                </div>
              );
            })}

            {listEvents.length === 0 && (
              <div
                className="cal-item rounded-xl border border-dashed border-fg/20 px-5 py-12 text-center"
                style={{ animationDelay: "120ms" }}
              >
                <p className="text-[14px] text-fg/50">
                  No college events scheduled in {MONTHS[month]}.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
