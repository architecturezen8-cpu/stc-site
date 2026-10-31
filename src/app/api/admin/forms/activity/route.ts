import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { admissionApplications, appointments, inquiries } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import type { FormActivityItem, FormActivityKind } from "@/lib/form-activity";

/**
 * v2.8.84.0 — FORM ACTIVITY FEED (owner item 6: "main admin studio eke
 * notification section ekatath appoinment, contact massage, grade 6
 * application, A/L admintion ekak wage dammama danne na ne aluthin ekak
 * dalada kiyala"). One read-only endpoint that merges the latest rows from
 * all three public form tables into a single notification list, plus the
 * count still AWAITING action per stream. Read permission only — it never
 * mutates anything.
 */

const LIMIT = 15;

const pad4 = (id: number) => id.toString().padStart(4, "0");

export async function GET() {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;

  const [admissionRows, appointmentRows, inquiryRows] = await Promise.all([
    db
      .select({
        id: admissionApplications.id,
        programme: admissionApplications.programme,
        studentName: admissionApplications.studentName,
        stream: admissionApplications.stream,
        status: admissionApplications.status,
        createdAt: admissionApplications.createdAt,
      })
      .from(admissionApplications)
      .orderBy(desc(admissionApplications.createdAt))
      .limit(LIMIT),
    db
      .select({
        id: appointments.id,
        name: appointments.name,
        department: appointments.department,
        visitDate: appointments.visitDate,
        visitTime: appointments.visitTime,
        status: appointments.status,
        createdAt: appointments.createdAt,
      })
      .from(appointments)
      .orderBy(desc(appointments.createdAt))
      .limit(LIMIT),
    db
      .select({
        id: inquiries.id,
        name: inquiries.name,
        inquiryType: inquiries.inquiryType,
        status: inquiries.status,
        createdAt: inquiries.createdAt,
      })
      .from(inquiries)
      .orderBy(desc(inquiries.createdAt))
      .limit(LIMIT),
  ]);

  const items: FormActivityItem[] = [
    ...admissionRows.map((r) => ({
      kind: (r.programme === "advanced-level" ? "alevel" : "grade-6") as FormActivityKind,
      id: r.id,
      reference: `ADM-${pad4(r.id)}`,
      name: r.studentName,
      detail: r.programme === "advanced-level" ? r.stream || "Advanced Level" : "Grade 6 intake",
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      fresh: r.status === "received",
    })),
    ...appointmentRows.map((r) => ({
      kind: "appointment" as const,
      id: r.id,
      reference: `APT-${pad4(r.id)}`,
      name: r.name,
      detail: `${r.department} · ${r.visitDate} ${r.visitTime}`,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      fresh: r.status === "requested",
    })),
    ...inquiryRows.map((r) => ({
      kind: "contact" as const,
      id: r.id,
      reference: `SRN-${pad4(r.id)}`,
      name: r.name,
      detail: r.inquiryType,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      fresh: r.status === "unread",
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
    .slice(0, LIMIT);

  /* Awaiting-action counts across the WHOLE table (not just the latest 15). */
  const countOf = sql<number>`count(*)::int`;
  const [admissionFresh, appointmentFresh, inquiryFresh] = await Promise.all([
    db
      .select({ n: countOf })
      .from(admissionApplications)
      .where(eq(admissionApplications.status, "received")),
    db.select({ n: countOf }).from(appointments).where(eq(appointments.status, "requested")),
    db.select({ n: countOf }).from(inquiries).where(eq(inquiries.status, "unread")),
  ]);

  return NextResponse.json({
    items,
    awaiting: {
      admissions: admissionFresh[0]?.n ?? 0,
      appointments: appointmentFresh[0]?.n ?? 0,
      contacts: inquiryFresh[0]?.n ?? 0,
    },
  });
}
