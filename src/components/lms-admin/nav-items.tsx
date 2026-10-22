import {
  CalendarClock,
  CalendarRange,
  ClipboardList,
  LayoutDashboard,
  Settings2,
  UserRound,
  UserRoundCheck,
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
    key: "settings",
    label: "Profile",
    href: "/lms-admin/settings",
    icon: UserRound,
  },
] as const;

export type LmsAdminNavKey = (typeof LMS_ADMIN_NAV)[number]["key"];
