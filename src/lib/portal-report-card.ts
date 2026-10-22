import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { getCmsPage, getSiteSettings } from "@/lib/cms";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  lmsClassSubjects,
  lmsClasses,
  lmsEnrollments,
  lmsPortalAccounts,
  lmsReportCardEvents,
  lmsReportCards,
  lmsReportMarks,
  lmsReportTerms,
  lmsStudents,
  lmsSubjects,
  lmsTeacherRecords,
  lmsTeachers,
} from "@/db/schema-lms";
import { getLinkedChild, getLinkedChildren } from "@/lib/portal-parent-children";
import {
  getActivePrincipalAccount,
  stampPresence,
} from "@/lib/portal-signature";

/* ────────────────────────────────────────────────────────────────────────
   v2.8.62.0 — DIGITAL TERMINAL REPORT CARD

   The school's paper report card, digitised: one sheet per student per
   year — the marks grid (Subjects × First Test / Mid Year Test / Year End
   Test), the three term blocks (Special Remarks: Studies / General
   Conduct + attendance) and the signature lines.

   ONLY the class teacher of the student's class may write. Students and
   parents read PUBLISHED sheets. The per-column summary rows (Total /
   Average / Average of the First in Class / Number in class / Position)
   are COMPUTED at read time from the class's published sheets — never
   stored, so they can never go stale.

   Like every portal read model, domain failures return { ok:false, error
   } instead of throwing, and whole-page reads degrade calmly.
   ──────────────────────────────────────────────────────────────────────── */

export type ReportCardStatus = "draft" | "submitted" | "certified";

export type ReportCardFail =
  | "bad_request"
  | "not_class_teacher"
  | "not_enrolled"
  | "not_found"
  | "forbidden"
  | "locked"
  | "wrong_state"
  | "signature_missing"
  | "server_error";

export type TeacherReportClass = {
  id: number;
  name: string;
  grade: string;
  section: string | null;
  academicYear: string;
  /** Active enrollment count of the class. */
  roll: number;
};

export type TeacherClassStudent = {
  studentId: number;
  fullName: string;
  admissionNo: string;
  cardId: number | null;
  cardStatus: "none" | ReportCardStatus;
};

export type TeacherClassStudents = {
  class: { id: number; name: string; grade: string; academicYear: string };
  students: TeacherClassStudent[];
};

export type ReportMarkRow = {
  subject: string;
  position: number;
  m1: number | null;
  m2: number | null;
  m3: number | null;
};

export type ReportTermRow = {
  term: number;
  studies: string;
  conduct: string;
  attendance: string;
};

export type ReportCardSignatures = {
  principal: string;
  classTeacher: string;
  /** v2.8.63.0 — stamps exist server-side (served via the gated route). */
  hasPrincipalSign: boolean;
  hasPrincipalSeal: boolean;
  hasTeacherSign: boolean;
};

/** The teacher editor's card-or-template payload for ONE student. */
export type ReportCardEditData = {
  cardId: number | null;
  status: ReportCardStatus;
  year: string;
  grade: string;
  /** The class's subject names (the template source, always present). */
  classSubjects: string[];
  rows: ReportMarkRow[];
  terms: ReportTermRow[];
  signatures: ReportCardSignatures;
  student: { studentId: number; fullName: string; admissionNo: string };
  cls: { id: number; name: string; grade: string; academicYear: string };
  /* v2.8.63.0 — certification lifecycle details for the editor. */
  /** The Principal's note when the sheet was returned for changes. */
  principalNote: string;
  returnedAtLabel: string;
  submittedAtLabel: string;
  certifiedByName: string;
  certifiedAtLabel: string;
};

export type StudentReportCardRef = {
  cardId: number;
  year: string;
  grade: string;
  className: string;
  updatedAt: string;
};

export type ParentChildReportCards = {
  child: { studentId: number; fullName: string; admissionNo: string; className: string | null };
  cards: StudentReportCardRef[];
};

export type ReportCardColumnSummary = {
  total: number;
  count: number;
  /** This card's column average, 1 decimal place (null when no marks). */
  average: number | null;
  /** Best column average among the class's PUBLISHED sheets (1 dp). */
  firstInClass: number | null;
  /** Competition rank (1 = highest); null when this column has no marks. */
  position: number | null;
};

export type ReportCardView = {
  cardId: number;
  status: ReportCardStatus;
  year: string;
  grade: string;
  student: { studentId: number; fullName: string; admissionNo: string };
  cls: { id: number; name: string; grade: string; academicYear: string };
  /** Active enrollment count of the class ("Number of Students in the Class"). */
  classSize: number;
  rows: ReportMarkRow[];
  terms: ReportTermRow[];
  /** [First Test, Mid Year Test, Year End Test] */
  summary: ReportCardColumnSummary[];
  signatures: ReportCardSignatures;
  updatedAtLabel: string;
  /* v2.8.63.0 — shown on certified sheets. */
  certifiedByName: string;
  certifiedAtLabel: string;
};

/* ── v2.8.63.0 — the Principal's certification view ─────────────────── */

export type PrincipalQueueItem = {
  cardId: number;
  studentName: string;
  admissionNo: string;
  className: string;
  grade: string;
  year: string;
  submittedAtLabel: string;
  updatedLabel: string;
};

export type PrincipalCertifiedItem = {
  cardId: number;
  studentName: string;
  admissionNo: string;
  className: string;
  year: string;
  certifiedAtLabel: string;
  certifiedByName: string;
};

export type PrincipalQueueData = {
  queue: PrincipalQueueItem[];
  recent: PrincipalCertifiedItem[];
  counts: { queue: number; certified: number; returned: number };
  hasSign: boolean;
  hasSeal: boolean;
};

