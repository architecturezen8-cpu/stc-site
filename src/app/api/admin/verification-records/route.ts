import { NextResponse } from "next/server";
import { desc, eq, inArray, isNull, ne, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsClasses,
  lmsEnrollments,
  lmsPortalAccounts,
  lmsPortalSessions,
  lmsStudentRecords,
  lmsStudents,
  lmsTeacherRecords,
  lmsTeachers,
} from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureStudentPersonByAdmissionNo } from "@/lib/lms-identity";
import { studentAccountEmail } from "@/lib/verification";
import { ensureSchemaExtras } from "@/lib/schema-extras";

/* ────────────────────────────────────────────────────────────────────────
   Admin → Verification Records — the OFFICE REGISTERS used to verify
   self-registrations. Students: admission no, register no, class, name,
   father & mother names. Teachers: teacher ID, name, email.

   v2.9.16.0 (task 3-b) — PROPER DELETE FLOW + EDITABLE EXTRA DETAILS:
   · GET list rows now carry `portalAccountEmail` (null = no LIVE portal
     account) computed in ONE extra IN query; GET ?type=…&id=… returns ONE
     row with extraData pre-parsed + the same flag, so dialogs always work
     from current server truth.
   · PATCH accepts `extraData` ({field: value} pairs) — the Edit dialog's
     key/value editor; same caps as the Excel import (≤30 pairs, values
     ≤200 chars, keys trimmed ≤60). Absent = untouched, older callers
     keep working.
   · DELETE gains `withAccount=1`: the row's linked portal account (login
     email + role, still live) is SOFT-deleted (deletedAt=now, restorable
     from the trash) and its sessions end — one `portal_user_trashed`
     audit row each. Responses report `trashedAccount` (single) /
     `trashedAccounts` (batch counts).

   GET    ?type=all            → { students, teachers }
   POST   { type, ...fields }  → create one register row
   PATCH  { type, id, ... }    → v2.8.48.0 EDIT one register row — identity
                                 fields (admissionNo / teacherId) are LOCKED;
                                 a class change moves the enrollment so the
                                 attendance roster follows (calm fallback: the
                                 office can still re-enroll from LMS Setup).
   DELETE ?type=student&id=1   → remove one register row
   ──────────────────────────────────────────────────────────────────────── */

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";

/* v2.9.13.0 — the owner: "email ekai, phone number ekai optional danna epa
   eka required karanna" — every ADD and EDIT now demands a valid email and
   phone for BOTH registers (the Excel import keeps its own lenient rules). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;

/** Friendly duplicate message when a register ID is already taken. */
function duplicateReply(error: unknown, what: string): NextResponse | null {
  const pgCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
  const message = error instanceof Error ? error.message : "";
  if (pgCode === "23505" || message.includes("duplicate key")) {
    return NextResponse.json({ error: `That ${what} is already on the register.` }, { status: 409 });
  }
  return null;
}

/* ── v2.9.16.0 (task 3-b) — PORTAL-ACCOUNT LINKAGE + EXTRA DETAILS ───────
   The delete flow and the Edit dialog both need to know whether a register
   row has a LIVE (not yet trashed) portal login. One shared lookup keeps
   the GET report and the DELETE trash action in agreement — the checkbox
   the office sees is exactly the account that gets trashed. */

/** Live (non-trashed) portal account's login email for a register row, or
 *  null when no account matches. Emails compare case-insensitively. */
async function livePortalAccountEmail(
  role: "student" | "teacher",
  email: string,
): Promise<string | null> {
  const value = email.trim().toLowerCase();
  if (!value) return null;
  const [account] = await db
    .select({ email: lmsPortalAccounts.email })
    .from(lmsPortalAccounts)
    .where(
      and(
        eq(lmsPortalAccounts.role, role),
        sql`lower(${lmsPortalAccounts.email}) = ${value}`,
        isNull(lmsPortalAccounts.deletedAt),
      ),
    )
    .limit(1);
  return account?.email ?? null;
}

