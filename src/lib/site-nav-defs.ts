/**
 * v2.9.0.0 — Main navigation contract + the original hardcoded menu.
 *
 * Pure TypeScript — safe to import from client components (navbar, mobile
 * menu, the visual editor) AND server modules. The DB-backed tree in
 * @/lib/site-nav seeds itself from DEFAULT_NAV_LINKS, so the office keeps
 * editing exactly the menu visitors already knew.
 */

export type NavLeaf = {
  label: string;
  href: string;
  /** DB row id when this item came from the admin-managed table. */
  id?: number;
  /** Gold NEW chip driven by /api/new-status (news posts/events or staff). */
  newFlag?: "news" | "staff";
  /** Blinking dot item (the Live channel). */
  live?: boolean;
};

export type NavItem = NavLeaf & {
  children?: NavLeaf[];
};

/** The original menu, verbatim — the nav table's seed and the fallback. */
export const DEFAULT_NAV_LINKS: NavItem[] = [
  { label: "Home", href: "/#home" },
  {
    label: "About Us",
    href: "/#about",
    children: [
      { label: "History", href: "/history" },
      { label: "Vision & Mission", href: "/vision-mission" },
      { label: "Principal's Message", href: "/principals-message" },
      { label: "Colours & Song", href: "/vision-mission#colours" },
      { label: "Staff", href: "/staff", newFlag: "staff" },
    ],
  },
  {
    label: "Academics",
    href: "/#academics",
    children: [
      { label: "Ordinary Level", href: "/ordinary-level" },
      { label: "Advanced Level", href: "/advanced-level" },
      { label: "Online Resources", href: "/resources" },
      { label: "Exam Results", href: "/exam-results" },
      { label: "Achievements", href: "/achievements" },
      { label: "Admissions", href: "/admissions" },
      { label: "Special Forms", href: "/forms" },
    ],
  },
  {
    label: "Co-Curricular",
    href: "/#cocurricular",
    children: [
      { label: "Clubs & Societies", href: "/clubs-societies" },
      { label: "Sports", href: "/sports" },
      { label: "Cadeting", href: "/cadeting" },
    ],
  },
  {
    label: "News & Events",
    href: "/news",
    children: [
      { label: "Latest News", href: "/news#latest", newFlag: "news" },
      { label: "Upcoming Events", href: "/news#events" },
      { label: "Gallery Archive", href: "/gallery" },
      { label: "Notice Board", href: "/notices" },
      { label: "Live", href: "/live", live: true },
    ],
  },
  { label: "Contact", href: "/contact" },
];

/** Local paths, in-page anchors and HTTPS URLs are all legitimate. */
export function isNavHref(value: string): boolean {
  const href = value.trim();
  if (!href || href.length > 2000) return false;
  return (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  );
}
