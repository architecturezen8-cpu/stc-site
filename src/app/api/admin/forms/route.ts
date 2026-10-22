import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  admissionApplications,
  appointments,
  inquiries,
} from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";

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
  return NextResponse.json({ type, statuses: FORM_STATUSES[type], rows });
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
