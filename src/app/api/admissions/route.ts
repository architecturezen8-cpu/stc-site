import { NextResponse } from "next/server";
import { db } from "@/db";
import { admissionApplications } from "@/db/schema";

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

    if (!PROGRAMMES.includes(programme)) {
      return NextResponse.json(
        { error: "Please choose either the Grade 6 intake or Advanced Level admissions." },
        { status: 400 },
      );
    }

    const required: [string, unknown][] = [
      ["Student's full name", studentName],
      ["Date of birth", dob],
      ["Gender", gender],
      ["Guardian's name", guardianName],
      ["Relationship", relationship],
      ["Phone", phone],
      ["Email", email],
      ["Address", address],
      ["Current school", currentSchool],
    ];

    for (const [label, value] of required) {
      if (!value || String(value).trim() === "") {
        return NextResponse.json(
          { error: `${label} is required.` },
          { status: 400 },
        );
      }
    }

    if (programme === "grade-6" && !currentGrade) {
      return NextResponse.json(
        { error: "Please select the grade your son is currently in." },
        { status: 400 },
      );
    }

    if (programme === "advanced-level") {
      if (!stream || !STREAMS.includes(stream)) {
        return NextResponse.json(
          { error: "Please select a valid Advanced Level stream." },
          { status: 400 },
        );
      }
      if (!olYear) {
        return NextResponse.json(
          { error: "Please enter the year your son sat the O/L examination." },
          { status: 400 },
        );
      }
    }

    const mediumValue = MEDIUMS.includes(medium) ? medium : "Sinhala";

    const [created] = await db
      .insert(admissionApplications)
      .values({
        programme: String(programme),
        studentName: String(studentName).trim(),
        dob: String(dob),
        gender: String(gender),
        guardianName: String(guardianName).trim(),
        relationship: String(relationship).trim(),
        phone: String(phone).trim(),
        email: String(email).trim().toLowerCase(),
        address: String(address).trim(),
        currentSchool: String(currentSchool).trim(),
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
        status: "received",
      })
      .returning();

    const refCode = `ADM-${created.id.toString().padStart(4, "0")}`;
    const label =
      programme === "grade-6" ? "Grade 6 · 2027 intake" : "Advanced Level";

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
