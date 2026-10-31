import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { fieldFromExcelHeader } from "@/lib/form-builder";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — EXCEL IMPORT for the Form Builder.
 *
 * The office keeps its paper registers as spreadsheets; this route reads
 * the FIRST SHEET's HEADER ROW ONLY and turns every header cell into a
 * best-guess field (type sniffed from the label — e-mail → email,
 * phone → phone, date/dob → date, age/number → number, notes/address →
 * textarea). The generated fields are NOT saved — the builder UI merges
 * them into the editor so the admin adjusts (required, options, order)
 * BEFORE hitting Save.
 */

const IMPORT_FILE_MAX_BYTES = 10 * 1024 * 1024; /* a header sheet never needs more */
const MAX_FIELDS = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid form id." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart upload with an .xlsx file." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an .xlsx file to import." }, { status: 400 });
  }
  if (file.size > IMPORT_FILE_MAX_BYTES) {
    return NextResponse.json(
      { error: "That file is too large — keep it under 10 MB." },
      { status: 400 },
    );
  }

  let fields;
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet || !workbook.Sheets[firstSheet]) {
      return NextResponse.json({ error: "The workbook has no readable sheets." }, { status: 400 });
    }
    /* Header row only — the builder wants COLUMN TITLES, not the data. */
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], {
      header: 1,
      raw: false,
      defval: "",
    });
    const headerRow = (matrix[0] ?? []).map((cell) => String(cell ?? "").trim());
    const headers = headerRow.filter(Boolean).slice(0, MAX_FIELDS);
    if (!headers.length) {
      return NextResponse.json(
        { error: "The first row has no readable column titles." },
        { status: 400 },
      );
    }
    fields = headers.map((header, index) => fieldFromExcelHeader(header, index));
  } catch {
    return NextResponse.json(
      { error: "That file could not be read as a spreadsheet (.xlsx, .xls or .csv)." },
      { status: 400 },
    );
  }

  await db.insert(adminAuditLogs).values({
    userId: admin.id,
    action: "custom_form_excel_import",
    entity: "custom_form",
    entityId: String(id),
    details: { columns: fields.length, fileName: file.name.slice(0, 120) },
  });

  return NextResponse.json({ ok: true, count: fields.length, fields });
}
