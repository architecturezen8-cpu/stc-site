import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  lmsClasses,
  lmsEnrollments,
  lmsParentChildren,
  lmsParents,
  lmsPortalAccounts,
  lmsStorageLedger,
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

export type ProfileExtraField = {
  /** The column header exactly as the office's sheet had it. */
  label: string;
  value: string;
};

/** v2.9.15.10 — surface the office's EXTRA sheet columns (extra_data JSON,
    captured at every Excel import) on the portal profile pages. Until now
    they lived only inside the Verification Records manager — the owner
    asked for them on the profile and wherever the person shows.
    Tolerant parse: bad JSON → empty list, never a crash. */
export function parseRegisterExtraFields(raw: string | null | undefined): ProfileExtraField[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    const out: ProfileExtraField[] = [];
    for (const [label, value] of Object.entries(parsed)) {
      const v = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
      if (!label.trim() || !v) continue;
      out.push({ label: label.trim(), value: v.slice(0, 300) });
    }
    return out.slice(0, 30);
  } catch {
    return [];
  }
}

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
  /** v2.9.15.10 — the office's extra sheet columns for this register row. */
  extraFields?: ProfileExtraField[];
};

export type ProfileChildView = {
  /** v2.9.15.5 — the lms_students id, so the profile's self-service
      unlink chip can target exactly this link (ownership is re-checked
      server-side on every call). */
  studentId: number;
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
  /** v2.9.13.0 — the assistant class teacher rides beside the class teacher
      (owner: "assisten class teacherge name eka watenne na ne"). */
  classAssistantTeacher: string | null;
  classAssistantTeacherPhone: string | null;
  /** v2.9.15.10 — the child register row's extra sheet columns. */
  extraFields: ProfileExtraField[];
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
    /** v2.9.15.8 — the account's own (self-service) phone — editable on
        the profile's "My details" panel; the register phone row above
        stays office-managed. */
    phone: string | null;
    /* v2.9.15.0 — the HONEST verification classification:
       · verificationState  the office's manual column ('verified' |
         'unverified' | 'guest'), null = auto-derive;
       · registerMatched    the registration snapshot's outcome was
         'approved' (the details matched the school register);
       · effectiveVerification  the state column when set, else 'verified'
         on a register match, else null (the badge then falls back to the
         status word — a manual approval WITHOUT a register match never
         reads as verified here, because the approvals route writes
         verificationState='unverified' for exactly that case). */
    verificationState: string | null;
    registerMatched: boolean;
    effectiveVerification: "verified" | "unverified" | "guest" | null;
  };
  record: ProfileRecordView | null;
  relation: string | null;
  enrolledClass: string | null;
  classTeacher: string | null;
  classTeacherPhone: string | null;
  /** v2.9.15.10 — the stored bytes of the profile photo (register photo or
      account avatar, straight from the storage ledger) so the Photo Studio
      can show an honest size badge. */
  photoBytes: number | null;
  /** v2.9.13.0 — assistant class teacher (owner request; the seat already
      existed for timetables/notices/report-cards but was never SHOWN). */
  classAssistantTeacher: string | null;
  classAssistantTeacherPhone: string | null;
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

/** Office-register display name (+phone) for a staff member, by staff code
    with a portal-account fallback — shared by BOTH class-teacher seats. */
async function staffDisplayName(
  staffCode: string | null,
  accountId: number | null,
): Promise<{ name: string | null; phone: string | null }> {
  if (staffCode) {
    const [staffRecord] = await db
      .select({ fullName: lmsTeacherRecords.fullName, phone: lmsTeacherRecords.phone })
      .from(lmsTeacherRecords)
      .where(sql`lower(${lmsTeacherRecords.teacherId}) = ${staffCode.toLowerCase()}`)
      .limit(1);
    if (staffRecord) return { name: staffRecord.fullName, phone: staffRecord.phone };
  }
  if (accountId) {
    const [acc] = await db
      .select({ fullName: lmsPortalAccounts.fullName })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, accountId))
      .limit(1);
    return { name: acc?.fullName ?? null, phone: null };
  }
  return { name: null, phone: null };
}

