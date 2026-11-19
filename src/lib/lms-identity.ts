import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";
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
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { normalizeClass, normalizeId } from "@/lib/verification";

/* ────────────────────────────────────────────────────────────────────────
   REGISTRATION → LMS BRIDGE (v2.8.34.0, Phase 3.1-b)

   The office registers (lms_student_records / lms_teacher_records) are the
   source of truth. This bridge lazily turns a verified portal account into
   the LMS person rows the dashboards read:

     student → lms_students (+ auto-enrollment into the matching class)
     teacher → lms_teachers (claims the seeded staff row when present)
     parent  → lms_parents + lms_parent_children (child link)

   Everything is IDEMPOTENT and crash-proof: calling it twice is a no-op
   and any failure degrades to "no person row" (calm empty dashboards).
   ──────────────────────────────────────────────────────────────────────── */

type Snapshot = Record<string, unknown>;
type LmsStudentRow = typeof lmsStudents.$inferSelect;
type LmsTeacherRow = typeof lmsTeachers.$inferSelect;
type LmsParentRow = typeof lmsParents.$inferSelect;

function snapValue(snapshot: Snapshot | null, key: string): string {
  const value = snapshot?.[key];
  return typeof value === "string" ? value.trim() : "";
}

async function accountSnapshot(accountId: number): Promise<Snapshot | null> {
  const [account] = await db
    .select({ verification: lmsPortalAccounts.verification })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, accountId))
    .limit(1);
  if (!account?.verification) return null;
  try {
    return JSON.parse(account.verification) as Snapshot;
  } catch {
    return null;
  }
}

/** Register row for an admission number — exact match first, then punctuation-insensitive. */
export async function findStudentRecordByAdmission(admissionNo: string) {
  await ensureSchemaExtras();
  const raw = admissionNo.trim();
  if (!raw) return null;
  const [exact] = await db
    .select()
    .from(lmsStudentRecords)
    .where(sql`lower(${lmsStudentRecords.admissionNo}) = ${raw.toLowerCase()}`)
    .limit(1);
  if (exact) return exact;
  const all = await db.select().from(lmsStudentRecords).limit(3000);
  const norm = normalizeId(raw);
  return all.find((row) => normalizeId(row.admissionNo) === norm) ?? null;
}

async function findTeacherRecordById(teacherId: string) {
  await ensureSchemaExtras();
  const raw = teacherId.trim();
  if (!raw) return null;
  const [exact] = await db
    .select()
    .from(lmsTeacherRecords)
    .where(sql`lower(${lmsTeacherRecords.teacherId}) = ${raw.toLowerCase()}`)
    .limit(1);
  if (exact) return exact;
  const all = await db.select().from(lmsTeacherRecords).limit(1000);
  const norm = normalizeId(raw);
  return all.find((row) => normalizeId(row.teacherId) === norm) ?? null;
}

/** Enroll a student person into the class named on the register row (move-safe). */
async function enrollStudentIntoClass(studentId: number, className: string | null) {
  if (!className) return;
  const target = normalizeClass(className);
  if (!target) return;
  const classes = await db
    .select({ id: lmsClasses.id, name: lmsClasses.name })
    .from(lmsClasses);
  const match = classes.find((c) => normalizeClass(c.name) === target);
  if (!match) return;

  /* v2.9.15.2 — ONE active enrollment per student, and the move must
     respect the (student, class) unique index: a row for the target class
     can ALREADY exist (paused, or a stale duplicate from the earlier
     reconcile — real data had student 3 active in two classes at once),
     so the live row is never UPDATEd onto it (duplicate key death — the
     raw error the owner saw when linking children from the admin).
     Strategy: pick the row that becomes active, pause every other row. */
  const rows = await db
    .select()
    .from(lmsEnrollments)
    .where(eq(lmsEnrollments.studentId, studentId));
  const targetRow = rows.find((r) => r.classId === match.id);
  let activeId: number | null = null;
  if (targetRow) {
    activeId = targetRow.id;
    if (targetRow.status !== "active") {
      await db
        .update(lmsEnrollments)
        .set({ status: "active" })
        .where(eq(lmsEnrollments.id, targetRow.id));
    }
  } else {
    const [created] = await db
      .insert(lmsEnrollments)
      .values({ studentId, classId: match.id, status: "active" })
      .onConflictDoNothing()
      .returning({ id: lmsEnrollments.id });
    activeId = created?.id ?? null;
    if (activeId === null) {
      /* A concurrent row claimed the slot between the read and the insert. */
      const [fallback] = await db
        .select({ id: lmsEnrollments.id })
        .from(lmsEnrollments)
        .where(and(eq(lmsEnrollments.studentId, studentId), eq(lmsEnrollments.classId, match.id)))
        .limit(1);
      activeId = fallback?.id ?? null;
    }
  }
  if (activeId !== null) {
    await db
      .update(lmsEnrollments)
      .set({ status: "paused" })
      .where(and(eq(lmsEnrollments.studentId, studentId), ne(lmsEnrollments.id, activeId)));
  }
}