/** Soft-delete the LIVE portal accounts matching `emails` (same role) and
 *  end their sessions — the system-wide trash pattern (deletedAt=now, the
 *  rows wait restorable in Portal Users). One audit row per account.
 *  Returns how many accounts were actually trashed. */
async function trashPortalAccounts(
  userId: number,
  role: "student" | "teacher",
  emails: string[],
): Promise<number> {
  const wanted = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];
  if (wanted.length === 0) return 0;
  const accounts = await db
    .select({ id: lmsPortalAccounts.id })
    .from(lmsPortalAccounts)
    .where(
      and(
        eq(lmsPortalAccounts.role, role),
        sql`lower(${lmsPortalAccounts.email}) in (${sql.join(
          wanted.map((e) => sql`${e}`),
          sql`, `,
        )})`,
        isNull(lmsPortalAccounts.deletedAt),
      ),
    );
  if (accounts.length === 0) return 0;
  const accountIds = accounts.map((a) => a.id);
  await db
    .update(lmsPortalAccounts)
    .set({ deletedAt: new Date() })
    .where(inArray(lmsPortalAccounts.id, accountIds));
  /* Sign out EVERY device — a trashed account keeps no live sessions. */
  await db
    .delete(lmsPortalSessions)
    .where(inArray(lmsPortalSessions.accountId, accountIds));
  for (const accountId of accountIds) {
    await db.insert(adminAuditLogs).values({
      userId,
      action: "portal_user_trashed",
      entity: "lms_portal_account",
      entityId: String(accountId),
    });
  }
  return accountIds.length;
}

/* Extra-detail caps — mirror the Excel import's own limits exactly. */
const EXTRA_MAX_KEYS = 30;
const EXTRA_KEY_MAX = 60;
const EXTRA_VALUE_MAX = 200;

/** The Edit dialog's key/value editor sends the FULL pair list. Every key
 *  is trimmed (empty keys dropped), values trimmed to 200 chars, at most
 *  30 pairs — the same funnel the import path uses. Returns null when no
 *  pairs survive, so clearing every field wipes the stored extras. */
function sanitizeExtraData(
  raw: unknown,
): { provided: false } | { provided: true; data: string | null; error?: string } {
  if (raw === undefined) return { provided: false };
  if (raw === null) return { provided: true, data: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      provided: true,
      data: null,
      error: "Extra details must be field names and values.",
    };
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key).trim().slice(0, EXTRA_KEY_MAX);
    if (!k) continue;
    const v = String(value ?? "").trim().slice(0, EXTRA_VALUE_MAX);
    if (!v) continue; /* an empty value is not a detail worth keeping */
    out[k] = v;
    if (Object.keys(out).length >= EXTRA_MAX_KEYS) break;
  }
  return {
    provided: true,
    data: Object.keys(out).length > 0 ? JSON.stringify(out) : null,
  };
}

/** The stored extra_data JSON → a clean {field: value} object (or null).
 *  Used where the API hands ONE record to a dialog rather than a list. */
