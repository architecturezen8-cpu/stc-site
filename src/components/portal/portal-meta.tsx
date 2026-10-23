import {
  BookOpen,
  GraduationCap,
  HeartHandshake,
  Landmark,
} from "lucide-react";

/**
 * Shared portal metadata — intentionally NOT a "use client" module so
 * server components (login pages) can read it directly. Client components
 * import the same values without duplication.
 *
 * v2.8.63.0 — the PRINCIPAL portal joins the doors: certification of
 * report cards. The role is INVITE-ONLY (the office creates it in Admin
 * Studio), so PortalLoginCards filters it out of the REGISTER picker while
 * keeping it on the sign-in picker.
 */

export const PORTAL_ROLES = [
  {
    role: "student",
    href: "/login/student",
    icon: GraduationCap,
    title: "Student",
    blurb: "Homework, marks & timetable",
  },
  {
    role: "parent",
    href: "/login/parent",
    icon: HeartHandshake,
    title: "Parent",
    blurb: "Follow your child's progress",
  },
  {
    role: "teacher",
    href: "/login/teacher",
    icon: BookOpen,
    title: "Teacher",
    blurb: "Classes, assignments & marks",
  },
  {
    role: "principal",
    href: "/login/principal",
    icon: Landmark,
    title: "Principal",
    blurb: "Certify report cards",
  },
] as const;

export type PortalRoleKey = (typeof PORTAL_ROLES)[number]["role"];

/** Self-registration stays student/parent/teacher — never the principal. */
export const REGISTERABLE_ROLES = PORTAL_ROLES.filter(
  (entry) => entry.role !== "principal",
);

export const PORTAL_META: Record<
  PortalRoleKey,
  { title: string; blurb: string; icon: typeof GraduationCap }
> = {
  student: {
    title: "Student",
    blurb: "Homework, marks & timetable",
    icon: GraduationCap,
  },
  parent: {
    title: "Parent",
    blurb: "Follow your child's progress",
    icon: HeartHandshake,
  },
  teacher: {
    title: "Teacher",
    blurb: "Classes, assignments & marks",
    icon: BookOpen,
  },
  principal: {
    title: "Principal",
    blurb: "Certify report cards",
    icon: Landmark,
  },
};