/**
 * Create/find the LMS student person for an admission number.
 * `accountId` links the account when the caller has one (registration bridge);
 * the admin enrollment API calls it with null to materialize register students.
 */
export async function ensureStudentPersonByAdmissionNo(
  admissionNo: string,
  accountId: number | null,
): Promise<LmsStudentRow | null> {
  const record = await findStudentRecordByAdmission(admissionNo);
  if (!record) return null;

  if (accountId) {
    const [byAccount] = await db
      .select()
      .from(lmsStudents)
      .where(eq(lmsStudents.accountId, accountId))
      .limit(1);
    if (byAccount) {
      await enrollStudentIntoClass(byAccount.id, record.className);
      return byAccount;
    }
  }

  const [byAdmission] = await db
    .select()
    .from(lmsStudents)
    .where(sql`lower(${lmsStudents.admissionNo}) = ${record.admissionNo.toLowerCase()}`)
    .limit(1);
  if (byAdmission) {
    if (accountId && byAdmission.accountId !== accountId) {
      await db.update(lmsStudents).set({ accountId }).where(eq(lmsStudents.id, byAdmission.id));
    }
    await enrollStudentIntoClass(byAdmission.id, record.className);
    return { ...byAdmission, accountId: byAdmission.accountId ?? accountId };
  }

  const [created] = await db
    .insert(lmsStudents)
    .values({
      accountId: accountId ?? null,
      admissionNo: record.admissionNo,
      fullName: record.fullName,
    })
    .returning();
  await enrollStudentIntoClass(created.id, record.className);
  return created;
}

/** Account → student person. Admission no comes from the verification snapshot (or the synthetic email). */
export async function ensureStudentPerson(
  accountId: number,
  email: string,
): Promise<LmsStudentRow | null> {
  const snapshot = await accountSnapshot(accountId);
  let admissionNo = snapValue(snapshot, "admissionNo");
  if (!admissionNo && email.startsWith("adm-") && email.endsWith("@portal.stcmatale.lk")) {
    admissionNo = email.slice(4, email.indexOf("@"));
  }
  if (!admissionNo) {
    /* v2.8.43.0 — a person row may already be linked to this account by the
       office / a seed, with the account carrying no verification snapshot
       (owner identity recreated by scripts, admin-portal-users accounts…).
       Trust the existing linkage instead of showing an empty dashboard. */
    const [linked] = await db
      .select()
      .from(lmsStudents)
      .where(eq(lmsStudents.accountId, accountId))
      .limit(1);
    return linked ?? null;
  }
  return ensureStudentPersonByAdmissionNo(admissionNo, accountId);
}

