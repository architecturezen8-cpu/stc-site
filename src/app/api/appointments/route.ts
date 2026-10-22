import { NextResponse } from "next/server";
import { db } from "@/db";
import { appointments } from "@/db/schema";

const TIME_SLOTS = [
  "8.00 a.m.",
  "9.00 a.m.",
  "10.00 a.m.",
  "11.00 a.m.",
  "1.00 p.m.",
  "2.00 p.m.",
  "3.00 p.m.",
];

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

    if (!TIME_SLOTS.includes(String(visitTime))) {
      return NextResponse.json(
        { error: "Please choose one of the available visiting times." },
        { status: 400 },
      );
    }

    // Visits must be booked from tomorrow onwards.
    const chosen = new Date(`${String(visitDate)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(chosen.getTime()) || chosen <= today) {
      return NextResponse.json(
        { error: "Please choose a date from tomorrow onwards." },
        { status: 400 },
      );
    }

    // No weekend appointments.
    const dow = chosen.getDay();
    if (dow === 0 || dow === 6) {
      return NextResponse.json(
        { error: "The college office is closed on weekends — please pick a weekday." },
        { status: 400 },
      );
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
