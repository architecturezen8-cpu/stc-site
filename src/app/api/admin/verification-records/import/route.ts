import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { lmsEnrollments, lmsStudentRecords, lmsTeacherRecords } from "@/db/schema-lms";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureStudentPersonByAdmissionNo } from "@/lib/lms-identity";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  parseImportSheet,
  type ImportMapping,
  type ImportParseResult,
  type ImportType,
} from "@/lib/verification-import";

/* ────────────────────────────────────────────────────────────────────────
   Verification Records — EXCEL IMPORT (Task 25-c / the owner: "excel
   sheet import option ekak danna... headers scan karala auto headers
   genarate wela sampurna full verification record eka auto hadenna
   hadanna puluwan ne").

   POST multipart  type=student|teacher  stage=preview|commit  file=…

   · stage=preview parses the first sheet, scans the first 10 rows for the
     header row, AUTO-MAPS the recognised columns against synonym lists and
     returns the detected mapping + every data row with ready/invalid pills.
   v2.8.70.4 — the preview ALSO returns every sheet header + the suggested
     field→column mapping, and BOTH stages accept an optional `mapping`
     (JSON field→column) so the office can re-map columns before commit;
     columns mapped to no field ride along as extra_data on each record.
   · stage=commit inserts the valid rows (duplicates and invalid rows are
     skipped with reasons), materializes each new student person + checks
     the enrollment CALMLY per row (never fails the import), and writes
     ONE audit row for the whole import.
   ──────────────────────────────────────────────────────────────────── */

const IMPORT_FILE_MAX_BYTES = 10 * 1024 * 1024; /* 10 MB — a register sheet never needs more */

