import { NextResponse } from "next/server";
import { db } from "@/db";
import { inquiries } from "@/db/schema";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, phone, inquiryType, grade, message } = body;

    if (!name || !email || !phone || !message) {
      return NextResponse.json(
        { error: "Please provide all required fields." },
        { status: 400 },
      );
    }

    const [created] = await db
      .insert(inquiries)
      .values({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone).trim(),
        inquiryType: String(inquiryType || "General Inquiries").trim(),
        grade: grade ? String(grade).trim() : null,
        message: String(message).trim(),
        status: "unread",
      })
      .returning();

    const refCode = `SRN-${created.id.toString().padStart(4, "0")}`;

    return NextResponse.json({
      success: true,
      message: "Your inquiry has been received. Our administration will contact you shortly.",
      reference: refCode,
      id: created.id,
    });
  } catch (error) {
    console.error("Error creating inquiry:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again or call the office." },
      { status: 500 },
    );
  }
}
