import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";

/**
 * v2.8.83.0 — PUBLIC appointment status lookup (option 3, owner-approved).
 *
 * A visitor who booked a department visit enters their reference code
 * (APT-0001) plus the email they booked with and sees the CURRENT status —
 * until now the only channel was the office's phone call.
 *
 * Anti-enumeration: the reference alone is useless — the stored email must
 * match exactly (case-insensitive), and a wrong email returns the SAME
 * "not found" answer as a wrong reference, so nothing about an existing
 * booking can be probed. No phone/notes are ever returned. Rate limiting
 * rides on the middleware's public form rule (POST /api/appointments/* →
 * 8 requests / 10 min / IP) — the same spam surface as the booking form.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

    /* Accept "APT-0001", "apt-1", "APT1" and bare "0001"/"1". */
    const rawRef = String(body?.reference ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const refMatch = /^(?:APT-?)?0*(\d{1,9})$/.exec(rawRef);
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!refMatch || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({
        found: false,
        message: "Enter the APT reference code and the email you booked with.",
      });
    }

    const id = Number(refMatch[1]);
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);

    /* One identical answer for "no such booking" AND "email mismatch". */
    if (!row || row.email.trim().toLowerCase() !== email) {
      return NextResponse.json({
        found: false,
        message:
          "No appointment matches that reference code and email. Check both and try again, or call the office on +94 66 222 0175.",
      });
    }

    return NextResponse.json({
      found: true,
      appointment: {
        reference: `APT-${row.id.toString().padStart(4, "0")}`,
        status: row.status,
        name: row.name,
        department: row.department,
        visitDate: row.visitDate,
        visitTime: row.visitTime,
        visitors: row.visitors,
      },
    });
  } catch (error) {
    console.error("Error looking up appointment:", error);
    return NextResponse.json(
      { found: false, message: "Something went wrong. Please try again in a moment." },
      { status: 500 },
    );
  }
}