type LmsTeacherRow = typeof lmsTeachers.$inferSelect;
type LmsStudentRow = typeof lmsStudents.$inferSelect;

const MAX_MARK = 999;
const MAX_SUBJECT = 120;
const MAX_REMARK = 600;
const MAX_ATTENDANCE = 30;
const MAX_ROWS = 60;

function avg1dp(total: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((total / count) * 10) / 10;
}

function colomboStamp(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function colomboStampTime(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Append-only audit trail for the certification lifecycle (v2.8.63.0). */
async function recordCardEvent(
  cardId: number,
  actorAccountId: number,
  action: "submit" | "recall" | "certify" | "return",
  note?: string,
): Promise<void> {
  try {
    await db.insert(lmsReportCardEvents).values({
      cardId,
      actorAccountId,
      action,
      note: note ? note.slice(0, 600) : null,
    });
  } catch {
    /* the audit row must never break the transition itself */
  }
}

/* ── Signature names ─────────────────────────────────────────────────── */

/**
 * The principal's name for the signature line. v2.8.63.0 — the ACTIVE
 * Principal portal account (role='principal') is the source of truth;
 * the older settings/CMS chain stays as fallback for schools that
 * haven't created the account yet. Empty string = the paper line simply
 * stays blank, exactly like an unsigned sheet.
 */
async function principalSignatureName(): Promise<string> {
  try {
    const account = await getActivePrincipalAccount();
    if (account?.fullName?.trim()) return account.fullName.trim().slice(0, 120);
  } catch {
    /* fall through to the settings chain */
  }
  try {
    const settings = await getSiteSettings("published");
    for (const key of ["principalName", "principal"]) {
      const value = typeof settings[key] === "string" ? settings[key].trim() : "";
      if (value) return value.slice(0, 80);
    }
  } catch {
    /* settings are optional here */
  }
  try {
    const page = await getCmsPage("home", "published");
    const section = page?.sections.find((s) => s.key === "principal");
    const data = (section?.data ?? {}) as Record<string, unknown>;
    for (const key of ["name", "principalName", "principal", "signature"]) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
    }
  } catch {
    /* absent — the line prints blank, exactly like an unsigned sheet */
  }
  return "";
}

/** Class teacher name: staff register row first, then the account name. */
async function classTeacherSignatureName(teacher: LmsTeacherRow): Promise<string> {
  if (teacher.staffCode) {
    try {
      const [record] = await db
        .select({ fullName: lmsTeacherRecords.fullName })
        .from(lmsTeacherRecords)
        .where(eq(lmsTeacherRecords.teacherId, teacher.staffCode))
        .limit(1);
      if (record?.fullName?.trim()) return record.fullName.trim().slice(0, 80);
    } catch {
      /* fall through to the account name */
    }
  }
  try {
    const [account] = await db
      .select({ fullName: lmsPortalAccounts.fullName })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, teacher.accountId))
      .limit(1);
    return account?.fullName?.trim().slice(0, 80) ?? "";
  } catch {
    return "";
  }
}

/* ── Class reach (the ONLY writers) ──────────────────────────────────── */

async function teacherFromAccount(accountId: number): Promise<LmsTeacherRow | null> {
  return (await ensureLmsPerson("teacher", accountId)) as LmsTeacherRow | null;
}

async function activeRolls(classIds: number[]): Promise<Map<number, number>> {
  if (classIds.length === 0) return new Map();
  const rows = await db
    .select({ classId: lmsEnrollments.classId, count: sql<number>`count(*)::int` })
    .from(lmsEnrollments)
    .where(and(inArray(lmsEnrollments.classId, classIds), eq(lmsEnrollments.status, "active")))
    .groupBy(lmsEnrollments.classId);
  return new Map(rows.map((r) => [r.classId, r.count]));
}

async function guardClassTeacher(
  accountId: number,
  classId: number,
): Promise<{ ok: true; teacher: LmsTeacherRow; cls: typeof lmsClasses.$inferSelect } | { ok: false; error: ReportCardFail }> {
  if (!Number.isInteger(classId) || classId <= 0) return { ok: false, error: "bad_request" };
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "not_class_teacher" };
  const [cls] = await db.select().from(lmsClasses).where(eq(lmsClasses.id, classId)).limit(1);
  if (!cls) return { ok: false, error: "not_found" };
  if (cls.classTeacherId !== teacher.id) return { ok: false, error: "not_class_teacher" };
  return { ok: true, teacher, cls };
}

async function guardCardTeacher(
  accountId: number,
  cardId: number,
): Promise<
  | { ok: true; teacher: LmsTeacherRow; card: typeof lmsReportCards.$inferSelect; cls: typeof lmsClasses.$inferSelect }
  | { ok: false; error: ReportCardFail }
> {
  if (!Number.isInteger(cardId) || cardId <= 0) return { ok: false, error: "bad_request" };
  const teacher = await teacherFromAccount(accountId);
  if (!teacher) return { ok: false, error: "not_class_teacher" };
  const [card] = await db.select().from(lmsReportCards).where(eq(lmsReportCards.id, cardId)).limit(1);
  if (!card) return { ok: false, error: "not_found" };
  const [cls] = await db.select().from(lmsClasses).where(eq(lmsClasses.id, card.classId)).limit(1);
  if (!cls) return { ok: false, error: "not_found" };
  if (cls.classTeacherId !== teacher.id) return { ok: false, error: "not_class_teacher" };
  return { ok: true, teacher, card, cls };
}

/* ── Teacher: classes I lead ─────────────────────────────────────────── */

