import {
  BookOpen,
  GraduationCap,
  HeartHandshake,
} from "lucide-react";

/**
 * Shared portal metadata — intentionally NOT a "use client" module so
 * server components (login pages) can read it directly. Client components
 * import the same values without duplication.
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
] as const;

export type PortalRoleKey = (typeof PORTAL_ROLES)[number]["role"];

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
};