function parseExtraJson(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const k = String(key).trim();
      if (!k) continue;
      out[k] = String(value ?? "").slice(0, EXTRA_VALUE_MAX);
      if (Object.keys(out).length >= EXTRA_MAX_KEYS) break;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const denied = await guardPortalOrLmsAdmin("read");
  if (denied instanceof NextResponse) return denied;
  await ensureSchemaExtras();

  const url = new URL(req.url);
  const singleType = url.searchParams.get("type");
  const singleIdRaw = url.searchParams.get("id");

  /* v2.9.16.0 — ONE record (dialog refresh): the row + portalAccountEmail +
     extraData pre-parsed, so the Edit dialog and the delete modal work
     from the CURRENT server truth even on a freshly loaded page (whose
     payload omits those two fields). */
  if ((singleType === "student" || singleType === "teacher") && singleIdRaw !== null) {
    const singleId = Number(singleIdRaw);
    if (!Number.isInteger(singleId) || singleId <= 0) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (singleType === "student") {
      const [row] = await db
        .select()
        .from(lmsStudentRecords)
        .where(eq(lmsStudentRecords.id, singleId))
        .limit(1);
      if (!row) {
        return NextResponse.json({ error: "Student record not found." }, { status: 404 });
      }
      const portalAccountEmail = await livePortalAccountEmail(
        "student",
        studentAccountEmail(row.admissionNo),
      ).catch(() => null);
      return NextResponse.json({
        student: {
          ...row,
          extraData: parseExtraJson(row.extraData),
          portalAccountEmail,
        },
      });
    }
    const [row] = await db
      .select()
      .from(lmsTeacherRecords)
      .where(eq(lmsTeacherRecords.id, singleId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Teacher record not found." }, { status: 404 });
    }
    const portalAccountEmail = await livePortalAccountEmail(
      "teacher",
      row.email ?? "",
    ).catch(() => null);
    return NextResponse.json({
      teacher: {
        ...row,
        extraData: parseExtraJson(row.extraData),
        portalAccountEmail,
      },
    });
  }

  const [students, teachers] = await Promise.all([
    db.select().from(lmsStudentRecords).orderBy(desc(lmsStudentRecords.id)).limit(1000),
    db.select().from(lmsTeacherRecords).orderBy(desc(lmsTeacherRecords.id)).limit(1000),
  ]);

  /* v2.9.16.0 — ONE efficient query for the whole list: collect every
     candidate login email (the students' synthetic adm-… address / the
     teacher's own email), then one IN query over the LIVE portal accounts.
     Each row reports `portalAccountEmail` (null = no live account) so the
     delete modal only offers the trash checkbox when it can act on it. */
  const studentEmails = [
    ...new Set(students.map((r) => studentAccountEmail(r.admissionNo))),
  ];
  const teacherEmails = [
    ...new Set(
      teachers
        .map((r) => (r.email ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const allEmails = [...studentEmails, ...teacherEmails];
  const liveKeys = new Set<string>();
  if (allEmails.length > 0) {
    const live = await db
      .select({ email: lmsPortalAccounts.email, role: lmsPortalAccounts.role })
      .from(lmsPortalAccounts)
      .where(
        and(
          sql`lower(${lmsPortalAccounts.email}) in (${sql.join(
            allEmails.map((e) => sql`${e.toLowerCase()}`),
            sql`, `,
          )})`,
          inArray(lmsPortalAccounts.role, ["student", "teacher"]),
          isNull(lmsPortalAccounts.deletedAt),
        ),
      )
      .catch(() => [] as { email: string; role: string }[]);
    for (const account of live) {
      liveKeys.add(`${account.role}|${account.email.toLowerCase()}`);
    }
  }

  return NextResponse.json({
    students: students.map((r) => {
      const email = studentAccountEmail(r.admissionNo);
      return {
        ...r,
        portalAccountEmail: liveKeys.has(`student|${email}`) ? email : null,
      };
    }),
    teachers: teachers.map((r) => {
      const email = (r.email ?? "").trim().toLowerCase();
      return {
        ...r,
        portalAccountEmail: email && liveKeys.has(`teacher|${email}`) ? email : null,
      };
    }),
  });
}

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const type = clean(body.type, 10);

  try {
    if (type === "student") {
      const admissionNo = clean(body.admissionNo, 40);
      const fullName = clean(body.fullName, 120);
      const className = clean(body.className, 40);
      /* v2.8.62.0 — the owner: "godak welawata thawa details danna wenawa"
         — the register row needs only the essentials; parents/contact are
         optional and can be added later with Edit. Stored as "" (the
         columns are NOT NULL), and the register matcher skips blanks. */
      const fatherName = clean(body.fatherName, 120);
      const motherName = clean(body.motherName, 120);
      const registerNo = clean(body.registerNo, 40) || null;
      const phone = clean(body.phone, 30);
      const email = clean(body.email, 180).toLowerCase();

      /* v2.9.13.0 — email + phone are REQUIRED (owner request); both are
         format-checked so the office can't save an unreachable record. */
      if (!admissionNo || !fullName || !className) {
        return NextResponse.json(
          { error: "Admission number, name and class are required." },
          { status: 400 },
        );
      }
      if (!phone || !PHONE_RE.test(phone) || !email || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { error: "A valid phone number and email are required for every student." },
          { status: 400 },
        );
      }

      const [created] = await db
        .insert(lmsStudentRecords)
        .values({
          admissionNo,
          registerNo,
          fullName,
          className,
          fatherName,
          motherName,
          phone,
          email,
        })
        .returning();

      /* v2.8.37.1 — a NEW register student is attendance-ready AT ONCE:
         materialize the lms_students person row and enroll them into the
         class named on the register (no account needed — attendance is
         roster-driven). Calm on failure: the office can still enroll
         manually from LMS Setup → Enrollment. */
      let autoEnrolledInto: string | null = null;
      try {
        const person = await ensureStudentPersonByAdmissionNo(created.admissionNo, null);
        if (person) {
          const [enrollment] = await db
            .select({ classId: lmsEnrollments.classId })
            .from(lmsEnrollments)
            .where(eq(lmsEnrollments.studentId, person.id))
            .limit(1);
          if (enrollment) autoEnrolledInto = className;
        }
      } catch {
        /* calm degradation — manual enrollment stays available */
      }

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "student_record_created",
        entity: "lms_student_records",
        entityId: String(created.id),
      });
      /* v2.9.16.0 — report the row's live portal account (if any) so the
         delete modal's trash checkbox is accurate from the first render. */
      const portalAccountEmail = await livePortalAccountEmail(
        "student",
        studentAccountEmail(created.admissionNo),
      ).catch(() => null);
      return NextResponse.json({
        student: { ...created, portalAccountEmail },
        autoEnrolledInto,
      });
    }

    if (type === "teacher") {
      const teacherId = clean(body.teacherId, 40);
      const fullName = clean(body.fullName, 120);
      const email = clean(body.email, 180).toLowerCase();
      const phone = clean(body.phone, 30);
      const designation = clean(body.designation, 120) || null;

      if (!teacherId || !fullName) {
        return NextResponse.json(
          { error: "Teacher ID and full name are required." },
          { status: 400 },
        );
      }
      if (!phone || !PHONE_RE.test(phone) || !email || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { error: "A valid phone number and email are required for every teacher." },
          { status: 400 },
        );
      }

      const [created] = await db
        .insert(lmsTeacherRecords)
        .values({ teacherId, fullName, email, phone, designation })
        .returning();

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "teacher_record_created",
        entity: "lms_teacher_records",
        entityId: String(created.id),
      });
      const portalAccountEmail = await livePortalAccountEmail(
        "teacher",
        created.email ?? "",
      ).catch(() => null);
      return NextResponse.json({ teacher: { ...created, portalAccountEmail } });
    }

    return NextResponse.json({ error: "Unknown record type." }, { status: 400 });
  } catch (error) {
    /* Drizzle wraps the pg driver error — the unique-violation code rides
       on `cause`, the text on `message`. Both are checked. */
    const pgCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
    const message = error instanceof Error ? error.message : "Unable to save the record.";
    if (pgCode === "23505" || message.includes("duplicate key")) {
      return NextResponse.json(
        { error: "That ID is already on the register." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ── v2.8.48.0 — EDIT one register row ───────────────────────────────────
   The office can fix typos and life events (phone, email, a class change,
   a parent's name) without delete-and-recreate.
   v2.9.13.0 — TWO owner asks:
   · THE IDENTITY NUMBERS ARE NOW EDITABLE (owner: "teacher id ekai student
     id ekai ekaparak add karama eka change karanna ba"): a corrected
     admission no re-links the lms_students person row AND remaps the
     adm-…@portal.stcmatale.lk login email so admission-number sign-in
     follows; a corrected teacher ID re-points lms_teachers.staff_code so
     the portal link survives. Both refuse duplicates with a friendly 409.
   · EMAIL + PHONE are required on every edit, matching the new ADD rule
     (legacy blanks get filled in the same save).
   A class change still moves the enrollment so the attendance roster
   follows (calm fallback: the office can still re-enroll from LMS Setup). */
export async function PATCH(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const type = body ? clean(body.type, 10) : "";
  const id = body ? Number(body.id) : NaN;
  if (!body || !Number.isInteger(id) || id <= 0 || !["student", "teacher"].includes(type)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    if (type === "student") {
      const fullName = clean(body.fullName, 120);
      const className = clean(body.className, 40);
      const fatherName = clean(body.fatherName, 120);
      const motherName = clean(body.motherName, 120);
      const registerNo = clean(body.registerNo, 40) || null;
      const phone = clean(body.phone, 30);
      const email = clean(body.email, 180).toLowerCase();
      /* v2.9.13.0 — the identity number itself is now correctable. */
      const admissionNo = clean(body.admissionNo, 40);

      if (!fullName || !className || !fatherName || !motherName) {
        return NextResponse.json(
          { error: "Name, class and both parent names are required." },
          { status: 400 },
        );
      }
      if (!phone || !PHONE_RE.test(phone) || !email || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { error: "A valid phone number and email are required for every student." },
          { status: 400 },
        );
      }

      /* v2.9.16.0 — the Edit dialog's extra-details editor sends the FULL
         pair list; absent = untouched so older callers keep working. */
      const extraCheck = sanitizeExtraData(body.extraData);
      if (extraCheck.provided && extraCheck.error) {
        return NextResponse.json({ error: extraCheck.error }, { status: 400 });
      }

      const [current] = await db
        .select()
        .from(lmsStudentRecords)
        .where(eq(lmsStudentRecords.id, id))
        .limit(1);
      if (!current) {
        return NextResponse.json({ error: "Student record not found." }, { status: 404 });
      }

      /* Admission-no correction — refuse duplicates BEFORE writing. */
      const admissionChanged = !!admissionNo && admissionNo !== current.admissionNo;
      if (admissionChanged) {
        const [clash] = await db
          .select({ id: lmsStudentRecords.id })
          .from(lmsStudentRecords)
          .where(
            and(
              ne(lmsStudentRecords.id, id),
              sql`lower(${lmsStudentRecords.admissionNo}) = ${admissionNo.toLowerCase()}`,
            ),
          )
          .limit(1);
        if (clash) {
          return NextResponse.json(
            { error: `Admission number ${admissionNo} is already on the register.` },
            { status: 409 },
          );
        }
      }

      const [updated] = await db
        .update(lmsStudentRecords)
        .set({
          fullName,
          className,
          fatherName,
          motherName,
          registerNo,
          phone,
          email,
          ...(admissionChanged ? { admissionNo } : {}),
          ...(extraCheck.provided ? { extraData: extraCheck.data } : {}),
        })
        .where(eq(lmsStudentRecords.id, id))
        .returning();

      /* v2.9.13.0 — re-link EVERYTHING that hung off the old admission no:
         the lms_students person row (the profile/roster bridge) and the
         adm-…@portal.stcmatale.lk LOGIN email (so admission-number sign-in
         follows the fix). Calm best-effort: a clash leaves that side on the
         old value with the register row still updated. */
      let personRelinked = false;
      let loginRemapped = false;
      if (admissionChanged) {
        try {
          const persons = await db
            .select({ id: lmsStudents.id })
            .from(lmsStudents)
            .where(sql`lower(${lmsStudents.admissionNo}) = ${current.admissionNo.toLowerCase()}`);
          for (const p of persons) {
            await db
              .update(lmsStudents)
              .set({ admissionNo })
              .where(eq(lmsStudents.id, p.id));
            personRelinked = true;
          }
        } catch {
          /* calm — the office can still re-link from LMS Setup */
        }
        try {
          const oldEmail = studentAccountEmail(current.admissionNo);
          const newEmail = studentAccountEmail(admissionNo);
          if (oldEmail !== newEmail) {
            await db
              .update(lmsPortalAccounts)
              .set({ email: newEmail })
              .where(
                and(
                  eq(lmsPortalAccounts.role, "student"),
                  sql`lower(${lmsPortalAccounts.email}) = ${oldEmail}`,
                ),
              );
            loginRemapped = true;
          }
        } catch {
          /* calm — a collision on the new adm- address leaves the login as-is */
        }
      }

      /* Class changed → move the active enrollment so attendance, homework
         and marks rosters follow the register. Calm on any mismatch: the
         office can always re-enroll manually from LMS Setup → Enrollment. */
      let enrollmentMoved = false;
      let enrollmentNote: string | null = null;
      if (current.className !== className) {
        const person = await ensureStudentPersonByAdmissionNo(
          current.admissionNo,
          null,
        ).catch(() => null);
        if (person) {
          const [existing] = await db
            .select()
            .from(lmsEnrollments)
            .where(eq(lmsEnrollments.studentId, person.id))
            .limit(1);
          if (existing) {
            const [target] = await db
              .select({ id: lmsClasses.id })
              .from(lmsClasses)
              .where(eq(lmsClasses.name, className))
              .orderBy(desc(lmsClasses.academicYear), desc(lmsClasses.id))
              .limit(1);
            if (target && target.id !== existing.classId) {
              await db
                .update(lmsEnrollments)
                .set({ classId: target.id })
                .where(eq(lmsEnrollments.id, existing.id));
              enrollmentMoved = true;
            } else if (!target) {
              enrollmentNote = `No class named “${className}” exists yet — create it under LMS Setup → Classes, then re-enroll from Enrollment.`;
            }
          } else {
            enrollmentNote = "The student is not enrolled in a class yet — pick one under LMS Setup → Enrollment.";
          }
        }
      }

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "student_record_updated",
        entity: "lms_student_records",
        entityId: String(id),
        details: {
          classChanged: current.className !== className,
          enrollmentMoved,
          admissionChanged,
          personRelinked,
          loginRemapped,
          extraDataUpdated: extraCheck.provided,
        },
      });
      /* v2.9.16.0 — the response also reports the live portal account (the
         admission-no fix may have remapped the synthetic login email). */
      const portalAccountEmail = await livePortalAccountEmail(
        "student",
        studentAccountEmail(updated.admissionNo),
      ).catch(() => null);
      return NextResponse.json({
        student: { ...updated, portalAccountEmail },
        enrollmentMoved,
        enrollmentNote,
      });
    }

    if (type === "teacher") {
      const fullName = clean(body.fullName, 120);
      const email = clean(body.email, 180).toLowerCase();
      const phone = clean(body.phone, 30);
      const designation = clean(body.designation, 120) || null;
      /* v2.9.13.0 — the identity number itself is now correctable. */
      const teacherId = clean(body.teacherId, 40);

      if (!fullName) {
        return NextResponse.json({ error: "Name is required." }, { status: 400 });
      }
      if (!phone || !PHONE_RE.test(phone) || !email || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { error: "A valid phone number and email are required for every teacher." },
          { status: 400 },
        );
      }

      /* v2.9.16.0 — extra-details editor pairs (see the student arm). */
      const extraCheck = sanitizeExtraData(body.extraData);
      if (extraCheck.provided && extraCheck.error) {
        return NextResponse.json({ error: extraCheck.error }, { status: 400 });
      }

      const [current] = await db
        .select()
        .from(lmsTeacherRecords)
        .where(eq(lmsTeacherRecords.id, id))
        .limit(1);
      if (!current) {
        return NextResponse.json({ error: "Teacher record not found." }, { status: 404 });
      }

      /* Teacher-ID correction — refuse duplicates BEFORE writing. */
      const teacherIdChanged = !!teacherId && teacherId !== current.teacherId;
      if (teacherIdChanged) {
        const [clash] = await db
          .select({ id: lmsTeacherRecords.id })
          .from(lmsTeacherRecords)
          .where(
            and(
              ne(lmsTeacherRecords.id, id),
              sql`lower(${lmsTeacherRecords.teacherId}) = ${teacherId.toLowerCase()}`,
            ),
          )
          .limit(1);
        if (clash) {
          return NextResponse.json(
            { error: `Teacher ID ${teacherId} is already on the register.` },
            { status: 409 },
          );
        }
      }

      const [updated] = await db
        .update(lmsTeacherRecords)
        .set({
          fullName,
          email,
          phone,
          designation,
          ...(teacherIdChanged ? { teacherId } : {}),
          ...(extraCheck.provided ? { extraData: extraCheck.data } : {}),
        })
        .where(eq(lmsTeacherRecords.id, id))
        .returning();

      /* v2.9.13.0 — portal teachers hold the register's ID as their
         staff_code; re-point it so the account keeps matching. Calm on a
         clash (the office fixes the account row from LMS Setup). */
      let portalRelinked = false;
      if (teacherIdChanged) {
        try {
          await db
            .update(lmsTeachers)
            .set({ staffCode: teacherId })
            .where(sql`lower(${lmsTeachers.staffCode}) = ${current.teacherId.toLowerCase()}`);
          portalRelinked = true;
        } catch {
          /* calm — a clash on the new staff code leaves the portal as-is */
        }
      }

      await db.insert(adminAuditLogs).values({
        userId: session.id,
        action: "teacher_record_updated",
        entity: "lms_teacher_records",
        entityId: String(id),
        details: { teacherIdChanged, portalRelinked, extraDataUpdated: extraCheck.provided },
      });
      const portalAccountEmail = await livePortalAccountEmail(
        "teacher",
        updated.email ?? "",
      ).catch(() => null);
      return NextResponse.json({ teacher: { ...updated, portalAccountEmail } });
    }

    return NextResponse.json({ error: "Unknown record type." }, { status: 400 });
  } catch (error) {
    const dup = duplicateReply(error, "ID");
    if (dup) return dup;
    const message = error instanceof Error ? error.message : "Unable to update the record.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";
  if (!["student", "teacher"].includes(type)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  /* v2.9.16.0 (task 3-b) — withAccount=1 ALSO moves each deleted row's
     LIVE portal account to the trash (deletedAt=now + sessions ended).
     The office opts in per modal — the checkbox only appears when the
     GET report says a live account exists, so the checkbox the office
     ticks is exactly the account that gets trashed. */
  const withAccount = url.searchParams.get("withAccount") === "1";

  /* v2.8.67.2 (Task 25-c) — BATCH delete: ?type=student&ids=1,2,3 alongside
     the existing single-id form. The single path below is untouched. */
  const idsParam = url.searchParams.get("ids");
  if (idsParam !== null) {
    const ids = [
      ...new Set(
        idsParam
          .split(",")
          .map((part) => Number(part.trim()))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ].slice(0, 1000);
    if (ids.length === 0) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    try {
      let deleted = 0;
      let trashedAccounts = 0;
      const missing: number[] = [];

      if (type === "student") {
        /* Same per-row semantics as the single delete: resolve the person
           by admission BEFORE the register row goes, then drop the ACTIVE
           enrollments (person row + attendance history are kept). */
        const rows = await db
          .select({ id: lmsStudentRecords.id, admissionNo: lmsStudentRecords.admissionNo })
          .from(lmsStudentRecords)
          .where(inArray(lmsStudentRecords.id, ids));
        const foundIds = new Set(rows.map((r) => r.id));
        for (const id of ids) if (!foundIds.has(id)) missing.push(id);

        /* v2.9.16.0 — one batched trash call for every selected row that
           still owns a live portal account. */
        if (withAccount) {
          trashedAccounts = await trashPortalAccounts(
            session.id,
            "student",
            rows.map((r) => studentAccountEmail(r.admissionNo)),
          ).catch(() => 0);
        }

        for (const row of rows) {
          const person = await ensureStudentPersonByAdmissionNo(row.admissionNo, null).catch(
            () => null,
          );
          await db.delete(lmsStudentRecords).where(eq(lmsStudentRecords.id, row.id));
          if (person) {
            await db.delete(lmsEnrollments).where(eq(lmsEnrollments.studentId, person.id));
          }
          await db.insert(adminAuditLogs).values({
            userId: session.id,
            action: "student_record_deleted",
            entity: "lms_student_records",
            entityId: String(row.id),
          });
          deleted++;
        }
      } else {
        const rows = await db
          .select({ id: lmsTeacherRecords.id, email: lmsTeacherRecords.email })
          .from(lmsTeacherRecords)
          .where(inArray(lmsTeacherRecords.id, ids));
        const foundIds = new Set(rows.map((r) => r.id));
        for (const id of ids) if (!foundIds.has(id)) missing.push(id);

        /* v2.9.16.0 — same batched trash for the selected teachers. */
        if (withAccount) {
          trashedAccounts = await trashPortalAccounts(
            session.id,
            "teacher",
            rows.map((r) => r.email ?? ""),
          ).catch(() => 0);
        }

        for (const row of rows) {
          await db.delete(lmsTeacherRecords).where(eq(lmsTeacherRecords.id, row.id));
          await db.insert(adminAuditLogs).values({
            userId: session.id,
            action: "teacher_record_deleted",
            entity: "lms_teacher_records",
            entityId: String(row.id),
          });
          deleted++;
        }
      }

      return NextResponse.json({ ok: true, deleted, missing, trashedAccounts });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the records.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    let trashedAccount = false;
    if (type === "student") {
      /* v2.8.37.1 — the register is the source of truth: removing a student
         from it also drops their ACTIVE class enrollment, so the child
         leaves the attendance roster immediately (person row + attendance
         history are kept for the record). The person is resolved BEFORE
         the register row goes — after deletion it can't be found. */
      const [row] = await db
        .select({ admissionNo: lmsStudentRecords.admissionNo })
        .from(lmsStudentRecords)
        .where(eq(lmsStudentRecords.id, id))
        .limit(1);
      const person = row
        ? await ensureStudentPersonByAdmissionNo(row.admissionNo, null).catch(() => null)
        : null;
      /* v2.9.16.0 — the account trash runs FIRST, while the register row
         still exists: a failure reports before anything is deleted, and a
         retry then simply finds no live account and proceeds. */
      if (withAccount && row) {
        trashedAccount =
          (
            await trashPortalAccounts(session.id, "student", [
              studentAccountEmail(row.admissionNo),
            ]).catch(() => 0)
          ) > 0;
      }
      await db.delete(lmsStudentRecords).where(eq(lmsStudentRecords.id, id));
      if (person) {
        await db.delete(lmsEnrollments).where(eq(lmsEnrollments.studentId, person.id));
      }
    } else {
      if (withAccount) {
        const [row] = await db
          .select({ email: lmsTeacherRecords.email })
          .from(lmsTeacherRecords)
          .where(eq(lmsTeacherRecords.id, id))
          .limit(1);
        if (row?.email) {
          trashedAccount =
            (
              await trashPortalAccounts(session.id, "teacher", [row.email]).catch(
                () => 0,
              )
            ) > 0;
        }
      }
      await db.delete(lmsTeacherRecords).where(eq(lmsTeacherRecords.id, id));
    }
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: type === "student" ? "student_record_deleted" : "teacher_record_deleted",
      entity: type === "student" ? "lms_student_records" : "lms_teacher_records",
      entityId: String(id),
      details: { withAccount, trashedAccount },
    });
    return NextResponse.json({ ok: true, trashedAccount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete the record.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
