export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDayMonth(date: Date) {
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  }).format(date);
  return { day, month: month.toUpperCase() };
}

export const CATEGORIES = [
  "All",
  "Achievements",
  "Sports",
  "Culture",
  "Announcements",
] as const;