/** Account → teacher person. Claims the seeded staff row (account_id NULL) when one matches. */
export async function ensureTeacherPerson(accountId: number): Promise<LmsTeacherRow | null> {
  const snapshot = await accountSnapshot(accountId);
  const teacherId = snapValue(snapshot, "teacherId");
  if (!teacherId) {
    /* v2.8.43.0 — same fallback as the student bridge: a staff row already
       linked to this account (office action / seed script) is trusted even
       when the account has no verification snapshot. */
    const [linked] = await db
      .select()
      .from(lmsTeachers)
      .where(eq(lmsTeachers.accountId, accountId))
      .limit(1);
    return linked ?? null;
  }
  const record = await findTeacherRecordById(teacherId);
  if (!record) return null;

  const [byAccount] = await db
    .select()
    .from(lmsTeachers)
    .where(eq(lmsTeachers.accountId, accountId))
    .limit(1);
  if (byAccount) return byAccount;

  const [byStaffCode] = await db
    .select()
    .from(lmsTeachers)
    .where(sql`lower(coalesce(${lmsTeachers.staffCode}, '')) = ${record.teacherId.toLowerCase()}`)
    .limit(1);
  if (byStaffCode) {
    if (!byStaffCode.accountId) {
      const [claimed] = await db
        .update(lmsTeachers)
        .set({ accountId })
        .where(eq(lmsTeachers.id, byStaffCode.id))
        .returning();
      return claimed ?? byStaffCode;
    }
    return byStaffCode;
  }

  const [created] = await db
    .insert(lmsTeachers)
    .values({ accountId, staffCode: record.teacherId, designation: record.designation })
    .returning();
  return created;
}

/** Account → parent person + child links (from the verification snapshot). */
export async function ensureParentPerson(accountId: number): Promise<LmsParentRow | null> {
  const snapshot = await accountSnapshot(accountId);
  const relation = (snapValue(snapshot, "relation") || "guardian").slice(0, 20);

  let [parent] = await db
    .select()
    .from(lmsParents)
    .where(eq(lmsParents.accountId, accountId))
    .limit(1);
  if (!parent) {
    const [created] = await db
      .insert(lmsParents)
      .values({ accountId, relationship: relation })
      .onConflictDoNothing()
      .returning();
    parent = created ?? null;
    if (!parent) {
      const [retry] = await db
        .select()
        .from(lmsParents)
        .where(eq(lmsParents.accountId, accountId))
        .limit(1);
      parent = retry ?? null;
    }
  }
  if (!parent) return parent;

  /* v2.9.15.3 — the snapshot may carry MULTIPLE children now. Old accounts
     keep the single childAdmissionNo path; new ones list every child under
     `children`. Each admission number is materialized and linked
     idempotently — one unknown admission number never blocks the rest. */
  const admissionNos: string[] = [];
  if (Array.isArray(snapshot?.children)) {
    for (const entry of snapshot.children) {
      if (entry && typeof entry === "object") {
        const adm = (entry as Record<string, unknown>).admissionNo;
        if (typeof adm === "string" && adm.trim()) admissionNos.push(adm.trim());
      }
    }
  }
  const legacyAdmission = snapValue(snapshot, "childAdmissionNo");
  if (legacyAdmission && !admissionNos.includes(legacyAdmission)) {
    admissionNos.push(legacyAdmission);
  }
  if (admissionNos.length === 0) return parent;

  for (const admissionNo of admissionNos) {
    try {
      const child = await ensureStudentPersonByAdmissionNo(admissionNo, null);
      if (!child) continue;
      const [link] = await db
        .select()
        .from(lmsParentChildren)
        .where(
          and(
            eq(lmsParentChildren.parentId, parent.id),
            eq(lmsParentChildren.studentId, child.id),
          ),
        )
        .limit(1);
      if (!link) {
        await db
          .insert(lmsParentChildren)
          .values({ parentId: parent.id, studentId: child.id })
          .onConflictDoNothing();
      }
    } catch {
      /* one bad admission number never blocks the other links */
    }
  }
  return parent;
}

/** Dispatcher used by the dashboards/profile — never throws. */
export async function ensureLmsPerson(
  role: "student" | "teacher" | "parent" | "principal",
  accountId: number,
  email = "",
): Promise<LmsStudentRow | LmsTeacherRow | LmsParentRow | null> {
  try {
    /* v2.8.63.0 — the Principal is a portal-only role: no LMS person row,
       no register bridge. Their dashboards read the certification queue. */
    if (role === "principal") return null;
    if (role === "student") return await ensureStudentPerson(accountId, email);
    if (role === "teacher") return await ensureTeacherPerson(accountId);
    return await ensureParentPerson(accountId);
  } catch {
    return null;
  }
}
