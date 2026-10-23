import {
  CalendarClock,
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
