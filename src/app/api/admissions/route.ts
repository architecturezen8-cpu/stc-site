import { NextResponse, after } from "next/server";
import { db } from "@/db";
import { admissionApplications } from "@/db/schema";
import { notifyOfficeForm } from "@/lib/office-notify";
import { sendSubmissionReceipt } from "@/lib/mailer";
import { notifyAdminAlert } from "@/lib/admin-alerts";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getFixedFormBaseOverrides } from "@/lib/form-extra-fields";

const PROGRAMMES = ["grade-6", "advanced-level"];
const STREAMS = [
  "Biological Science",
  "Physical Science",
  "Commerce",
  "Arts",
];
const MEDIUMS = ["Sinhala", "Tamil", "English"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      programme,
      studentName,
      dob,
      gender,
      guardianName,
      relationship,
      phone,
      email,
      address,
      currentSchool,
      currentGrade,
      stream,
      olYear,
      olResults,
      olIndex,
      medium,
      siblingName,
      fatherOldThomian,
      fatherYears,
      housePreference,
      message,
    } = body ?? {};

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

    if (!PROGRAMMES.includes(programme)) {
      return NextResponse.json(
        { error: "Please choose either the Grade 6 intake or Advanced Level admissions." },
        { status: 400 },
      );
    }

    /* v2.8.86.0 — the Customize tab's built-in-question overrides steer the
       server checks and the stored values: hidden fields are never required
       and land as ""/N/A (the NOT NULL columns), un-required fields may be
       empty, and locked fields (student, guardian, email) always check. */
    const base = await getFixedFormBaseOverrides("admission");
    const isHidden = (key: string) => base[key]?.hidden === true;
    const isRequired = (key: string, dflt: boolean) =>
      isHidden(key) ? false : (base[key]?.required ?? dflt);

    const required: [string, unknown][] = [
      ["Student's full name", studentName],
      ["Guardian's name", guardianName],
      ["Email", email],
    ];
    if (!isHidden("gender")) required.push(["Gender", gender]);
    if (!isHidden("relationship")) required.push(["Relationship", relationship]);
    if (isRequired("dob", true)) required.push(["Date of birth", dob]);
    if (isRequired("phone", true)) required.push(["Phone", phone]);
    if (isRequired("address", true)) required.push(["Address", address]);
    if (isRequired("currentSchool", true)) required.push(["Current school", currentSchool]);

    for (const [label, value] of required) {
      if (!value || String(value).trim() === "") {
        return NextResponse.json(
          { error: `${label} is required.` },
          { status: 400 },
        );
      }
    }

    if (programme === "grade-6" && isRequired("currentGrade", true) && !currentGrade) {
      return NextResponse.json(
        { error: "Please select the grade your son is currently in." },
        { status: 400 },
      );
    }

    if (programme === "advanced-level") {
      if (!isHidden("stream") && (!stream || !STREAMS.includes(stream))) {
        return NextResponse.json(
          { error: "Please select a valid Advanced Level stream." },
          { status: 400 },
        );
      }
      if (isRequired("olYear", true) && !olYear) {
        return NextResponse.json(
          { error: "Please enter the year your son sat the O/L examination." },
          { status: 400 },
        );
      }
      if (isRequired("olResults", true) && !olResults) {
        return NextResponse.json(
          { error: "Please enter a summary of your son's O/L results." },
          { status: 400 },
        );
      }
    }

    const mediumValue = MEDIUMS.includes(medium)
      ? medium
      : isHidden("medium")
        ? "N/A"
        : "Sinhala";

    const [created] = await db
      .insert(admissionApplications)
      .values({
        programme: String(programme),
        studentName: String(studentName).trim(),
        dob: dob ? String(dob) : "",
        gender: gender ? String(gender) : "N/A",
        guardianName: String(guardianName).trim(),
        relationship: relationship ? String(relationship).trim() : "N/A",
        phone: phone ? String(phone).trim() : "",
        email: String(email).trim().toLowerCase(),
        address: address ? String(address).trim() : "",
        currentSchool: currentSchool ? String(currentSchool).trim() : "",
        currentGrade: currentGrade ? String(currentGrade) : null,
        stream: stream ? String(stream) : null,
        olYear: olYear ? String(olYear) : null,
        olResults: olResults ? String(olResults).trim() : null,
        olIndex: olIndex ? String(olIndex).trim() : null,
        medium: mediumValue,
        siblingName: siblingName ? String(siblingName).trim() : null,
        fatherOldThomian: fatherOldThomian ? String(fatherOldThomian) : null,
        fatherYears: fatherYears ? String(fatherYears) : null,
        housePreference: housePreference ? String(housePreference) : null,
        message: message ? String(message).trim() : null,
        extraData,
        status: "received",
      })
      .returning();

    const refCode = `ADM-${created.id.toString().padStart(4, "0")}`;
    const label =
      programme === "grade-6" ? "Grade 6 · 2027 intake" : "Advanced Level";

    /* v2.8.81.0 — one-way office heads-up (never blocks the reply). */
    const officeFields: [string, string][] = [
      ["Programme", label],
      ["Student", `${String(studentName).trim()} (${String(gender ?? "")})`],
      ["Date of birth", dob ? String(dob) : ""],
      ["Guardian", `${String(guardianName).trim()} (${String(relationship ?? "").trim()})`],
      ["Phone", phone ? String(phone).trim() : ""],
      ["Email", String(email).trim().toLowerCase()],
      [
        "Current school",
        `${String(currentSchool ?? "").trim()}${currentGrade ? ` · Grade ${String(currentGrade)}` : ""}`,
      ],
      ["Medium", mediumValue],
      ["Message", message ? String(message).trim().slice(0, 500) : ""],
    ];
    await notifyOfficeForm(
      "admission",
      refCode,
      String(studentName).trim(),
      officeFields.filter(([, value]) => value),
    ).catch(() => false);

    /* v2.8.85.0 — the applicant gets their own branded acknowledgement. */
    await sendSubmissionReceipt({
      to: String(email).trim().toLowerCase(),
      reference: refCode,
      submitterName: String(guardianName).trim(),
      title: "admission application",
      fields: [
        ["Programme", label],
        ["Student", String(studentName).trim()],
        ["Guardian", `${String(guardianName).trim()} (${String(relationship).trim()})`],
        ["Phone", String(phone).trim()],
      ],
      event: "admission",
    }).catch(() => false);

    /* v2.8.88.0 — the office's BELL learns instantly (after() keeps the
       work alive on serverless after the response returns). */
    after(() =>
      notifyAdminAlert({
        kind: "admission",
        title: `New application · ${refCode}`,
        body: `${String(studentName).trim()} — ${label}`,
        reference: refCode,
        linkUrl: programme === "grade-6" ? "/admin/forms/grade-6" : "/admin/forms/alevel",
      }),
    );

    return NextResponse.json({
      success: true,
      reference: refCode,
      programme: label,
      message: `Application for the ${label} received. The admissions office will contact you within five working days.`,
    });
  } catch (error) {
    console.error("Error creating admission application:", error);
    return NextResponse.json(
      {
        error:
          "We could not submit that application. Please try again or call the admissions office on +94 66 222 0175.",
      },
      { status: 500 },
    );
  }
}