/** Class name + class-teacher display name + office phone for a class id.
    v2.9.13.0 — also resolves the ASSISTANT class teacher so the portals can
    show both seats (owner: "assisten class teacherge name eka watenne na"). */
async function classInfo(classId: number): Promise<{
  name: string | null;
  teacher: string | null;
  teacherPhone: string | null;
  assistant: string | null;
  assistantPhone: string | null;
}> {
  const assistantTeacher = alias(lmsTeachers, "assistant_teacher");
  const [row] = await db
    .select({
      name: lmsClasses.name,
      classTeacherId: lmsClasses.classTeacherId,
      assistantClassTeacherId: lmsClasses.assistantClassTeacherId,
      staffCode: lmsTeachers.staffCode,
      accountId: lmsTeachers.accountId,
      assistantStaffCode: assistantTeacher.staffCode,
      assistantAccountId: assistantTeacher.accountId,
    })
    .from(lmsClasses)
    .leftJoin(lmsTeachers, eq(lmsClasses.classTeacherId, lmsTeachers.id))
    .leftJoin(assistantTeacher, eq(lmsClasses.assistantClassTeacherId, assistantTeacher.id))
    .where(eq(lmsClasses.id, classId))
    .limit(1);
  if (!row) {
    return { name: null, teacher: null, teacherPhone: null, assistant: null, assistantPhone: null };
  }

  const teacherInfo = await staffDisplayName(row.staffCode ?? null, row.accountId ?? null);
  const assistantInfo = await staffDisplayName(
    row.assistantStaffCode ?? null,
    row.assistantAccountId ?? null,
  );
  return {
    name: row.name,
    teacher: teacherInfo.name,
    teacherPhone: teacherInfo.phone,
    assistant: assistantInfo.name,
    assistantPhone: assistantInfo.phone,
  };
}

/** v2.9.15.10 — the storage ledger's byte size for the first live blob key
    (best-effort → null on any hiccup; the badge just stays hidden). */
async function ledgerBytesForKeys(keys: Array<string | null | undefined>): Promise<number | null> {
  for (const key of keys) {
    if (!key) continue;
    try {
      const [row] = await db
        .select({ bytes: lmsStorageLedger.bytes })
        .from(lmsStorageLedger)
        .where(and(eq(lmsStorageLedger.objectKey, key), isNull(lmsStorageLedger.deletedAt)))
        .limit(1);
      if (row) return row.bytes;
    } catch {
      return null;
    }
  }
  return null;
}

