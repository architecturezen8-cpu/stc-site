import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { notifyOfficeForm } from "@/lib/office-notify";
import { sendSubmissionReceipt } from "@/lib/mailer";
import { notifyAdminAlert } from "@/lib/admin-alerts";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getFixedFormBaseOverrides } from "@/lib/form-extra-fields";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, phone, inquiryType, grade, message } = body;

    /* v2.8.86.0 — the Customize tab's built-in-question overrides steer the
       server checks too: hidden fields are never required and store "",
       and a field the office marked optional no longer 400s. */
    const base = await getFixedFormBaseOverrides("contact");
    const isHidden = (key: string) => base[key]?.hidden === true;
    const isRequired = (key: string, dflt: boolean) =>
      isHidden(key) ? false : (base[key]?.required ?? dflt);

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Please provide all required fields." },
        { status: 400 },
      );
    }
    if (isRequired("phone", true) && !phone) {
      return NextResponse.json(
        { error: "Please provide all required fields." },
        { status: 400 },
      );
    }

    /* v2.8.85.0 — admin-configured extra fields ride here (id → value). */
    const extraData =
      body?.extraData && typeof body.extraData === "object" && !Array.isArray(body.extraData)
        ? Object.fromEntries(
            Object.entries(body.extraData as Record<string, unknown>)
              .slice(0, 20)
              .map(([k, v]) => [String(k).slice(0, 40), String(v ?? "").trim().slice(0, 2000)])
              .filter(([, v]) => v),
          )
        : {};
    await ensureSchemaExtras();

    const [created] = await db
      .insert(inquiries)
      .values({
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        phone: phone ? String(phone).trim() : "",
        inquiryType: isHidden("inquiryType")
          ? "General Inquiries"
          : String(inquiryType || "General Inquiries").trim(),
        grade: grade ? String(grade).trim() : null,
        message: String(message).trim(),
        extraData,
        status: "unread",
      })
      .returning();

    const refCode = `SRN-${created.id.toString().padStart(4, "0")}`;

    /* v2.8.81.0 — one-way office heads-up (never blocks the reply). */
    const officeFields: [string, string][] = [
      ["Name", String(name).trim()],
      ["Inquiry type", String(inquiryType || "General Inquiries").trim()],
      ["Grade", grade ? String(grade).trim() : ""],
      ["Phone", phone ? String(phone).trim() : ""],
      ["Email", String(email).trim().toLowerCase()],
      ["Message", String(message).trim().slice(0, 500)],
    ];
    await notifyOfficeForm(
      "contact",
      refCode,
      String(name).trim(),
      officeFields.filter(([, value]) => value),
    ).catch(() => false);

    /* v2.8.85.0 — the submitter gets their own branded acknowledgement. */
    const receiptFields: [string, string][] = [
      ["Inquiry type", String(inquiryType || "General Inquiries").trim()],
      ["Phone", phone ? String(phone).trim() : ""],
      ["Message", String(message).trim().slice(0, 120)],
    ];
    await sendSubmissionReceipt({
      to: String(email).trim().toLowerCase(),
      reference: refCode,
      submitterName: String(name).trim(),
      title: "message",
      fields: receiptFields.filter(([, value]) => value),
      event: "contact",
    }).catch(() => false);

    /* v2.8.88.0 — the office's BELL learns instantly (after() keeps the
       work alive on serverless after the response returns). v2.8.91.0 —
       the preview carries a snippet of the actual message, so the office
       knows what arrived without opening the row (the owner: "moketada
       awe kiyalawath"). */
    after(() =>
      notifyAdminAlert({
        kind: "contact",
        title: `New contact message · ${refCode}`,
        body: `${String(name).trim()} — ${String(inquiryType || "General Inquiries").trim()}: ${String(message).trim().slice(0, 160)}`,
        reference: refCode,
        linkUrl: "/admin/forms/contacts",
      }),
    );

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
