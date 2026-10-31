import { randomUUID } from "node:crypto";
import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customFormSubmissions, customForms, type CustomFormField } from "@/db/schema";
import { notifyOfficeForm } from "@/lib/office-notify";
import { sendSubmissionReceipt } from "@/lib/mailer";
import { notifyAdminAlert } from "@/lib/admin-alerts";
import {
  FORM_FILE_MAX_BYTES,
  FORM_MAX_FILES,
  formRefCode,
  isFormWindowOpen,
  validateSubmissionData,
} from "@/lib/form-builder";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — PUBLIC submit for a custom Form Builder form.
 *
 * Flow: load the form by slug → published + collection-window checks →
 * validate the answer set against the form's fields → pin the uploaded
 * files (keys only — bytes are already in storage) → insert the row →
 * derive the human "SF-0001" reference from the row id → fire the office
 * heads-up + the submitter receipt CALMLY (never block the answer on mail).
 *
 * Rate limiting lives in the middleware (public form-post bucket, every
 * POST under /api/forms).
 */

type IncomingFile = {
  fieldId: string;
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/** Structural + ownership check of the client's files array. */
function sanitiseFiles(
  raw: unknown,
  slug: string,
  fields: CustomFormField[],
): { ok: true; files: IncomingFile[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "The file list is malformed." };
  if (raw.length > FORM_MAX_FILES) {
    return { ok: false, error: `A submission carries at most ${FORM_MAX_FILES} files.` };
  }
  const fileFields = new Set(
    fields.filter((f) => f.type === "file").map((f) => f.id),
  );
  const files: IncomingFile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "The file list is malformed." };
    }
    const f = entry as Partial<IncomingFile>;
    const key = typeof f.key === "string" ? f.key : "";
    if (!key.startsWith(`forms/${slug}/`) || key.length > 300) {
      return { ok: false, error: "One of the uploaded files is not registered to this form." };
    }
    if (typeof f.fieldId !== "string" || !fileFields.has(f.fieldId)) {
      return { ok: false, error: "One of the uploaded files does not belong to a file question." };
    }
    if (typeof f.sizeBytes !== "number" || f.sizeBytes <= 0 || f.sizeBytes > FORM_FILE_MAX_BYTES) {
      return { ok: false, error: "One of the uploaded files is too large." };
    }
    files.push({
      fieldId: f.fieldId,
      key,
      fileName: String(f.fileName ?? "file").slice(0, 180),
      mimeType: String(f.mimeType ?? "application/octet-stream").slice(0, 100),
      sizeBytes: Math.round(f.sizeBytes),
    });
  }
  return { ok: true, files };
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  await ensureSchemaExtras();

  const { slug } = await ctx.params;
  const [form] = await db
    .select()
    .from(customForms)
    .where(eq(customForms.slug, slug))
    .limit(1);
  if (!form || !form.published) {
    return NextResponse.json({ ok: false, error: "This form does not exist." }, { status: 404 });
  }

  const window = isFormWindowOpen(form.openAt, form.closeAt);
  if (!window.open) {
    return NextResponse.json({ ok: false, error: window.reason }, { status: 403 });
  }

  let body: { data?: unknown; files?: unknown } | null;
  try {
    body = (await req.json()) as { data?: unknown; files?: unknown } | null;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const verdict = validateSubmissionData(form.fields, body?.data);
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, error: "Please fix the highlighted answers.", issues: verdict.issues },
      { status: 400 },
    );
  }

  const filesCheck = sanitiseFiles(body?.files, form.slug, form.fields);
  if (!filesCheck.ok) {
    return NextResponse.json({ ok: false, error: filesCheck.error }, { status: 400 });
  }

  /* The reference code needs the row id, and ref_code is NOT NULL — insert
     with a throwaway unique code, then stamp the real one. */
  const [row] = await db
    .insert(customFormSubmissions)
    .values({
      formId: form.id,
      refCode: `SF-TMP-${randomUUID().slice(0, 8)}`,
      data: verdict.data,
      files: filesCheck.files,
      submitterEmail: verdict.submitterEmail,
    })
    .returning();
  const reference = formRefCode(row.id);
  await db
    .update(customFormSubmissions)
    .set({ refCode: reference })
    .where(eq(customFormSubmissions.id, row.id));

  /* v2.8.88.0 — the office's BELL learns instantly (after() keeps the work
     alive on serverless after the response returns). */
  after(() =>
    notifyAdminAlert({
      kind: "special_form",
      title: `New form submission · ${reference}`,
      body: `${form.title} — ${verdict.submitterEmail || "no email given"}`,
      reference,
      linkUrl: "/admin/forms/builder",
    }),
  );

  /* Labelled rows for the two emails (answer order, files summarised). */
  const allRows: [string, string][] = [];
  for (const field of form.fields) {
    const value = verdict.data[field.id];
    if (value) allRows.push([field.label, value]);
    const fieldFiles = filesCheck.files.filter((f) => f.fieldId === field.id);
    if (fieldFiles.length) {
      allRows.push([field.label, fieldFiles.map((f) => f.fileName).join(", ")]);
    }
  }
  const emailRows = allRows.slice(0, 8);

  /* Office heads-up — same one-way chain the fixed forms use.
     v2.8.87.2 — was a bare `void` fire-and-forget: on Vercel serverless the
     lambda can freeze right after the response and kill the in-flight
     Mailjet fetch (the same production failure that hit the appointment
     status email). after() runs the send inside the platform's waitUntil
     window instead — the visitor's response is unchanged. */
  if (form.officeNotify) {
    after(() =>
      notifyOfficeForm("special_form", reference, form.title, emailRows)
        .then((sent) =>
          console.info(
            `[office-notify] ${reference} (${form.slug}): ${sent ? "sent" : "skipped/failed"}`,
          ),
        )
        .catch(() => false),
    );
  }

  /* Submitter receipt — only when the form opts in AND an email was given. */
  if (form.receiptEmail && verdict.submitterEmail) {
    const nameField = form.fields.find(
      (f) => (f.type === "text" || f.type === "textarea") && /name/i.test(f.label),
    );
    const submitterName =
      (nameField ? verdict.data[nameField.id]?.trim() : "") || "there";
    const sent = await sendSubmissionReceipt({
      to: verdict.submitterEmail,
      reference,
      submitterName,
      title: form.title,
      fields: emailRows,
      event: "special_form",
    }).catch(() => false);
    if (sent) {
      await db
        .update(customFormSubmissions)
        .set({ receiptSent: true })
        .where(eq(customFormSubmissions.id, row.id));
    }
  }

  return NextResponse.json({
    ok: true,
    reference,
    message: `Your submission has been received. Keep the reference ${reference} — the office may ask for it.`,
  });
}