async function studentProfileParts(accountId: number, email: string) {
  const person = (await ensureLmsPerson("student", accountId, email)) as
    | typeof lmsStudents.$inferSelect
    | null;
  if (!person)
    return {
      record: null,
      enrolledClass: null,
      classTeacher: null,
      classTeacherPhone: null,
      classAssistantTeacher: null,
      classAssistantTeacherPhone: null,
    };

  const registerRow = await findStudentRecordByAdmission(person.admissionNo);
  const [enrollment] = await db
    .select({ classId: lmsEnrollments.classId })
    .from(lmsEnrollments)
    .where(and(eq(lmsEnrollments.studentId, person.id), eq(lmsEnrollments.status, "active")))
    .limit(1);
  const info = enrollment
    ? await classInfo(enrollment.classId)
    : { name: null, teacher: null, teacherPhone: null, assistant: null, assistantPhone: null };

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
        extraFields: parseRegisterExtraFields(registerRow.extraData),
      }
    : {
        admissionNo: person.admissionNo,
        fullName: person.fullName,
      };

  return {
    record,
    photoKey: registerRow?.photoKey ?? null,
    enrolledClass: info.name,
    classTeacher: info.teacher,
    classTeacherPhone: info.teacherPhone,
    classAssistantTeacher: info.assistant,
    classAssistantTeacherPhone: info.assistantPhone,
  };
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
          extraFields: parseRegisterExtraFields(registerRow.extraData),
        } as ProfileRecordView,
        photoKey: registerRow.photoKey ?? null,
      };
    }
  }
  return {
    record: {
      teacherId: person.staffCode ?? undefined,
      designation: person.designation ?? undefined,
    } as ProfileRecordView,
    photoKey: null,
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
      : { name: null, teacher: null, teacherPhone: null, assistant: null, assistantPhone: null };
    children.push({
      studentId: child.id,
      admissionNo: child.admissionNo,
      fullName: registerRow?.fullName ?? child.fullName,
      registerClassName: registerRow?.className ?? "—",
      registerNo: registerRow?.registerNo ?? "—",
      fatherName: registerRow?.fatherName ?? "—",
      motherName: registerRow?.motherName ?? "—",
      enrolledClass: info.name,
      classTeacher: info.teacher,
      classTeacherPhone: info.teacherPhone,
      classAssistantTeacher: info.assistant,
      classAssistantTeacherPhone: info.assistantPhone,
      extraFields: parseRegisterExtraFields(registerRow?.extraData),
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
      phone: null,
      verificationState: null,
      registerMatched: false,
      effectiveVerification: null,
    },
    record: null,
    relation: null,
    enrolledClass: null,
    classTeacher: null,
    classTeacherPhone: null,
    photoBytes: null,
    classAssistantTeacher: null,
    classAssistantTeacherPhone: null,
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
        phone: lmsPortalAccounts.phone,
        createdAt: lmsPortalAccounts.createdAt,
        /* v2.9.15.0 — the raw verification materials for the honest badge. */
        verification: lmsPortalAccounts.verification,
        verificationState: lmsPortalAccounts.verificationState,
        avatarKey: lmsPortalAccounts.avatarKey,
      })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, input.accountId))
      .limit(1);
    if (account) {
      const registerMatched = (() => {
        try {
          const snapshot = account.verification
            ? (JSON.parse(account.verification) as { outcome?: unknown })
            : null;
          return snapshot?.outcome === "approved";
        } catch {
          return false;
        }
      })();
      const state = account.verificationState;
      base.account = {
        fullName: account.fullName || input.fullName,
        email: account.email,
        avatarUrl: account.avatarUrl ?? input.avatarUrl,
        status: account.status,
        signIn: account.passwordHash ? "Password" : "Google",
        memberSince: fmtDate(account.createdAt),
        phone: account.phone ?? null,
        verificationState: state,
        registerMatched,
        effectiveVerification:
          state === "verified" || state === "unverified" || state === "guest"
            ? state
            : registerMatched
              ? "verified"
              : null,
      };
    }

    if (input.role === "student") {
      const parts = await studentProfileParts(input.accountId, input.email);
      base.record = parts.record;
      base.enrolledClass = parts.enrolledClass;
      base.classTeacher = parts.classTeacher;
      base.classTeacherPhone = parts.classTeacherPhone;
      base.classAssistantTeacher = parts.classAssistantTeacher;
      base.classAssistantTeacherPhone = parts.classAssistantTeacherPhone;
      /* v2.9.15.10 — the Photo Studio's honest size badge rides the ledger. */
      base.photoBytes = await ledgerBytesForKeys([parts.photoKey, account?.avatarKey]);
      /* v2.9.13.0 — the header email becomes the REAL address the student
         gave (owner: "adm-1003@portal.stcmatale.lk eka kohenda enne.
         harinama user dana email eka ne ethanata assign wenna one"). The
         adm-…@portal.stcmatale.lk address stays the LOGIN identity
         (admission-number sign-in) — this only changes what is DISPLAYED,
         here and in the shell sidebar, which both read account.email. */
      if (parts.record?.email) {
        base.account.email = parts.record.email;
      }
    } else if (input.role === "teacher") {
      const parts = await teacherProfileParts(input.accountId);
      base.record = parts.record;
      base.photoBytes = await ledgerBytesForKeys([parts.photoKey, account?.avatarKey]);
    } else if (input.role === "principal") {
      /* v2.8.63.0 — no register bridge: the account card alone. */
      base.photoBytes = await ledgerBytesForKeys([account?.avatarKey]);
    } else {
      const parts = await parentProfileParts(input.accountId);
      base.record = parts.record;
      base.relation = parts.relation;
      base.children = parts.children;
      base.photoBytes = await ledgerBytesForKeys([account?.avatarKey]);
    }
  } catch {
    /* crash-proof: return whatever was collected */
  }

  return base;
}
