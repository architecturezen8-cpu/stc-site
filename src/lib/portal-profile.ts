import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  lmsClasses,
  lmsEnrollments,
  lmsParentChildren,
  lmsParents,
  lmsPortalAccounts,
  lmsStudentRecords,
  lmsStudents,
  lmsTeacherRecords,
  lmsTeachers,
} from "@/db/schema-lms";
import {
  ensureLmsPerson,
  findStudentRecordByAdmission,
} from "@/lib/lms-identity";
import { normalizeId } from "@/lib/verification";

/* ────────────────────────────────────────────────────────────────────────
   PORTAL PROFILE (v2.8.34.0, Option A)

   The profile page reads the school-file (office register) details LIVE
   through the account → register link. Nothing is copied onto the
   account: when the office edits a register row, the portal profile
   reflects it on the next load. Crash-proof → calm empty states.
   ──────────────────────────────────────────────────────────────────────── */

export type ProfileRecordView = {
  admissionNo?: string;
  registerNo?: string | null;
  className?: string | null;
  fatherName?: string | null;
  motherName?: string | null;
  teacherId?: string | null;
  designation?: string | null;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  /** v2.8.59.0 — the register row's profile photo (register-row storage,
      so it exists before an account does and follows every join). */
  photoUrl?: string | null;
};

export type ProfileChildView = {
  admissionNo: string;
  fullName: string;
  registerClassName: string;
  registerNo: string;
  fatherName: string;
  motherName: string;
  enrolledClass: string | null;
  classTeacher: string | null;
  /** v2.8.48.0 — class teacher's office phone from the staff register, so
      parents can CALL or WhatsApp the teacher straight from the profile. */
  classTeacherPhone: string | null;
};

export type PortalProfile = {
  ok: true;
  role: "student" | "teacher" | "parent" | "principal";
  account: {
    fullName: string;
    email: string;
    avatarUrl: string | null;
    status: string;
    signIn: "Password" | "Google";
    memberSince: string;
  };
  record: ProfileRecordView | null;
  relation: string | null;
  enrolledClass: string | null;
  classTeacher: string | null;
  classTeacherPhone: string | null;
  children: ProfileChildView[];
};

function fmtDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Class name + class-teacher display name + office phone for a class id. */
async function classInfo(classId: number): Promise<{
  name: string | null;
  teacher: string | null;
  teacherPhone: string | null;
}> {
  const [row] = await db
    .select({
      name: lmsClasses.name,
      classTeacherId: lmsClasses.classTeacherId,
      staffCode: lmsTeachers.staffCode,
      accountId: lmsTeachers.accountId,
    })
    .from(lmsClasses)
    .leftJoin(lmsTeachers, eq(lmsClasses.classTeacherId, lmsTeachers.id))
    .where(eq(lmsClasses.id, classId))
    .limit(1);
  if (!row) return { name: null, teacher: null, teacherPhone: null };

  let teacher: string | null = null;
  let teacherPhone: string | null = null;
  if (row.classTeacherId && row.staffCode) {
    const [staffRecord] = await db
      .select({ fullName: lmsTeacherRecords.fullName, phone: lmsTeacherRecords.phone })
      .from(lmsTeacherRecords)
      .where(sql`lower(${lmsTeacherRecords.teacherId}) = ${row.staffCode.toLowerCase()}`)
      .limit(1);
    teacher = staffRecord?.fullName ?? null;
    teacherPhone = staffRecord?.phone ?? null;
  }
  if (!teacher && row.accountId) {
    const [acc] = await db
      .select({ fullName: lmsPortalAccounts.fullName })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, row.accountId))
      .limit(1);
    teacher = acc?.fullName ?? null;
  }
  return { name: row.name, teacher, teacherPhone };
}

async function studentProfileParts(accountId: number, email: string) {
  const person = (await ensureLmsPerson("student", accountId, email)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!person)
    return { record: null, enrolledClass: null, classTeacher: null, classTeacherPhone: null };

  const registerRow = await findStudentRecordByAdmission(person.admissionNo);
  const [enrollment] = await db
    .select({ classId: lmsEnrollments.classId })
    .from(lmsEnrollments)
    .where(and(eq(lmsEnrollments.studentId, person.id), eq(lmsEnrollments.status, "active")))
    .limit(1);
  const info = enrollment
    ? await classInfo(enrollment.classId)
    : { name: null, teacher: null, teacherPhone: null };

  const record: ProfileRecordView = registerRow
    ? {
        admissionNo: registerRow.admissionNo,
        registerNo: registerRow.registerNo,
        className: registerRow.className,
        fullName: registerRow.fullName,
        fatherName: registerRow.fatherName,
        motherName: registerRow.motherName,
        phone: registerRow.phone,
        email: registerRow.email,
        photoUrl: registerRow.photoUrl ?? null,
      }
    : {
        admissionNo: person.admissionNo,
        fullName: person.fullName,
      };

  return { record, enrolledClass: info.name, classTeacher: info.teacher, classTeacherPhone: info.teacherPhone };
}

