import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  lmsPortalAccounts,
  lmsStudentRecords,
  lmsTeacherRecords,
} from "@/db/schema-lms";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { ensureLmsPerson } from "@/lib/lms-identity";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────────────────────────────────
   v2.9.15.8 — SELF-SERVICE "MY DETAILS" (owner: "aya machan ewage acc eka
   haduwa haduwamai details mukuth adala owner ta edit karanna ba").

   Until now every account row was written by the OFFICE when the account
   was created, and the owner could edit nothing — the profile page read
   the register LIVE but the account card itself was frozen. This route
   lets the signed-in owner update THEIR OWN account-level details:

     · fullName     the display name the whole portal shows (shell header,
       chat, bylines) — 2..120 characters.
     · phone        the account's own contact number — optional, max 30.
     · contactEmail v2.9.15.10 — the person's real email.

   v2.9.15.10 — ONE CONTACT TRUTH (owner: "profile page eken phone
   numbers,email ehema update karama eka verification records walath change
   wenna ona ne. mokada email,phone numbers ehema hamadama ekama thiyenne
   na ne ekai"): a phone/email change now writes EVERYWHERE it lives —

     · the account row (phone always; email only for password accounts —
       a Google identity is owned by Google and must keep matching the
       Google login),
     · the office REGISTER row (lms_student_records / lms_teacher_records —
       what the Verification Records manager and the profile's register
       panel display),
     · the verification SNAPSHOT (the JSON the approvals queue + register
       re-check read), so the office queue never compares stale contact
       details against the register.

   The register IDENTITY fields (admission no, class, parents' names) stay
   office-managed — this route only touches the contact columns.
   ──────────────────────────────────────────────────────────────────── */

const PHONE_ALLOWED = /^[0-9+()\-\s]{0,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Parsed = {
  fullName: string;
  phone: string | null;
  contactEmail: string | null;
};

function normalizeDetails(raw: unknown): Parsed | { error: string } {
  const body = (raw ?? {}) as {
    fullName?: unknown;
    phone?: unknown;
    contactEmail?: unknown;
  };
  const fullName = typeof body.fullName === "string" ? body.fullName.trim().replace(/\s+/g, " ") : "";
  if (fullName.length < 2 || fullName.length > 120) {
    return { error: "Please give a name between 2 and 120 characters." };
  }
  let phone: string | null = null;
  if (typeof body.phone === "string") {
    const trimmed = body.phone.trim();
    if (trimmed.length > 0) {
      if (!PHONE_ALLOWED.test(trimmed)) {
        return { error: "The phone can only hold digits, spaces and + - ( ) — up to 30 characters." };
      }
      phone = trimmed;
    }
  } else if (body.phone != null) {
    return { error: "The phone number looks malformed — please check it." };
  }
  let contactEmail: string | null = null;
  if (typeof body.contactEmail === "string") {
    const trimmed = body.contactEmail.trim().toLowerCase();
    if (trimmed.length > 0) {
      if (trimmed.length > 180 || !EMAIL_RE.test(trimmed)) {
        return { error: "That email address doesn't look right — please check the spelling." };
      }
      contactEmail = trimmed;
    }
  } else if (body.contactEmail != null) {
    return { error: "The email address looks malformed — please check it." };
  }
  return { fullName, phone, contactEmail };
}

export async function POST(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Your session has expired — please sign in again." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  await ensureSchemaExtras();
  const parsed = normalizeDetails(body);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  try {
    const [account] = await db
      .select({
        id: lmsPortalAccounts.id,
        email: lmsPortalAccounts.email,
        passwordHash: lmsPortalAccounts.passwordHash,
        verification: lmsPortalAccounts.verification,
        admissionRef: lmsPortalAccounts.admissionRef,
      })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, session.accountId))
      .limit(1);
    if (!account) {
      return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
    }

    /* Email change plan — password accounts own their identity (and students
       can always get back in through their admission number); Google-only
       rows keep Google's address so the Google sign-in still matches. */
    const emailChange =
      parsed.contactEmail !== null &&
      parsed.contactEmail !== account.email &&
      Boolean(account.passwordHash);

    if (emailChange) {
      const [clash] = await db
        .select({ id: lmsPortalAccounts.id })
        .from(lmsPortalAccounts)
        .where(
          and(
            eq(lmsPortalAccounts.email, parsed.contactEmail as string),
            eq(lmsPortalAccounts.role, session.role),
            ne(lmsPortalAccounts.id, session.accountId),
          ),
        )
        .limit(1);
      if (clash) {
        return NextResponse.json(
          { ok: false, error: "That email already belongs to another account on this portal — please use a different one." },
          { status: 400 },
        );
      }
    }

    /* 1 — the account row itself. */
    await db
      .update(lmsPortalAccounts)
      .set({
        fullName: parsed.fullName,
        phone: parsed.phone,
        ...(emailChange ? { email: parsed.contactEmail as string } : {}),
      })
      .where(eq(lmsPortalAccounts.id, session.accountId));

    /* 2 — the office REGISTER row's contact columns (student / teacher).
         The register phone/email follow the person's own words now — the
         office still owns every OTHER register field. */
    let registerSynced = false;
    if (session.role === "student" || session.role === "teacher") {
      const person = (await ensureLmsPerson(session.role, session.accountId, account.email)) as
        | { admissionNo?: string; staffCode?: string | null }
        | null;
      if (session.role === "student" && person?.admissionNo) {
        await db
          .update(lmsStudentRecords)
          .set({
            phone: parsed.phone ?? "",
            ...(parsed.contactEmail !== null ? { email: parsed.contactEmail } : {}),
          })
          .where(
            sql`lower(${lmsStudentRecords.admissionNo}) = ${person.admissionNo.trim().toLowerCase()}`,
          );
        registerSynced = true;
      } else if (session.role === "teacher" && person?.staffCode) {
        await db
          .update(lmsTeacherRecords)
          .set({
            phone: parsed.phone ?? "",
            ...(parsed.contactEmail !== null ? { email: parsed.contactEmail } : {}),
          })
          .where(
            sql`lower(${lmsTeacherRecords.teacherId}) = ${person.staffCode.trim().toLowerCase()}`,
          );
        registerSynced = true;
      }
    }

    /* 3 — the verification SNAPSHOT (office queue + approve re-check). */
    if (parsed.phone !== null || parsed.contactEmail !== null) {
      let snapshot: Record<string, unknown> | null = null;
      try {
        snapshot = account.verification
          ? (JSON.parse(account.verification) as Record<string, unknown>)
          : null;
      } catch {
        snapshot = null;
      }
      if (snapshot) {
        if (parsed.phone !== null) snapshot.phone = parsed.phone;
        if (parsed.contactEmail !== null) snapshot.email = parsed.contactEmail;
        await db
          .update(lmsPortalAccounts)
          .set({ verification: JSON.stringify(snapshot) })
          .where(eq(lmsPortalAccounts.id, session.accountId));
      }
    }

    await db.insert(adminAuditLogs).values({
      userId: null,
      action: "portal_profile_updated",
      entity: "lms_portal_account",
      entityId: String(session.accountId),
      details: {
        via: "portal_profile_my_details",
        role: session.role,
        fullName: parsed.fullName,
        phone: parsed.phone,
        emailChanged: emailChange ? parsed.contactEmail : null,
        registerSynced,
      },
    });

    return NextResponse.json(
      { ok: true, emailChanged: emailChange, registerSynced },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save your details — please try again in a moment." },
      { status: 500 },
    );
  }
}
