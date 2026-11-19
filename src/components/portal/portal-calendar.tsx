"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { PortalCalendarItem } from "@/lib/portal-calendar";

/**
 * PHASE 2.2 (v2.8.53.0) — the portal calendar island. The server hands the
 * WHOLE window of items on one page load (they are few), so month
 * navigation is pure client state — no API, no loading spinners, nothing to
 * wait for. The server precomputed every item's Asia/Colombo day, so the
 * grid always agrees with the school's clock.
 *
 *   · month grid (weeks start Sunday) with kind-coloured dots per day;
 *   · tap a day → that day's list (dues, events, notices);
 *   · no day tapped → the UPCOMING list from today;
 *   · ‹ › wander months, "Today" jumps home.
 */

const KIND_LABEL: Record<PortalCalendarItem["kind"], string> = {
  due: "Due",
  event: "Event",
  notice: "Notice",
};

const KIND_CHIP: Record<PortalCalendarItem["kind"], string> = {
  due: "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]",
  event: "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]",
  notice: "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]",
};

const KIND_DOT: Record<PortalCalendarItem["kind"], string> = {
  due: "bg-[var(--pt-warn-text)]",
  event: "bg-[var(--pt-accent-text)]",
  notice: "bg-[var(--pt-body)]",
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const MONTH_FMT = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

function timeLabel(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}

/** "2026-10-21" → { y: 2026, m: 10 } */
function parseKey(key: string): { y: number; m: number } {
  const [y, m] = key.split("-").map(Number);
  return { y, m };
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function PortalCalendar({
  items,
  today,
}: {
  items: PortalCalendarItem[];
  /** the server's Colombo "YYYY-MM-DD" — the calendar's home */
  today: string;
}) {
  const todayParts = parseKey(today);
  const [cursor, setCursor] = useState(todayParts);
  const [selected, setSelected] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, PortalCalendarItem[]>();
    for (const item of items) {
      const list = map.get(item.day) ?? [];
      list.push(item);
      map.set(item.day, list);
    }
    return map;
  }, [items]);

  /* grid structure — plain label math, nothing timezone-sensitive */
  const firstWeekday = new Date(cursor.y, cursor.m - 1, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m, 0).getDate();
  const cells: Array<{ day: number; key: string } | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      key: `${monthKey(cursor.y, cursor.m)}-${String(i + 1).padStart(2, "0")}`,
    })),
  ];

  const upcoming = useMemo(
    () => items.filter((i) => i.day >= today).slice(0, 6),
    [items, today],
  );

  const selectedItems = selected ? (byDay.get(selected) ?? []) : null;

  function shiftMonth(delta: number) {
    setCursor((cur) => {
      const next = new Date(cur.y, cur.m - 1 + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() + 1 };
    });
  }

  function goHome() {
    setCursor(todayParts);
    setSelected(today);
  }

  return (
    <div>
      {/* month header */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[15px] font-semibold text-[var(--pt-heading)]">
          {MONTH_FMT.format(new Date(cursor.y, cursor.m - 1, 1))}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={goHome}
            className="rounded-full border border-[var(--pt-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--pt-border)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-heading)]"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* weekday header */}
      <div className="mt-3 grid grid-cols-7 gap-1" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <p
            key={d}
            className="text-center text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]"
          >
            {d}
          </p>
        ))}
      </div>

      {/* the grid */}
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Calendar">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`blank-${i}`} aria-hidden="true" />;
          const dayItems = byDay.get(cell.key) ?? [];
          const isToday = cell.key === today;
          const isSelected = cell.key === selected;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setSelected(isSelected ? null : cell.key)}
              aria-pressed={isSelected}
              aria-label={`${cell.key} — ${
                dayItems.length > 0
                  ? `${dayItems.length} item${dayItems.length === 1 ? "" : "s"}`
                  : "no items"
              }`}
              className={`relative flex h-11 flex-col items-center justify-center rounded-xl border text-[12px] transition-colors sm:h-12 ${
                isSelected
                  ? "border-[var(--pt-accent)] bg-[var(--pt-accent-soft)] font-semibold text-[var(--pt-heading)]"
                  : isToday
                    ? "border-[var(--pt-accent)] font-semibold text-[var(--pt-heading)] hover:bg-[var(--pt-panel-soft)]"
                    : "border-transparent text-[var(--pt-body)] hover:bg-[var(--pt-panel-soft)]"
              }`}
            >
              {cell.day}
              {dayItems.length > 0 ? (
                <span className="mt-0.5 flex items-center gap-0.5">
                  {dayItems.slice(0, 3).map((item, idx) => (
                    <span
                      key={idx}
                      className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[item.kind]}`}
                    />
                  ))}
                  {dayItems.length > 3 ? (
                    <span className="text-[8px] font-bold text-[var(--pt-muted)]">
                      +{dayItems.length - 3}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* the day list — the tapped day, or the upcoming strip */}
      <div className="mt-4 border-t border-[var(--pt-divider)] pt-3">
        {selectedItems ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
              {selected}
              {selected === today ? " · today" : ""} —{" "}
              {selectedItems.length === 0
                ? "nothing on this day"
                : `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`}
            </p>
            {selectedItems.length > 0 ? (
              <ul className="pt-scrollbar mt-2 max-h-[240px] space-y-2 overflow-y-auto pr-0.5">
                {selectedItems.map((item, i) => (
                  <li key={`${item.kind}-${item.at}-${i}`}>
                    <CalendarRow item={item} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
              <CalendarDays size={12} />
              Upcoming
            </p>
            {upcoming.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-[var(--pt-border-strong)] px-4 py-4 text-center text-[12.5px] text-[var(--pt-body)]">
                Nothing ahead on the calendar yet — due dates, school events
                and class notices land here.
              </p>
            ) : (
              <ul className="pt-scrollbar mt-2 max-h-[240px] space-y-2 overflow-y-auto pr-0.5">
                {upcoming.map((item, i) => (
                  <li key={`${item.kind}-${item.at}-${i}`}>
                    <CalendarRow item={item} withDay />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CalendarRow({
  item,
  withDay = false,
}: {
  item: PortalCalendarItem;
  /** the upcoming strip shows the day; the tapped-day list doesn't need it */
  withDay?: boolean;
}) {
  const day = item.day.slice(8);
  const month = item.day.slice(5, 7);
  const dayLabel = `${day}/${month}`;
  const inner = (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-2.5 transition-colors hover:border-[var(--pt-border-strong)]">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold leading-none ${
          item.kind === "due"
            ? "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]"
            : item.kind === "event"
              ? "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]"
              : "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
        }`}
      >
        {withDay ? dayLabel : KIND_LABEL[item.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--pt-heading)]">
          {item.title}
        </span>
        <span className="flex items-center gap-1.5 truncate text-[11px] text-[var(--pt-body)]">
          {item.kind === "event" ? <MapPin size={10} className="shrink-0" /> : null}
          <span className="truncate">
            {item.sub} · {withDay ? `${dayLabel} · ` : ""}
            {timeLabel(item.at)}
          </span>
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${KIND_CHIP[item.kind]}`}
      >
        {KIND_LABEL[item.kind]}
      </span>
    </div>
  );
  return item.href ? (
    <a href={item.href} className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}
