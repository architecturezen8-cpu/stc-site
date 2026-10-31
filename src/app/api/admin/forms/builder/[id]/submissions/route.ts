import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { adminAuditLogs, customFormSubmissions, customForms } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { formRefCode } from "@/lib/form-builder";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — ADMIN submissions for one custom form.
 *
 * GET /api/admin/forms/builder/[id]/submissions          → the list (newest
 *     first; the viewer scrolls), every row carrying its files array.
 * GET /api/admin/forms/builder/[id]/submissions?export=1 → an .xlsx workbook
 *     download: one column per field label (form field order) + Reference +
 *     Submitted; the files column joins the file names with commas.
 */

const LIST_LIMIT = 500;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const { id: rawId } = await ctx.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid form id." }, { status: 400 });
  }

  const [form] = await db.select().from(customForms).where(eq(customForms.id, id)).limit(1);
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  const rows = await db
    .select()
    .from(customFormSubmissions)
    .where(eq(customFormSubmissions.formId, id))
    .orderBy(desc(customFormSubmissions.createdAt))
    .limit(LIST_LIMIT);

  const exportMode = new URL(req.url).searchParams.get("export") === "1";

  if (!exportMode) {
    return NextResponse.json({
      form: {
        id: form.id,
        slug: form.slug,
        title: form.title,
        fields: form.fields,
      },
      rows,
      total: rows.length,
      truncated: rows.length >= LIST_LIMIT,
    });
  }

  /* ── Excel export ────────────────────────────────────────────────────── */
  const header: string[] = ["Reference", "Submitted"];
  for (const field of form.fields) header.push(field.label);
  header.push("Files");

  const aoa: (string | number)[][] = [header];
  for (const row of rows) {
    const line: (string | number)[] = [
      row.refCode || formRefCode(row.id),
      row.createdAt.toISOString().replace("T", " ").slice(0, 16),
    ];
    for (const field of form.fields) {
      line.push(row.data?.[field.id] ?? "");
    }
    line.push(row.files.map((f) => f.fileName).join(", "));
    aoa.push(line);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  /* Sensible widths: reference + timestamps fixed, answers capped. */
  sheet["!cols"] = header.map((h, i) => ({
    wch: i < 2 ? 18 : Math.min(40, Math.max(14, h.length + 4)),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Submissions");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await db.insert(adminAuditLogs).values({
    userId: admin.id,
    action: "custom_form_submissions_export",
    entity: "custom_form",
    entityId: String(id),
    details: { rows: rows.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = form.slug.replace(/[^a-z0-9-]/g, "") || "form";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="${safeName}-submissions-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * DELETE /api/admin/forms/builder/[id]/submissions?rowId=123 — remove ONE
 * submission (best-effort deletion of its stored files first, same policy
 * as the form-level cascade).
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const { id: rawId } = await ctx.params;
  const formId = Number(rawId);
  const rowId = Number(new URL(req.url).searchParams.get("rowId"));
  if (!Number.isInteger(formId) || formId <= 0 || !Number.isInteger(rowId) || rowId <= 0) {
    return NextResponse.json({ error: "Invalid form or submission id." }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(customFormSubmissions)
    .where(eq(customFormSubmissions.id, rowId))
    .limit(1);
  if (!row || row.formId !== formId) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  if (row.files.length) {
    const storage = getStorage();
    await Promise.allSettled(row.files.map((f) => storage.deleteObject(f.key)));
  }

  await db.delete(customFormSubmissions).where(eq(customFormSubmissions.id, rowId));
  await db.insert(adminAuditLogs).values({
    userId: admin.id,
    action: "delete_custom_form_submission",
    entity: "custom_form_submission",
    entityId: String(rowId),
    details: { formId, refCode: row.refCode },
  });

  return NextResponse.json({ ok: true });
}
