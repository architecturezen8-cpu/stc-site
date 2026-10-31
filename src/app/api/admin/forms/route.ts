import { NextResponse, after } from "next/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  admissionApplications,
  appointments,
  emailLog,
  inquiries,
} from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { sendAppointmentStatusEmail } from "@/lib/mailer";

/**
 * Form Management API — every visitor-submitted form in one place:
 *   admissions   → Grade 6 intake + A/L applications (admission_applications)
 *   appointments → department visit bookings
 *   inquiries    → contact form messages
 */

const FORM_TYPES = ["admissions", "appointments", "inquiries"] as const;
type FormType = (typeof FORM_TYPES)[number];

/** Statuses admins can move a submission through. */
const FORM_STATUSES: Record<FormType, string[]> = {
  admissions: ["received", "reviewing", "shortlisted", "approved", "waitlisted", "rejected"],
  appointments: ["requested", "confirmed", "completed", "cancelled"],
  inquiries: ["unread", "read", "replied", "archived"],
};

function isFormType(value: unknown): value is FormType {
  return typeof value === "string" && (FORM_TYPES as readonly string[]).includes(value);
}

function tableFor(type: FormType) {
  if (type === "admissions") return admissionApplications;
  if (type === "appointments") return appointments;
  return inquiries;
}

export async function GET(req: Request) {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  if (!isFormType(type)) {
    return NextResponse.json({ error: "Unknown form type." }, { status: 400 });
  }

  const table = tableFor(type);
  const rows = await db.select().from(table).orderBy(desc(table.createdAt));

  /* v2.8.88.0 — the OWNER's per-row email status ("email send unoth 'email
     send successfully' kiyala wage badge ekak… failed unoth ekata failed
     badge ekak"): the latest VISITOR-facing send attempt per submission
     reference (office heads-ups excluded — they go to the office inbox,
     not the visitor). Staff roles have forms access by definition, so the
     front desk sees whether the email went without needing Email Alerts.
     v2.8.88.1 — BUGFIX: this used to be spread onto the row under the key
     `email`, silently REPLACING the visitor's email address string with
     the status object — opening any submission crashed with "Objects are
     not valid as a React child", mailto links pointed at [object Object]
     and CSV/search picked the object up. It now rides under its own key
     `emailStatus` and the row's `email` stays the visitor's address. */
  const PREFIX: Record<FormType, string> = {
    appointments: "APT-",
    admissions: "ADM-",
    inquiries: "SRN-",
  };
  const refs = rows.map((r) => `${PREFIX[type]}${String((r as { id: number }).id).padStart(4, "0")}`);
  const emailByRef = new Map<
    string,
    { status: string; kind: string; error: string | null; createdAt: string }
  >();
  if (refs.length > 0) {
    const logRows = await db
      .select()
      .from(emailLog)
      .where(and(ne(emailLog.kind, "office_notify"), inArray(emailLog.reference, refs)))
      .orderBy(desc(emailLog.id))
      .limit(600);
    for (const log of logRows) {
      if (log.reference && !emailByRef.has(log.reference)) {
        emailByRef.set(log.reference, {
          status: log.status,
          kind: log.kind,
          error: log.error,
          createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : "",
        });
      }
    }
  }

  const decorated = rows.map((r) => ({
    ...(r as Record<string, unknown>),
    emailStatus:
      emailByRef.get(`${PREFIX[type]}${String((r as { id: number }).id).padStart(4, "0")}`) ?? null,
  }));

  return NextResponse.json({ type, statuses: FORM_STATUSES[type], rows: decorated });
}

export async function PATCH(req: Request) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const type = body.type;
    const id = Number(body.id);
    if (!isFormType(type) || !Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid form type or ID." }, { status: 400 });
    }

    const table = tableFor(type);
    const patch: Record<string, unknown> = {};

    if (typeof body.status === "string" && body.status.trim()) {
      const status = body.status.trim();
      if (!FORM_STATUSES[type].includes(status)) {
        return NextResponse.json({ error: `Invalid status "${status}".` }, { status: 400 });
      }
      patch.status = status;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    /* v2.8.83.0 — read the row BEFORE the update so a real status CHANGE can
       be detected (same status re-saved sends no email). */
    const [before] = await db.select().from(table).where(eq(table.id, id)).limit(1);

    const [updated] = await db.update(table).set(patch).where(eq(table.id, id)).returning();
    if (!updated) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: `update_${type}`,
      entity: type,
      entityId: String(id),
      details: patch,
    });

    /* v2.8.83.0 — owner-approved: when the office CONFIRMS or CANCELS an
       appointment the visitor now learns it by email too (previously phone
       only). Never sent for completed/requested.
       v2.8.87.2 — v2.8.87.1 PRODUCTION BUG: this was a bare `void`
       fire-and-forget, and on Vercel serverless the lambda freezes the
       moment PATCH returns — the in-flight Mailjet fetch died before it
       could answer, so EVERY status email failed in production while the
       same code sent fine from the sandbox (all 3 email_log rows at
       2026-10-27 21:01–21:07Z are `failed`; every awaited mail is `sent`).
       Fixed with Next's after(): the send now runs inside the platform's
       waitUntil window — the response still returns instantly, but the
       function stays alive until Mailjet answers. A mail outage still can
       never fail the status change itself. */
    if (
      type === "appointments" &&
      typeof patch.status === "string" &&
      before &&
      before.status !== updated.status &&
      (updated.status === "confirmed" || updated.status === "cancelled") &&
      updated.email
    ) {
      const appt = updated as typeof appointments.$inferSelect;
      const reference = `APT-${appt.id.toString().padStart(4, "0")}`;
      after(() =>
        sendAppointmentStatusEmail({
          to: appt.email,
          reference,
          visitorName: appt.name,
          status: appt.status === "confirmed" ? "confirmed" : "cancelled",
          department: appt.department,
          visitDate: appt.visitDate,
          visitTime: appt.visitTime,
          visitors: appt.visitors,
        })
          .then((sent) =>
            console.info(
              `[appointment-status] ${reference} → ${appt.email}: ${sent ? "sent" : "FAILED"}`,
            ),
          )
          .catch(() => false),
      );
    }

    return NextResponse.json({ row: updated });
  } catch {
    return NextResponse.json({ error: "Unable to update the submission." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = Number(url.searchParams.get("id"));
  if (!isFormType(type) || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid form type or ID." }, { status: 400 });
  }

  const table = tableFor(type);
  const [deleted] = await db.delete(table).where(eq(table.id, id)).returning();
  if (!deleted) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  await db.insert(adminAuditLogs).values({
    userId: admin.id,
    action: `delete_${type}`,
    entity: type,
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