export async function getTeacherReportClasses(accountId: number): Promise<TeacherReportClass[]> {
  try {
    await ensureSchemaExtras();
    const teacher = await teacherFromAccount(accountId);
    if (!teacher) return [];
    const rows = await db
      .select({
        id: lmsClasses.id,
        name: lmsClasses.name,
        grade: lmsClasses.grade,
        section: lmsClasses.section,
        academicYear: lmsClasses.academicYear,
      })
      .from(lmsClasses)
      .where(eq(lmsClasses.classTeacherId, teacher.id));
    const rolls = await activeRolls(rows.map((r) => r.id));
    return rows
      .map((r) => ({ ...r, roll: rolls.get(r.id) ?? 0 }))
      .sort(
        (a, b) =>
          a.grade.localeCompare(b.grade, "en", { numeric: true }) ||
          a.name.localeCompare(b.name, "en", { numeric: true }),
      );
  } catch {
    return [];
  }
}

/* ── Teacher: one class's roster + card states ───────────────────────── */

export async function getTeacherClassStudents(
  accountId: number,
  classId: number,
): Promise<{ ok: true; data: TeacherClassStudents } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    const guard = await guardClassTeacher(accountId, classId);
    if (!guard.ok) return guard;
    const { cls } = guard;

    const rows = await db
      .select({
        studentId: lmsStudents.id,
        fullName: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
        cardId: lmsReportCards.id,
        cardStatus: lmsReportCards.status,
      })
      .from(lmsEnrollments)
      .innerJoin(lmsStudents, eq(lmsEnrollments.studentId, lmsStudents.id))
      .leftJoin(
        lmsReportCards,
        and(
          eq(lmsReportCards.studentId, lmsStudents.id),
          eq(lmsReportCards.year, cls.academicYear),
        ),
      )
      .where(and(eq(lmsEnrollments.classId, cls.id), eq(lmsEnrollments.status, "active")))
      .orderBy(asc(lmsStudents.fullName));

    const students: TeacherClassStudent[] = rows.map((r) => ({
      studentId: r.studentId,
      fullName: r.fullName,
      admissionNo: r.admissionNo,
      cardId: r.cardId ?? null,
      cardStatus:
        r.cardId == null
          ? "none"
          : r.cardStatus === "certified"
            ? "certified"
            : r.cardStatus === "submitted"
              ? "submitted"
              : "draft",
    }));

    return {
      ok: true,
      data: {
        class: { id: cls.id, name: cls.name, grade: cls.grade, academicYear: cls.academicYear },
        students,
      },
    };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/* ── Teacher: the editor's card-or-template for one student ──────────── */

