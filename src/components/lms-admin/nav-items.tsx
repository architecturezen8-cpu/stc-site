import {
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Eraser,
  HardDrive,
  LayoutDashboard,
  Settings2,
  UserRound,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

/**
 * Shared nav data for the LMS Admin Studio shell — the desktop pill track
 * and the mobile side panel both render from THIS list (v2.8.39.0), so the
 * two can never drift apart. v2.8.40.0 — "Settings" is now "Profile" (the
 * owner's word), showing the signed-in admin's full account details.
 *
 * v2.8.55.0 (owner item 3) — "Timetable": the studio creates the class
 * timetables (owner: "godak welawata eyane timetables create karanne") and
 * every write syncs to the students' class grid and the teachers' personal
 * weeks automatically.
 *
 * "Academic year" — the December/January rollover: promote students into
 * the new year's classes, graduate the O/L (grade 11) and A/L (grade 13)
 * leavers and re-assign class teachers in one guided run.
 *
 * v2.8.71.0 (owner item 2) — "Notifications" LEFT the section list ("don't
 * put notifications on the dashboard"): it lives behind the header BELL
 * now, and its full page (/lms-admin/notifications — the composer + sent
 * history) is reached from the bell's "All notifications" option. The key
 * stays in the union below so that page can still mark itself active.
 */
export const LMS_ADMIN_NAV = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/lms-admin",
    icon: LayoutDashboard,
  },
  {
    key: "registrations",
    label: "Registration Approvals",
    href: "/lms-admin/registrations",
    icon: UserRoundCheck,
  },
  {
    key: "registers",
    label: "Verification Records",
    href: "/lms-admin/registers",
    icon: ClipboardList,
  },
  {
    key: "manage",
    label: "LMS Setup",
    href: "/lms-admin/manage",
    icon: Settings2,
  },
  {
    key: "promotion",
    label: "Academic year",
    href: "/lms-admin/promotion",
    icon: CalendarRange,
  },
  {
    key: "timetable",
    label: "Timetable",
    href: "/lms-admin/timetable",
    icon: CalendarClock,
  },
  {
    key: "storage",
    label: "Storage",
    href: "/lms-admin/storage",
    icon: HardDrive,
  },
  {
    key: "chat-cleanup",
    label: "Chat cleanup",
    href: "/lms-admin/chat-cleanup",
    icon: Eraser,
  },
  {
    key: "portal-users",
    label: "Portal users",
    href: "/lms-admin/portal-users",
    icon: UsersRound,
  },
  {
    key: "settings",
    label: "Profile",
    href: "/lms-admin/settings",
    icon: UserRound,
  },
] as const;

export type LmsAdminNavKey =
  | (typeof LMS_ADMIN_NAV)[number]["key"]
  /* v2.8.71.0 — bell-managed page, intentionally not in the section list */
  | "notifications";
