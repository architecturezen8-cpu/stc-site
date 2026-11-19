import { NextResponse, after } from "next/server";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { notifyOfficeForm } from "@/lib/office-notify";
import { sendSubmissionReceipt } from "@/lib/mailer";
import { notifyAdminAlert } from "@/lib/admin-alerts";
import { getPublishedAppointmentSettings, resolveAppointmentCardSlots } from "@/lib/appointment-settings";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      phone,
      department,
      visitDate,
      visitTime,
      purpose,
      visitors,
      notes,
    } = body ?? {};

    if (!name || !email || !phone || !department || !visitDate || !visitTime || !purpose) {
      return NextResponse.json(
        { error: "Please complete all required fields to book the appointment." },
        { status: 400 },
      );
    }

    /* v2.8.91.0 — the office's own rules (Admin → Forms → Appointments →
       Form settings) govern every validation below.
       v2.8.92.0 — the chosen time must belong to the CHOSEN CARD: a card
       with its own visiting times validates against that list, not the
       default one (before this, a card-only time like the OBA's
       "12.00 noon" 400-ed because the check only knew the default list). */
    const settings = await getPublishedAppointmentSettings();

    const cardSlots =
      resolveAppointmentCardSlots(String(department), settings) ?? settings.timeSlots;
    if (!cardSlots.includes(String(visitTime))) {
      return NextResponse.json(
        { error: "Please choose one of the available visiting times." },
        { status: 400 },
      );
    }

    const visitorCount = Number(visitors || "1");
    if (!Number.isFinite(visitorCount) || visitorCount < 1 || visitorCount > settings.maxVisitors) {
      return NextResponse.json(
        { error: `A single booking can bring at most ${settings.maxVisitors} visitor${settings.maxVisitors === 1 ? "" : "s"}.` },
        { status: 400 },
      );
    }

    // Visits must be booked at least minDaysAhead days ahead (1 = tomorrow).
    const chosen = new Date(`${String(visitDate)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliest = new Date(today);
    earliest.setDate(earliest.getDate() + settings.minDaysAhead);
    if (Number.isNaN(chosen.getTime()) || chosen < earliest) {
      return NextResponse.json(
        {
          error:
            settings.minDaysAhead === 1
              ? "Please choose a date from tomorrow onwards."
              : `Please choose a date at least ${settings.minDaysAhead} days ahead.`,
        },
        { status: 400 },
      );
    }

    // Weekends are closed unless the office opened them.
    const dow = chosen.getDay();
    if (!settings.allowWeekends && (dow === 0 || dow === 6)) {
      return NextResponse.json(
        { error: "The college office is closed on weekends — please pick a weekday." },
        { status: 400 },
      );
    }

    // v2.8.91.0 — the per-day cap: cancelled bookings don't take a space.
    if (settings.maxPerDay > 0) {
      const [taken] = await db
        .select({ n: count() })
        .from(appointments)
        .where(
          and(eq(appointments.visitDate, String(visitDate)), ne(appointments.status, "cancelled")),
        );
      if ((taken?.n ?? 0) >= settings.maxPerDay) {
        return NextResponse.json(
          {
            error:
              `That day is fully booked (${settings.maxPerDay} appointment${settings.maxPerDay === 1 ? "" : "s"}). ` +
              "Please choose another date or call the office on +94 66 222 0175.",
          },
          { status: 400 },
        );
      }
    }

    const [created] = await db
      .insert(appointments)
      .values({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone).trim(),
        department: String(department).trim(),
        visitDate: String(visitDate),
        visitTime: String(visitTime),
        purpose: String(purpose).trim(),
        visitors: String(visitors || "1"),
        notes: notes ? String(notes).trim() : null,
        status: "requested",
      })
      .returning();

    const refCode = `APT-${created.id.toString().padStart(4, "0")}`;

    /* v2.8.81.0 — one-way office heads-up (never blocks the reply). */
    await notifyOfficeForm(
      "appointment",
      refCode,
      `${String(name).trim()} · ${String(department).trim()}`,
      [
        ["Visitor", String(name).trim()],
        ["Department", String(department).trim()],
        ["Visit", `${String(visitDate)} at ${String(visitTime)}`],
        ["Visitors", String(visitors || "1")],
        ["Phone", String(phone).trim()],
        ["Email", String(email).trim().toLowerCase()],
        ["Purpose", String(purpose).trim().slice(0, 500)],
        ["Notes", notes ? String(notes).trim().slice(0, 500) : ""],
      ],
    ).catch(() => false);

    /* v2.8.85.0 — the visitor gets their own branded acknowledgement. */
    await sendSubmissionReceipt({
      to: String(email).trim().toLowerCase(),
      reference: refCode,
      submitterName: String(name).trim(),
      title: "appointment request",
      fields: [
        ["Department", String(department).trim()],
        ["Visit", `${String(visitDate)} at ${String(visitTime)}`],
        ["Visitors", String(visitors || "1")],
      ],
      event: "appointment",
    }).catch(() => false);

    /* v2.8.88.0 — the office's BELL learns instantly (after() keeps the
       work alive on serverless after the response returns). v2.8.91.0 —
       the preview now carries the purpose so the office knows the WHY
       before they even open the row. */
    after(() =>
      notifyAdminAlert({
        kind: "appointment",
        title: `New appointment · ${refCode}`,
        body: `${String(name).trim()} — ${String(department).trim()}, ${String(visitDate)} at ${String(visitTime)} · ${String(purpose).trim().slice(0, 120)}`,
        reference: refCode,
        linkUrl: "/admin/forms/appointments",
      }),
    );

    return NextResponse.json({
      success: true,
      reference: refCode,
      message: `Appointment requested for ${created.visitDate} at ${created.visitTime} with ${created.department}. The office will confirm by phone.`,
    });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return NextResponse.json(
      {
        error:
          "We could not book that appointment. Please try again or call the office on +94 66 222 0175.",
      },
      { status: 500 },
    );
  }
}