export async function getReportCardForEdit(
  accountId: number,
  classId: number,
  studentId: number,
): Promise<{ ok: true; data: ReportCardEditData } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    const guard = await guardClassTeacher(accountId, classId);
    if (!guard.ok) return guard;
    const { teacher, cls } = guard;

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return { ok: false, error: "bad_request" };
    }
    const [enrolled] = await db
      .select({ id: lmsEnrollments.id })
      .from(lmsEnrollments)
      .where(
        and(
          eq(lmsEnrollments.classId, cls.id),
          eq(lmsEnrollments.studentId, studentId),
          eq(lmsEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (!enrolled) return { ok: false, error: "not_enrolled" };

    const [student] = await db.select().from(lmsStudents).where(eq(lmsStudents.id, studentId)).limit(1);
    if (!student) return { ok: false, error: "not_found" };

    /* The class's subject template — the paper's pre-printed subject lines. */
    const subjectRows = await db
      .select({ name: lmsSubjects.name })
      .from(lmsClassSubjects)
      .innerJoin(lmsSubjects, eq(lmsClassSubjects.subjectId, lmsSubjects.id))
      .where(eq(lmsClassSubjects.classId, cls.id))
      .orderBy(asc(lmsSubjects.name));
    const classSubjects = subjectRows.map((r) => r.name);

    const [card] = await db
      .select()
      .from(lmsReportCards)
      .where(and(eq(lmsReportCards.studentId, student.id), eq(lmsReportCards.year, cls.academicYear)))
      .limit(1);

    let rows: ReportMarkRow[];
    let terms: ReportTermRow[];
    let status: ReportCardStatus = "draft";

    if (card) {
      status =
        card.status === "certified"
          ? "certified"
          : card.status === "submitted"
            ? "submitted"
            : "draft";
      const markRows = await db
        .select({
          subject: lmsReportMarks.subject,
          position: lmsReportMarks.position,
          m1: lmsReportMarks.m1,
          m2: lmsReportMarks.m2,
          m3: lmsReportMarks.m3,
        })
        .from(lmsReportMarks)
        .where(eq(lmsReportMarks.cardId, card.id))
        .orderBy(asc(lmsReportMarks.position), asc(lmsReportMarks.subject));
      rows = markRows.map((r) => ({ ...r }));
      const termRows = await db
        .select({
          term: lmsReportTerms.term,
          studies: lmsReportTerms.studies,
          conduct: lmsReportTerms.conduct,
          attendance: lmsReportTerms.attendance,
        })
        .from(lmsReportTerms)
        .where(eq(lmsReportTerms.cardId, card.id))
        .orderBy(asc(lmsReportTerms.term));
      const byTerm = new Map(termRows.map((t) => [t.term, t]));
      terms = [1, 2, 3].map((term) => {
        const found = byTerm.get(term);
        return {
          term,
          studies: found?.studies ?? "",
          conduct: found?.conduct ?? "",
          attendance: found?.attendance ?? "",
        };
      });
    } else {
      /* TEMPLATE: the blank sheet exactly as the paper comes off the press. */
      rows = classSubjects.map((subject, i) => ({
        subject,
        position: i + 1,
        m1: null,
        m2: null,
        m3: null,
      }));
      terms = [1, 2, 3].map((term) => ({ term, studies: "", conduct: "", attendance: "" }));
    }

    const [principal, classTeacherName] = await Promise.all([
      principalSignatureName(),
      classTeacherSignatureName(teacher),
    ]);

    return {
      ok: true,
      data: {
        cardId: card?.id ?? null,
        status,
        year: card?.year ?? cls.academicYear,
        grade: card?.grade ?? cls.grade,
        classSubjects,
        rows,
        terms,
        signatures: {
          principal,
          classTeacher: classTeacherName,
          hasPrincipalSign: false,
          hasPrincipalSeal: false,
          hasTeacherSign: false,
        },
        student: { studentId: student.id, fullName: student.fullName, admissionNo: student.admissionNo },
        cls: { id: cls.id, name: cls.name, grade: cls.grade, academicYear: cls.academicYear },
        principalNote: card?.principalNote?.trim() ?? "",
        returnedAtLabel: card?.returnedAt ? colomboStamp(card.returnedAt) : "",
        submittedAtLabel: card?.submittedAt ? colomboStampTime(card.submittedAt) : "",
        certifiedByName: card?.certifiedByName?.trim() ?? "",
        certifiedAtLabel: card?.certifiedAt ? colomboStamp(card.certifiedAt) : "",
      },
    };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/* ── Teacher: save (upsert) one sheet ────────────────────────────────── */

export type SaveReportCardInput = {
  classId?: number;
  studentId?: number;
  year?: string;
  rows?: unknown;
  terms?: unknown;
  /** v2.8.63.0 — true = save AND hand the sheet to the Principal. */
  submit?: boolean;
};

export async function saveReportCard(
  accountId: number,
  input: SaveReportCardInput,
): Promise<{ ok: true; cardId: number; status: ReportCardStatus } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    const classId = Number(input.classId);
    const studentId = Number(input.studentId);
    const guard = await guardClassTeacher(accountId, classId);
    if (!guard.ok) return guard;
    const { cls } = guard;

    if (!Number.isInteger(studentId) || studentId <= 0) return { ok: false, error: "bad_request" };
    const [enrolled] = await db
      .select({ id: lmsEnrollments.id })
      .from(lmsEnrollments)
      .where(
        and(
          eq(lmsEnrollments.classId, cls.id),
          eq(lmsEnrollments.studentId, studentId),
          eq(lmsEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (!enrolled) return { ok: false, error: "not_enrolled" };

    /* Year: the class's academic year by default; an explicit override is
       allowed (a make-up sheet for a past year) but capped to varchar(9). */
    const year = (typeof input.year === "string" ? input.year.trim() : "") || cls.academicYear;
    if (!year || year.length > 9) return { ok: false, error: "bad_request" };

    /* Marks rows: subject lines trimmed, de-duplicated (case-insensitive),
       marks null or integers 0–999. */
    if (!Array.isArray(input.rows) || input.rows.length > MAX_ROWS) {
      return { ok: false, error: "bad_request" };
    }
    const seen = new Set<string>();
    const rows: ReportMarkRow[] = [];
    for (let i = 0; i < input.rows.length; i += 1) {
      const raw = input.rows[i] as { subject?: unknown; m1?: unknown; m2?: unknown; m3?: unknown };
      const subject = typeof raw?.subject === "string" ? raw.subject.trim().slice(0, MAX_SUBJECT) : "";
      if (!subject) return { ok: false, error: "bad_request" };
      const key = subject.toLowerCase();
      if (seen.has(key)) return { ok: false, error: "bad_request" };
      seen.add(key);
      const marks: (number | null)[] = [];
      for (const value of [raw?.m1, raw?.m2, raw?.m3]) {
        if (value == null || value === "") {
          marks.push(null);
          continue;
        }
        const num = Number(value);
        if (!Number.isInteger(num) || num < 0 || num > MAX_MARK) {
          return { ok: false, error: "bad_request" };
        }
        marks.push(num);
      }
      rows.push({ subject, position: i + 1, m1: marks[0], m2: marks[1], m3: marks[2] });
    }

    /* Term blocks: 1..3, remarks trimmed and length-capped. */
    if (!Array.isArray(input.terms) || input.terms.length > 3) {
      return { ok: false, error: "bad_request" };
    }
    const byTerm = new Map<number, { studies: string; conduct: string; attendance: string }>();
    for (const raw of input.terms as unknown[]) {
      const t = raw as { term?: unknown; studies?: unknown; conduct?: unknown; attendance?: unknown };
      const term = Number(t?.term);
      if (!Number.isInteger(term) || term < 1 || term > 3 || byTerm.has(term)) {
        return { ok: false, error: "bad_request" };
      }
      const clean = (value: unknown, max: number) =>
        typeof value === "string" ? value.trim().slice(0, max) : "";
      byTerm.set(term, {
        studies: clean(t?.studies, MAX_REMARK),
        conduct: clean(t?.conduct, MAX_REMARK),
        attendance: clean(t?.attendance, MAX_ATTENDANCE),
      });
    }
    const terms = [1, 2, 3].map((term) => ({
      term,
      studies: byTerm.get(term)?.studies ?? "",
      conduct: byTerm.get(term)?.conduct ?? "",
      attendance: byTerm.get(term)?.attendance ?? "",
    }));

    /* v2.8.63.0 — submit = save AND hand the sheet to the Principal. A
       submitted or certified sheet is LOCKED for editing: the teacher must
       Recall it (or ask the Principal to return it) before changing marks. */
    const submit = input.submit === true;

    const [existing] = await db
      .select({ id: lmsReportCards.id, status: lmsReportCards.status })
      .from(lmsReportCards)
      .where(and(eq(lmsReportCards.studentId, studentId), eq(lmsReportCards.year, year)))
      .limit(1);

    if (existing && existing.status !== "draft") {
      return { ok: false, error: "locked" };
    }
    const status: ReportCardStatus = submit ? "submitted" : "draft";

    const cardId = await db.transaction(async (tx) => {
      let id: number;
      if (existing) {
        /* Move-safe: if the student changed classes mid-year the sheet
           follows them to the class whose teacher is saving it. */
        await tx
          .update(lmsReportCards)
          .set({
            classId: cls.id,
            grade: cls.grade,
            status,
            updatedAt: new Date(),
            ...(submit
              ? { submittedAt: new Date(), returnedAt: null, principalNote: null }
              : {}),
          })
          .where(eq(lmsReportCards.id, existing.id));
        id = existing.id;
      } else {
        const [created] = await tx
          .insert(lmsReportCards)
          .values({
            studentId,
            classId: cls.id,
            year,
            grade: cls.grade,
            status,
            createdByAccountId: accountId,
            ...(submit ? { submittedAt: new Date() } : {}),
          })
          .returning({ id: lmsReportCards.id });
        id = created.id;
      }

      /* DELETE + reinsert keeps the (card_id, subject) / (card_id, term)
         unique indexes honest — a re-save is a clean rewrite, exactly like
         re-printing the sheet. */
      await tx.delete(lmsReportMarks).where(eq(lmsReportMarks.cardId, id));
      if (rows.length > 0) {
        await tx.insert(lmsReportMarks).values(
          rows.map((r) => ({ cardId: id, subject: r.subject, position: r.position, m1: r.m1, m2: r.m2, m3: r.m3 })),
        );
      }
      await tx.delete(lmsReportTerms).where(eq(lmsReportTerms.cardId, id));
      await tx.insert(lmsReportTerms).values(terms.map((t) => ({ cardId: id, ...t })));
      return id;
    });

    if (submit) {
      await recordCardEvent(cardId, accountId, "submit");
    }

    return { ok: true, cardId, status };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/* ── v2.8.63.0 — the certification lifecycle ─────────────────────────── */

/**
 * Teacher: hand a DRAFT sheet to the Principal. The sheet freezes here —
 * no more edits until it is recalled or returned.
 */
export async function submitReportCard(
  accountId: number,
  cardId: number,
): Promise<{ ok: true; cardId: number; status: ReportCardStatus } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    const guard = await guardCardTeacher(accountId, cardId);
    if (!guard.ok) return guard;
    const { card } = guard;
    if (card.status !== "draft") return { ok: false, error: "wrong_state" };
    await db
      .update(lmsReportCards)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        returnedAt: null,
        principalNote: null,
        updatedAt: new Date(),
      })
      .where(eq(lmsReportCards.id, cardId));
    await recordCardEvent(cardId, accountId, "submit");
    return { ok: true, cardId, status: "submitted" };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/** Teacher: pull a SUBMITTED sheet back to draft (before certification). */
export async function recallReportCard(
  accountId: number,
  cardId: number,
): Promise<{ ok: true; cardId: number; status: ReportCardStatus } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    const guard = await guardCardTeacher(accountId, cardId);
    if (!guard.ok) return guard;
    const { card } = guard;
    if (card.status !== "submitted") return { ok: false, error: "wrong_state" };
    await db
      .update(lmsReportCards)
      .set({ status: "draft", submittedAt: null, updatedAt: new Date() })
      .where(eq(lmsReportCards.id, cardId));
    await recordCardEvent(cardId, accountId, "recall");
    return { ok: true, cardId, status: "draft" };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/**
 * Principal: certify a SUBMITTED sheet. The Principal's signature + seal
 * must already be uploaded — the stamps are placed server-side on every
 * certified read afterwards. The certifying name is snapshotted so the
 * printed line never drifts from who actually certified.
 */
export async function certifyReportCard(
  accountId: number,
  cardId: number,
): Promise<{ ok: true; cardId: number; status: ReportCardStatus } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    if (!Number.isInteger(cardId) || cardId <= 0) return { ok: false, error: "bad_request" };
    const [principalAccount] = await db
      .select({ id: lmsPortalAccounts.id, fullName: lmsPortalAccounts.fullName, role: lmsPortalAccounts.role })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, accountId))
      .limit(1);
    if (!principalAccount || principalAccount.role !== "principal" || !principalAccount.fullName?.trim()) {
      return { ok: false, error: "forbidden" };
    }

    const [card] = await db
      .select({ id: lmsReportCards.id, status: lmsReportCards.status })
      .from(lmsReportCards)
      .where(eq(lmsReportCards.id, cardId))
      .limit(1);
    if (!card) return { ok: false, error: "not_found" };
    if (card.status !== "submitted") return { ok: false, error: "wrong_state" };

    const presence = await stampPresence([principalAccount.id]);
    const own = presence.get(principalAccount.id);
    if (!own?.sign || !own?.seal) {
      return { ok: false, error: "signature_missing" };
    }

    await db
      .update(lmsReportCards)
      .set({
        status: "certified",
        certifiedAt: new Date(),
        certifiedByAccountId: principalAccount.id,
        certifiedByName: principalAccount.fullName.trim().slice(0, 120),
        principalNote: null,
        returnedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(lmsReportCards.id, cardId));
    await recordCardEvent(cardId, accountId, "certify");
    return { ok: true, cardId, status: "certified" };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/**
 * Principal: return a sheet (submitted OR certified) to the class teacher
 * with a note. This is the only way a certified sheet ever changes — the
 * top-of-school authority, audited.
 */
export async function returnReportCard(
  accountId: number,
  cardId: number,
  note: string,
): Promise<{ ok: true; cardId: number; status: ReportCardStatus } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    if (!Number.isInteger(cardId) || cardId <= 0) return { ok: false, error: "bad_request" };
    const [principalAccount] = await db
      .select({ id: lmsPortalAccounts.id, role: lmsPortalAccounts.role })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, accountId))
      .limit(1);
    if (!principalAccount || principalAccount.role !== "principal") {
      return { ok: false, error: "forbidden" };
    }

    const cleanNote = typeof note === "string" ? note.trim().slice(0, 600) : "";
    if (!cleanNote) return { ok: false, error: "bad_request" };

    const [card] = await db
      .select({ id: lmsReportCards.id, status: lmsReportCards.status })
      .from(lmsReportCards)
      .where(eq(lmsReportCards.id, cardId))
      .limit(1);
    if (!card) return { ok: false, error: "not_found" };
    if (card.status === "draft") return { ok: false, error: "wrong_state" };

    await db
      .update(lmsReportCards)
      .set({
        status: "draft",
        submittedAt: null,
        certifiedAt: null,
        certifiedByAccountId: null,
        certifiedByName: null,
        principalNote: cleanNote,
        returnedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(lmsReportCards.id, cardId));
    await recordCardEvent(cardId, accountId, "return", cleanNote);
    return { ok: true, cardId, status: "draft" };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

export async function deleteReportCard(
  accountId: number,
  cardId: number,
): Promise<{ ok: true; cardId: number } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    const guard = await guardCardTeacher(accountId, cardId);
    if (!guard.ok) return guard;
    /* v2.8.63.0 — a submitted sheet must be recalled first; a certified
       sheet is the school's record and can only be returned by the
       Principal (who may then let the teacher delete the draft). */
    if (guard.card.status !== "draft") return { ok: false, error: "locked" };
    await db.transaction(async (tx) => {
      await tx.delete(lmsReportMarks).where(eq(lmsReportMarks.cardId, cardId));
      await tx.delete(lmsReportTerms).where(eq(lmsReportTerms.cardId, cardId));
      await tx.delete(lmsReportCardEvents).where(eq(lmsReportCardEvents.cardId, cardId));
      await tx.delete(lmsReportCards).where(eq(lmsReportCards.id, cardId));
    });
    return { ok: true, cardId };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/* ── Student / parent: list certified sheets ─────────────────────────── */

async function certifiedCardsForStudents(
  studentIds: number[],
): Promise<(StudentReportCardRef & { studentId: number })[]> {
  if (studentIds.length === 0) return [];
  const rows = await db
    .select({
      cardId: lmsReportCards.id,
      year: lmsReportCards.year,
      grade: lmsReportCards.grade,
      studentId: lmsReportCards.studentId,
      className: lmsClasses.name,
      updatedAt: lmsReportCards.updatedAt,
    })
    .from(lmsReportCards)
    .leftJoin(lmsClasses, eq(lmsReportCards.classId, lmsClasses.id))
    .where(and(inArray(lmsReportCards.studentId, studentIds), eq(lmsReportCards.status, "certified")))
    .orderBy(desc(lmsReportCards.year), desc(lmsReportCards.id));
  return rows.map((r) => ({
    cardId: r.cardId,
    studentId: r.studentId,
    year: r.year,
    grade: r.grade,
    className: r.className ?? "",
    updatedAt: colomboStamp(r.updatedAt),
  }));
}

export async function getStudentReportCards(accountId: number, email = ""): Promise<StudentReportCardRef[]> {
  try {
    await ensureSchemaExtras();
    const student = (await ensureLmsPerson("student", accountId, email)) as LmsStudentRow | null;
    if (!student) return [];
    return await certifiedCardsForStudents([student.id]);
  } catch {
    return [];
  }
}

export async function getParentChildrenReportCards(accountId: number): Promise<ParentChildReportCards[]> {
  try {
    await ensureSchemaExtras();
    const children = await getLinkedChildren(accountId);
    if (children.length === 0) return [];
    const cards = await certifiedCardsForStudents(children.map((c) => c.studentId));
    return children.map((child) => ({
      child,
      cards: cards
        .filter((c) => c.studentId === child.studentId)
        .map(({ studentId: _studentId, ...card }) => card),
    }));
  } catch {
    return [];
  }
}

/* ── THE reader: one full sheet ──────────────────────────────────────── */

export async function getReportCardView(
  cardId: number,
  opts: { role: "student" | "teacher" | "parent" | "principal"; accountId: number },
): Promise<{ ok: true; card: ReportCardView } | { ok: false; error: ReportCardFail }> {
  try {
    await ensureSchemaExtras();
    if (!Number.isInteger(cardId) || cardId <= 0) return { ok: false, error: "not_found" };

    const [card] = await db.select().from(lmsReportCards).where(eq(lmsReportCards.id, cardId)).limit(1);
    if (!card) return { ok: false, error: "not_found" };
    const [cls] = await db.select().from(lmsClasses).where(eq(lmsClasses.id, card.classId)).limit(1);
    const [student] = await db.select().from(lmsStudents).where(eq(lmsStudents.id, card.studentId)).limit(1);
    if (!cls || !student) return { ok: false, error: "not_found" };

    /* Guards — v2.8.63.0 policy:
       student → own card + CERTIFIED only; parent → linked child +
       CERTIFIED only; teacher → the class teacher (any state, so they can
       work on drafts); principal → submitted + certified (drafts stay the
       teacher's private workspace until handed over). */
    if (opts.role === "teacher") {
      const teacher = await teacherFromAccount(opts.accountId);
      if (!teacher || cls.classTeacherId !== teacher.id) return { ok: false, error: "forbidden" };
    } else if (opts.role === "principal") {
      const [principalAccount] = await db
        .select({ role: lmsPortalAccounts.role })
        .from(lmsPortalAccounts)
        .where(eq(lmsPortalAccounts.id, opts.accountId))
        .limit(1);
      if (!principalAccount || principalAccount.role !== "principal") {
        return { ok: false, error: "forbidden" };
      }
      if (card.status === "draft") return { ok: false, error: "forbidden" };
    } else if (card.status !== "certified") {
      return { ok: false, error: "forbidden" };
    } else if (opts.role === "student") {
      const self = (await ensureLmsPerson("student", opts.accountId)) as LmsStudentRow | null;
      if (!self || self.id !== card.studentId) return { ok: false, error: "forbidden" };
    } else {
      const child = await getLinkedChild(opts.accountId, card.studentId);
      if (!child) return { ok: false, error: "forbidden" };
    }

    const markRows = await db
      .select({
        subject: lmsReportMarks.subject,
        position: lmsReportMarks.position,
        m1: lmsReportMarks.m1,
        m2: lmsReportMarks.m2,
        m3: lmsReportMarks.m3,
      })
      .from(lmsReportMarks)
      .where(eq(lmsReportMarks.cardId, card.id))
      .orderBy(asc(lmsReportMarks.position), asc(lmsReportMarks.subject));

    const termRows = await db
      .select({
        term: lmsReportTerms.term,
        studies: lmsReportTerms.studies,
        conduct: lmsReportTerms.conduct,
        attendance: lmsReportTerms.attendance,
      })
      .from(lmsReportTerms)
      .where(eq(lmsReportTerms.cardId, card.id))
      .orderBy(asc(lmsReportTerms.term));
    const termByNo = new Map(termRows.map((t) => [t.term, t]));
    const terms: ReportTermRow[] = [1, 2, 3].map((term) => ({
      term,
      studies: termByNo.get(term)?.studies ?? "",
      conduct: termByNo.get(term)?.conduct ?? "",
      attendance: termByNo.get(term)?.attendance ?? "",
    }));

    /* ── Summary rows — computed, never stored ─────────────────────────
       This card's per-column totals/averages come from its own marks.
       Class stats (First-in-class average + Position) come from the
       CERTIFIED sheets of the same class + year only. */
    const perColumn = (marks: { m1: number | null; m2: number | null; m3: number | null }[]) => {
      const agg = [
        { total: 0, count: 0 },
        { total: 0, count: 0 },
        { total: 0, count: 0 },
      ];
      for (const m of marks) {
        for (let i = 0; i < 3; i += 1) {
          const value = i === 0 ? m.m1 : i === 1 ? m.m2 : m.m3;
          if (value != null) {
            agg[i].total += value;
            agg[i].count += 1;
          }
        }
      }
      return agg;
    };

    const own = perColumn(markRows);

    const certifiedMarks = await db
      .select({ cardId: lmsReportCards.id, m1: lmsReportMarks.m1, m2: lmsReportMarks.m2, m3: lmsReportMarks.m3 })
      .from(lmsReportCards)
      .innerJoin(lmsReportMarks, eq(lmsReportMarks.cardId, lmsReportCards.id))
      .where(
        and(
          eq(lmsReportCards.classId, cls.id),
          eq(lmsReportCards.year, card.year),
          eq(lmsReportCards.status, "certified"),
        ),
      );
    const certifiedByCard = new Map<number, { m1: number | null; m2: number | null; m3: number | null }[]>();
    for (const row of certifiedMarks) {
      const list = certifiedByCard.get(row.cardId) ?? [];
      list.push({ m1: row.m1, m2: row.m2, m3: row.m3 });
      certifiedByCard.set(row.cardId, list);
    }
    /* One average per certified card per column. */
    const certifiedAverages: ({ average: number | null } | undefined)[][] = [0, 1, 2].map(() => []);
    for (const [, marks] of certifiedByCard) {
      const agg = perColumn(marks);
      for (let i = 0; i < 3; i += 1) certifiedAverages[i].push({ average: avg1dp(agg[i].total, agg[i].count) });
    }

    const classSizeRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lmsEnrollments)
      .where(and(eq(lmsEnrollments.classId, cls.id), eq(lmsEnrollments.status, "active")));

    const summary: ReportCardColumnSummary[] = own.map((agg, i) => {
      const average = avg1dp(agg.total, agg.count);
      /* Only cards that actually carry a value in this column compete. */
      const averages = certifiedAverages[i]
        .map((a) => a?.average)
        .filter((v): v is number => v != null);
      const firstInClass = averages.length > 0 ? Math.max(...averages) : null;
      /* Rank THIS card's column average among every certified card's
         average that has a value in the column (1 = highest; competition
         ranking, so ties share the position). A draft sheet ranks against
         the certified field without joining it. */
      let position: number | null = null;
      if (average != null) {
        const field =
          card.status === "certified" ? averages : [...averages, average];
        const better = field.filter((v) => v > average).length;
        position = better + 1;
      }
      return { total: agg.total, count: agg.count, average, firstInClass, position };
    });

    const principal = await principalSignatureName();
    let classTeacherName = "";
    let teacherAccountId: number | null = null;
    if (cls.classTeacherId) {
      const [t] = await db
        .select()
        .from(lmsTeachers)
        .where(eq(lmsTeachers.id, cls.classTeacherId))
        .limit(1);
      if (t) {
        teacherAccountId = t.accountId ?? null;
        classTeacherName = await classTeacherSignatureName(t);
      }
    }

    /* v2.8.63.0 — stamp flags: a certified sheet checks the certifying
       Principal's signature+seal and the class teacher's signature. The
       bytes themselves are served by the session-gated signature route. */
    let hasPrincipalSign = false;
    let hasPrincipalSeal = false;
    let hasTeacherSign = false;
    if (card.status === "certified") {
      const presenceAccounts = [card.certifiedByAccountId, teacherAccountId].filter(
        (id): id is number => typeof id === "number" && Number.isInteger(id),
      );
      const presence = await stampPresence(presenceAccounts);
      if (card.certifiedByAccountId != null) {
        const own = presence.get(card.certifiedByAccountId);
        hasPrincipalSign = own?.sign ?? false;
        hasPrincipalSeal = own?.seal ?? false;
      }
      if (teacherAccountId != null) {
        hasTeacherSign = presence.get(teacherAccountId)?.sign ?? false;
      }
    }

    return {
      ok: true,
      card: {
        cardId: card.id,
        status:
          card.status === "certified"
            ? "certified"
            : card.status === "submitted"
              ? "submitted"
              : "draft",
        year: card.year,
        grade: card.grade,
        student: { studentId: student.id, fullName: student.fullName, admissionNo: student.admissionNo },
        cls: { id: cls.id, name: cls.name, grade: cls.grade, academicYear: cls.academicYear },
        classSize: classSizeRows[0]?.count ?? 0,
        rows: markRows.map((r) => ({ ...r })),
        terms,
        summary,
        signatures: {
          principal: card.status === "certified" && card.certifiedByName?.trim()
            ? card.certifiedByName.trim()
            : principal,
          classTeacher: classTeacherName,
          hasPrincipalSign,
          hasPrincipalSeal,
          hasTeacherSign,
        },
        updatedAtLabel: colomboStamp(card.updatedAt),
        certifiedByName: card.certifiedByName?.trim() ?? "",
        certifiedAtLabel: card.certifiedAt ? colomboStamp(card.certifiedAt) : "",
      },
    };
  } catch {
    return { ok: false, error: "server_error" };
  }
}

/* ── Principal: the certification queue ──────────────────────────────── */

export async function getPrincipalQueue(accountId: number): Promise<PrincipalQueueData> {
  const empty: PrincipalQueueData = {
    queue: [],
    recent: [],
    counts: { queue: 0, certified: 0, returned: 0 },
    hasSign: false,
    hasSeal: false,
  };
  try {
    await ensureSchemaExtras();
    const [principalAccount] = await db
      .select({ id: lmsPortalAccounts.id, role: lmsPortalAccounts.role })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, accountId))
      .limit(1);
    if (!principalAccount || principalAccount.role !== "principal") return empty;

    const queueRows = await db
      .select({
        cardId: lmsReportCards.id,
        studentName: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
        className: lmsClasses.name,
        grade: lmsReportCards.grade,
        year: lmsReportCards.year,
        submittedAt: lmsReportCards.submittedAt,
        updatedAt: lmsReportCards.updatedAt,
      })
      .from(lmsReportCards)
      .innerJoin(lmsStudents, eq(lmsReportCards.studentId, lmsStudents.id))
      .leftJoin(lmsClasses, eq(lmsReportCards.classId, lmsClasses.id))
      .where(eq(lmsReportCards.status, "submitted"))
      .orderBy(asc(lmsReportCards.submittedAt));

    const recentRows = await db
      .select({
        cardId: lmsReportCards.id,
        studentName: lmsStudents.fullName,
        admissionNo: lmsStudents.admissionNo,
        className: lmsClasses.name,
        year: lmsReportCards.year,
        certifiedAt: lmsReportCards.certifiedAt,
        certifiedByName: lmsReportCards.certifiedByName,
      })
      .from(lmsReportCards)
      .innerJoin(lmsStudents, eq(lmsReportCards.studentId, lmsStudents.id))
      .leftJoin(lmsClasses, eq(lmsReportCards.classId, lmsClasses.id))
      .where(eq(lmsReportCards.status, "certified"))
      .orderBy(desc(lmsReportCards.certifiedAt))
      .limit(20);

    const [certifiedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lmsReportCards)
      .where(eq(lmsReportCards.status, "certified"));
    const [returnedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(lmsReportCards)
      .where(and(eq(lmsReportCards.status, "draft"), sql`${lmsReportCards.returnedAt} is not null`));

    const presence = await stampPresence([principalAccount.id]);
    const own = presence.get(principalAccount.id);

    return {
      queue: queueRows.map((r) => ({
        cardId: r.cardId,
        studentName: r.studentName,
        admissionNo: r.admissionNo,
        className: r.className ?? "",
        grade: r.grade,
        year: r.year,
        submittedAtLabel: colomboStampTime(r.submittedAt),
        updatedLabel: colomboStamp(r.updatedAt),
      })),
      recent: recentRows.map((r) => ({
        cardId: r.cardId,
        studentName: r.studentName,
        admissionNo: r.admissionNo,
        className: r.className ?? "",
        year: r.year,
        certifiedAtLabel: colomboStamp(r.certifiedAt),
        certifiedByName: r.certifiedByName ?? "",
      })),
      counts: {
        queue: queueRows.length,
        certified: certifiedCount?.count ?? 0,
        returned: returnedCount?.count ?? 0,
      },
      hasSign: own?.sign ?? false,
      hasSeal: own?.seal ?? false,
    };
  } catch {
    return empty;
  }
}
