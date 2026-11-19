import "server-only";

import { randomUUID } from "node:crypto";
import type { CustomFormField } from "@/db/schema";

/**
 * v2.8.85.0 — SHARED FORM-BUILDER CONTRACT.
 *
 * Every custom-form surface (public renderer, public submit API, admin
 * builder, Excel import, submissions explorer) imports its rules from HERE
 * so the schema, validation and file-key conventions can never drift apart:
 *
 *   · field types are a closed set — the renderer and the validator agree;
 *   · a submission's `data` maps field.id → string value (files ride the
 *     separate `files` array — the object key, never the bytes);
 *   · file object keys live under `forms/{slug}/…` inside the SAME bucket
 *     every other feature uses, so the Storage Explorer sees them too;
 *   · ref codes are "SF-0001" (Special Form) — handed to the submitter and
 *     reused by the office heads-up email + receipt email.
 */

/** The closed set of field types the builder offers. */
export const FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "email",
  "phone",
  "date",
  "time",
  "select",
  "radio",
  "checkbox",
  "file",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  email: "Email",
  phone: "Phone",
  date: "Date",
  time: "Time",
  select: "Dropdown",
  radio: "Choice list",
  checkbox: "Checkbox",
  file: "File / image upload",
};

/** Types that need an options list (select / radio). */
export const OPTION_FIELD_TYPES: ReadonlySet<string> = new Set(["select", "radio"]);

/** Form file caps — mirrors the portal (documents 20 MB, video 100 MB). */
export const FORM_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** A form allows at most this many files across all its file fields. */
export const FORM_MAX_FILES = 5;

export type FieldsIssue = { fieldId: string; error: string };

/** Structural validation for a saved fields array (admin builder + Excel import). */
export function validateFieldList(fields: unknown): { ok: true; fields: CustomFormField[] } | { ok: false; errors: string[] } {
  if (!Array.isArray(fields)) return { ok: false, errors: ["Fields must be a list."] };
  const errors: string[] = [];
  const seen = new Set<string>();
  const clean: CustomFormField[] = [];

  fields.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      errors.push(`Field ${index + 1} is malformed.`);
      return;
    }
    const f = raw as Partial<CustomFormField>;
    const label = String(f.label ?? "").trim();
    if (!label) errors.push(`Field ${index + 1} needs a label.`);
    if (!FORM_FIELD_TYPES.includes(f.type as FormFieldType)) {
      errors.push(`Field "${label}" has an unknown type "${f.type}".`);
      return;
    }
    let id = String(f.id ?? "").trim();
    if (!id || seen.has(id)) id = `f${index + 1}-${randomUUID().slice(0, 6)}`;
    seen.add(id);

    const field: CustomFormField = {
      id,
      label: label.slice(0, 120),
      type: f.type as FormFieldType,
      required: Boolean(f.required),
    };
    if (f.placeholder) field.placeholder = String(f.placeholder).slice(0, 120);
    if (f.helpText) field.helpText = String(f.helpText).slice(0, 240);
    if (OPTION_FIELD_TYPES.has(field.type)) {
      const options = (Array.isArray(f.options) ? f.options : [])
        .map((o) => String(o ?? "").trim())
        .filter(Boolean)
        .slice(0, 30);
      if (options.length < 2) {
        errors.push(`"${label}" needs at least 2 options.`);
      }
      field.options = options;
    }
    if (field.type === "file") {
      if (f.acceptImages) field.acceptImages = true;
      if (f.multiple) field.multiple = true;
    }
    clean.push(field);
  });

  return errors.length ? { ok: false, errors } : { ok: true, fields: clean };
}

/** URL-safe slug for a form (title fallback keeps it readable). */
export function slugifyFormTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
  return base || `form-${randomUUID().slice(0, 6)}`;
}

/** Is the form's optional collection window accepting submissions right now? */
export function isFormWindowOpen(
  openAt: Date | null,
  closeAt: Date | null,
  now = new Date(),
): { open: boolean; reason: string } {
  if (openAt && now < openAt) {
    return { open: false, reason: "This form opens on " + openAt.toISOString().slice(0, 10) + "." };
  }
  if (closeAt && now > closeAt) {
    return { open: false, reason: "This form closed on " + closeAt.toISOString().slice(0, 10) + "." };
  }
  return { open: true, reason: "" };
}

/** The form's first email-typed field — drives the receipt email address. */
export function detectEmailField(fields: CustomFormField[]): CustomFormField | null {
  return fields.find((f) => f.type === "email") ?? null;
}

/** Bucket key for one uploaded form file: `forms/{slug}/{uuid}-{safe-name}`. */
export function buildFormFileKey(slug: string, fileName: string): string {
  const safe = fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-120) || "file";
  return `forms/${slug}/${randomUUID()}-${safe}`;
}

export type ValidatedSubmission = {
  ok: true;
  data: Record<string, string>;
  submitterEmail: string | null;
};

/**
 * Server-side check of one submission against the form's field list.
 * Unknown fields are dropped, required fields enforced, options verified,
 * and long values trimmed — the client cannot inject anything else.
 */
export function validateSubmissionData(
  fields: CustomFormField[],
  raw: unknown,
): { ok: false; issues: FieldsIssue[] } | ValidatedSubmission {
  const issues: FieldsIssue[] = [];
  const data: Record<string, string> = {};
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  for (const field of fields) {
    if (field.type === "file") continue; // files are validated separately
    const value = typeof input[field.id] === "string" ? (input[field.id] as string).trim() : "";
    if (field.required && !value) {
      issues.push({ fieldId: field.id, error: `"${field.label}" is required.` });
      continue;
    }
    if (!value) continue;
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      issues.push({ fieldId: field.id, error: `"${field.label}" needs a valid email address.` });
      continue;
    }
    if (field.type === "number" && !/^-?\d+(\.\d+)?$/.test(value)) {
      issues.push({ fieldId: field.id, error: `"${field.label}" must be a number.` });
      continue;
    }
    if (OPTION_FIELD_TYPES.has(field.type) && field.options && !field.options.includes(value)) {
      issues.push({ fieldId: field.id, error: `"${field.label}" has an invalid choice.` });
      continue;
    }
    data[field.id] = value.slice(0, 2000);
  }

  const emailField = detectEmailField(fields);
  const submitterEmail =
    emailField && data[emailField.id] ? data[emailField.id].toLowerCase() : null;

  return issues.length ? { ok: false, issues } : { ok: true, data, submitterEmail };
}

/** Human "SF-0007" reference for a new submission id. */
export function formRefCode(id: number): string {
  return `SF-${String(id).padStart(4, "0")}`;
}

/** Excel import: turn one header cell into a best-guess field definition. */
export function fieldFromExcelHeader(header: string, index: number): CustomFormField {
  const label = header.trim().slice(0, 120) || `Column ${index + 1}`;
  const lower = label.toLowerCase();
  let type: FormFieldType = "text";
  if (/e-?mail/.test(lower)) type = "email";
  else if (/phone|mobile|contact no|telephone/.test(lower)) type = "phone";
  else if (/date|dob|birthday|birth day/.test(lower)) type = "date";
  else if (/time/.test(lower)) type = "time";
  else if (/age|no\b|number|count|amount|marks|index/.test(lower)) type = "number";
  else if (/note|remark|comment|address|message|detail/.test(lower)) type = "textarea";
  const field: CustomFormField = {
    id: `f${index + 1}-${randomUUID().slice(0, 6)}`,
    label,
    type,
    required: index === 0, // the first column (usually a name) starts required; the admin adjusts
  };
  return field;
}