async function teacherProfileParts(accountId: number) {
  const person = (await ensureLmsPerson("teacher", accountId)) as
    | typeof lmsTeachers.$inferSelect
    | null;
  if (!person) return { record: null };

  if (person.staffCode) {
    const [registerRow] = await db
      .select()
      .from(lmsTeacherRecords)
      .where(sql`lower(${lmsTeacherRecords.teacherId}) = ${person.staffCode.toLowerCase()}`)
      .limit(1);
    if (registerRow) {
      return {
        record: {
          teacherId: registerRow.teacherId,
          fullName: registerRow.fullName,
          designation: registerRow.designation,
          email: registerRow.email,
          phone: registerRow.phone,
          photoUrl: registerRow.photoUrl ?? null,
        } as ProfileRecordView,
      };
    }
  }
  return {
    record: {
      teacherId: person.staffCode ?? undefined,
      designation: person.designation ?? undefined,
    } as ProfileRecordView,
  };
}

async function parentProfileParts(accountId: number) {
  const person = (await ensureLmsPerson("parent", accountId)) as
    | typeof lmsParents.$inferSelect
    | null;
  if (!person) return { record: null, relation: null, children: [] as ProfileChildView[] };

  const links = await db
    .select({ studentId: lmsParentChildren.studentId })
    .from(lmsParentChildren)
    .where(eq(lmsParentChildren.parentId, person.id));

  const children: ProfileChildView[] = [];
  for (const link of links) {
    const [child] = await db
      .select()
      .from(lmsStudents)
      .where(eq(lmsStudents.id, link.studentId))
      .limit(1);
    if (!child) continue;
    const registerRow = await findStudentRecordByAdmission(child.admissionNo);
    const [enrollment] = await db
      .select({ classId: lmsEnrollments.classId })
      .from(lmsEnrollments)
      .where(and(eq(lmsEnrollments.studentId, child.id), eq(lmsEnrollments.status, "active")))
      .limit(1);
    const info = enrollment
      ? await classInfo(enrollment.classId)
      : { name: null, teacher: null, teacherPhone: null };
    children.push({
      admissionNo: child.admissionNo,
      fullName: registerRow?.fullName ?? child.fullName,
      registerClassName: registerRow?.className ?? "—",
      registerNo: registerRow?.registerNo ?? "—",
      fatherName: registerRow?.fatherName ?? "—",
      motherName: registerRow?.motherName ?? "—",
      enrolledClass: info.name,
      classTeacher: info.teacher,
      classTeacherPhone: info.teacherPhone,
    });
  }

  return {
    record: children.length > 0 ? { fullName: children[0].fullName } as ProfileRecordView : null,
    relation: person.relationship ?? null,
    children,
  };
}

export async function getPortalProfile(input: {
  role: "student" | "teacher" | "parent" | "principal";
  accountId: number;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}): Promise<PortalProfile> {
  const base: PortalProfile = {
    ok: true,
    role: input.role,
    account: {
      fullName: input.fullName,
      email: input.email,
      avatarUrl: input.avatarUrl,
      status: "active",
      signIn: "Google",
      memberSince: "—",
    },
    record: null,
    relation: null,
    enrolledClass: null,
    classTeacher: null,
    classTeacherPhone: null,
    children: [],
  };

  try {
    const [account] = await db
      .select({
        fullName: lmsPortalAccounts.fullName,
        email: lmsPortalAccounts.email,
        avatarUrl: lmsPortalAccounts.avatarUrl,
        status: lmsPortalAccounts.status,
        passwordHash: lmsPortalAccounts.passwordHash,
        createdAt: lmsPortalAccounts.createdAt,
      })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, input.accountId))
      .limit(1);
    if (account) {
      base.account = {
        fullName: account.fullName || input.fullName,
        email: account.email,
        avatarUrl: account.avatarUrl ?? input.avatarUrl,
        status: account.status,
        signIn: account.passwordHash ? "Password" : "Google",
        memberSince: fmtDate(account.createdAt),
      };
    }

    if (input.role === "student") {
      const parts = await studentProfileParts(input.accountId, input.email);
      base.record = parts.record;
      base.enrolledClass = parts.enrolledClass;
      base.classTeacher = parts.classTeacher;
      base.classTeacherPhone = parts.classTeacherPhone;
    } else if (input.role === "teacher") {
      const parts = await teacherProfileParts(input.accountId);
      base.record = parts.record;
    } else if (input.role === "principal") {
      /* v2.8.63.0 — no register bridge: the account card alone. */
    } else {
      const parts = await parentProfileParts(input.accountId);
      base.record = parts.record;
      base.relation = parts.relation;
      base.children = parts.children;
    }
  } catch {
    /* crash-proof: return whatever was collected */
  }

  return base;
}