export async function POST(req: Request) {
  const session = await guardPortalOrLmsAdmin("edit");
  if (session instanceof NextResponse) return session;
  await ensureSchemaExtras();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart upload (type, stage and file)." },
      { status: 400 },
    );
  }

  const type = String(form.get("type") ?? "").trim();
  const stage = String(form.get("stage") ?? "").trim();
  const file = form.get("file");

  if (type !== "student" && type !== "teacher") {
    return NextResponse.json({ error: "Unknown record type." }, { status: 400 });
  }
  if (stage !== "preview" && stage !== "commit") {
    return NextResponse.json({ error: "Unknown import stage." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Choose an .xlsx, .xls or .csv file to import." },
      { status: 400 },
    );
  }
  if (file.size > IMPORT_FILE_MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is too large — keep the register sheet under 10 MB." },
      { status: 400 },
    );
  }

  /* v2.8.70.4 — the office's column mapping (field → column index) from
     the editor, optional: absent = the synonym auto-map. */
  let mappingOverride: ImportMapping | undefined;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping.trim()) {
    try {
      const parsedMapping = JSON.parse(rawMapping) as Record<string, unknown>;
      if (parsedMapping && typeof parsedMapping === "object") {
        mappingOverride = parsedMapping as ImportMapping;
      }
    } catch {
      return NextResponse.json(
        { error: "The column mapping could not be read — try the import again." },
        { status: 400 },
      );
    }
  }

  /* Parse → first sheet → array-of-arrays. SheetJS reads .xlsx, .xls and
     .csv alike, so no extension gate is needed — the bytes decide. */
  let parsed: ImportParseResult;
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet || !workbook.Sheets[firstSheet]) {
      return NextResponse.json(
        { error: "The workbook has no readable sheets." },
        { status: 400 },
      );
    }
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], {
      header: 1,
      raw: false,
      defval: "",
    });
    parsed = parseImportSheet(matrix, type as ImportType, mappingOverride);
  } catch {
    return NextResponse.json(
      { error: "That file could not be read as a spreadsheet (.xlsx, .xls or .csv)." },
      { status: 400 },
    );
  }

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    if (stage === "preview") {
      return NextResponse.json({
        ok: true,
        mapped: parsed.mapped,
        mapping: parsed.mapping,
        headers: parsed.headers,
        unmapped: parsed.unmapped,
        rows: parsed.rows,
        validCount: parsed.validCount,
        invalidCount: parsed.invalidCount,
      });
    }

    /* ── stage=commit ────────────────────────────────────────────────────
       Existing identities are fetched FIRST so every duplicate is skipped
       before it can touch the unique constraint; repeats WITHIN the file
       are caught by a second set. */
    const existingKeys = new Set<string>();
    if (type === "student") {
      const rows = await db
        .select({ admissionNo: lmsStudentRecords.admissionNo })
        .from(lmsStudentRecords);
      for (const row of rows) existingKeys.add(row.admissionNo.trim().toLowerCase());
    } else {
      const rows = await db
        .select({ teacherId: lmsTeacherRecords.teacherId })
        .from(lmsTeacherRecords);
      for (const row of rows) existingKeys.add(row.teacherId.trim().toLowerCase());
    }

    let created = 0;
    let autoEnrolled = 0;
    const skipped: { rowNumber: number; reason: string }[] = [];
    const seenInFile = new Set<string>();

    for (const row of parsed.rows) {
      if (row.status !== "valid") {
        skipped.push({ rowNumber: row.rowNumber, reason: row.error ?? "Invalid row." });
        continue;
      }
      const values = row.values;

      if (type === "student") {
        const key = values.admissionNo!.trim().toLowerCase();
        if (existingKeys.has(key)) {
          skipped.push({
            rowNumber: row.rowNumber,
            reason: `Admission no ${values.admissionNo} is already on the register.`,
          });
          continue;
        }
        if (seenInFile.has(key)) {
          skipped.push({
            rowNumber: row.rowNumber,
            reason: `Admission no ${values.admissionNo} repeats earlier in this file.`,
          });
          continue;
        }
        seenInFile.add(key);

        try {
          /* v2.8.70.4 — columns mapped to no field are preserved as JSON
             so the register keeps the sheet's full detail. */
          const extraData =
            Object.keys(row.extra ?? {}).length > 0 ? JSON.stringify(row.extra) : null;
          const [inserted] = await db
            .insert(lmsStudentRecords)
            .values({
              admissionNo: values.admissionNo!,
              registerNo: values.registerNo || null,
              fullName: values.fullName!,
              className: values.className!,
              fatherName: values.fatherName || "",
              motherName: values.motherName || "",
              phone: values.phone || null,
              email: values.email || null,
              extraData,
            })
            .returning();
          created++;

          /* Same calm block as the single POST: materialize the person and
             confirm the enrollment, but NEVER let it fail the import. */
          try {
            const person = await ensureStudentPersonByAdmissionNo(inserted.admissionNo, null);
            if (person) {
              const [enrollment] = await db
                .select({ classId: lmsEnrollments.classId })
                .from(lmsEnrollments)
                .where(eq(lmsEnrollments.studentId, person.id))
                .limit(1);
              if (enrollment) autoEnrolled++;
            }
          } catch {
            /* calm degradation — manual enrollment stays available */
          }
        } catch (error) {
          const pgCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
          skipped.push({
            rowNumber: row.rowNumber,
            reason:
              pgCode === "23505" ||
              (error instanceof Error && error.message.includes("duplicate key"))
                ? `Admission no ${values.admissionNo} is already on the register.`
                : "This row could not be saved — check the details and add it by hand.",
          });
        }
        continue;
      }

      /* teacher */
      const key = values.teacherId!.trim().toLowerCase();
      if (existingKeys.has(key)) {
        skipped.push({
          rowNumber: row.rowNumber,
          reason: `Teacher ID ${values.teacherId} is already on the register.`,
        });
        continue;
      }
      if (seenInFile.has(key)) {
        skipped.push({
          rowNumber: row.rowNumber,
          reason: `Teacher ID ${values.teacherId} repeats earlier in this file.`,
        });
        continue;
      }
      seenInFile.add(key);

      try {
        await db.insert(lmsTeacherRecords).values({
          teacherId: values.teacherId!,
          fullName: values.fullName!,
          email: values.email || null,
          phone: values.phone || null,
          designation: values.designation || null,
          /* v2.8.70.4 — unmapped columns preserved (see the student arm). */
          extraData:
            Object.keys(row.extra ?? {}).length > 0 ? JSON.stringify(row.extra) : null,
        });
        created++;
      } catch (error) {
        const pgCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
        skipped.push({
          rowNumber: row.rowNumber,
          reason:
            pgCode === "23505" || (error instanceof Error && error.message.includes("duplicate key"))
              ? `Teacher ID ${values.teacherId} is already on the register.`
              : "This row could not be saved — check the details and add it by hand.",
        });
      }
    }

    /* ONE audit row for the whole import (details is jsonb — an object
       works, same as the PATCH handler's { classChanged, ... }). */
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "verification_records_imported",
      entity: type === "student" ? "lms_student_records" : "lms_teacher_records",
      details: { created, skipped: skipped.length, valid: parsed.validCount },
    });

    return NextResponse.json({ ok: true, created, skipped, autoEnrolled });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import the records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
