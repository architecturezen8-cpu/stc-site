import { isNull, lte, or, gte, and, type SQL } from "drizzle-orm";
import { events, posts } from "@/db/schema";

/**
 * v2.8.80.0 — scheduled publishing helpers (one source of truth for every
 * posts query in the app — the standing "shared, zero duplicate" rule).
 *
 * A post is PUBLIC when it has no schedule OR its scheduled time has
 * arrived. Past schedules simply publish, so no sweep/status flip is ever
 * needed; every public page is force-dynamic, so visibility flips the
 * moment the clock passes the scheduled minute.
 *
 * v2.8.89.0 — the SAME contract now covers events (the owner: "event &
 * schedules" auto-publish) so every events query shares one condition.
 */

/** The where-condition every PUBLIC posts query must carry. */
export function visiblePostsCondition(): SQL {
  return or(
    isNull(posts.scheduledAt),
    lte(posts.scheduledAt, new Date()),
  ) as SQL;
}

/** v2.8.89.0 — the where-condition every PUBLIC events query must carry. */
export function visibleEventsCondition(): SQL {
  return or(
    isNull(events.scheduledAt),
    lte(events.scheduledAt, new Date()),
  ) as SQL;
}

/** Midnight (00:00) of TODAY in the school's timezone (Asia/Colombo, UTC+05:30). */
export function startOfTodayColombo(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "01";
  const date = new Date(
    `${get("year")}-${get("month")}-${get("day")}T00:00:00+05:30`,
  );
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * v2.8.93.0 — the where-condition every "Upcoming Events" query must carry:
 * visible (schedule-aware) AND not already past — an event whose date has
 * gone never belongs under an "Upcoming" heading (worklog Task 97, D10).
 */
export function upcomingEventsCondition(): SQL {
  return and(
    visibleEventsCondition(),
    gte(events.startsAt, startOfTodayColombo()),
  ) as SQL;
}

/**
 * Editor input ("2026-10-28T15:00" from <input type="datetime-local">) →
 * ISO instant. The input is SRI LANKA wall time (the school's timezone,
 * UTC+05:30, no DST) so the owner never has to think about UTC.
 */
export function colomboInputToIso(value: string): string | null {
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[0]}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO instant → the datetime-local value the editor shows (Colombo wall). */
export function isoToColomboInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

/** Human chip label for a scheduled instant, e.g. "28 Oct 2026 · 3.00 p.m.". */
export function formatScheduleLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  /* "3:00 PM" → "3.00 p.m." (the school's house style). */
  const [hm, meridiem] = time.split(" ");
  const [hour, minute] = hm.split(":");
  return `${day} · ${hour}.${minute} ${meridiem.toLowerCase() === "am" ? "a.m." : "p.m."}`;
}
