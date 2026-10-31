import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings, type CustomFormField } from "@/db/schema";
import { validateFieldList, type FormFieldType } from "@/lib/form-builder";
import type { EffectiveBaseField } from "@/lib/form-field-client";

/**
 * v2.8.85.0 — FIXED-FORM EXTRA FIELDS.
 *
 * The contact form and the admission application form are fixed forms —
 * their base fields live in code — but the office occasionally needs one
 * more question ("Which sport?", "Preferred interview day"). This module
 * stores the admin-built extra questions in site_settings (keyed rows with
 * jsonb values, the same table every other setting lives in) and hands them
 * to the public forms + the admin inbox.
 *
 * Rules (owner spec):
 *   · text-only types only — text / textarea / number / date / select /
 *     checkbox. NO file upload, NO email/phone/time on fixed forms
 *     (they duplicate base fields and complicate receipts);
 *   · at most 10 extra fields per form;
 *   · validation rides the shared validateFieldList with a type filter.
 */

export const FIXED_FORM_KEYS = ["contact", "admission"] as const;
export type FixedFormKey = (typeof FIXED_FORM_KEYS)[number];

export const FIXED_FORM_SETTING_KEYS: Record<FixedFormKey, string> = {
  contact: "contact_extra_fields",
  admission: "admission_extra_fields",
};

/** Field types allowed on fixed forms (file/email/phone/time are NOT). */
export const FIXED_FORM_FIELD_TYPES: readonly FormFieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
];

const FIXED_TYPE_SET = new Set<string>(FIXED_FORM_FIELD_TYPES);
export const FIXED_FORM_MAX_FIELDS = 10;

function readList(value: unknown): CustomFormField[] {
  if (!Array.isArray(value)) return [];
  // Only keep structurally valid fields of an allowed type — a type that
  // was removed from the allow-list later must never reach a public form.
  return value.filter(
    (f): f is CustomFormField =>
      Boolean(f) &&
      typeof f === "object" &&
      typeof (f as CustomFormField).id === "string" &&
      typeof (f as CustomFormField).label === "string" &&
      FIXED_TYPE_SET.has(String((f as CustomFormField).type)),
  );
}

/** The published extra fields for one fixed form (empty when none). */
export async function getFixedFormExtraFields(
  key: FixedFormKey,
): Promise<CustomFormField[]> {
  const [row] = await db
    .select({ publishedValue: siteSettings.publishedValue })
    .from(siteSettings)
    .where(eq(siteSettings.key, FIXED_FORM_SETTING_KEYS[key]))
    .limit(1);
  if (!row) return [];
  return readList(row.publishedValue);
}

/** The published extra fields for every fixed form, in one round-trip. */
export async function getAllFixedFormExtraFields(): Promise<
  Record<FixedFormKey, CustomFormField[]>
> {
  const rows = await db
    .select({ key: siteSettings.key, publishedValue: siteSettings.publishedValue })
    .from(siteSettings)
    .where(inArray(siteSettings.key, Object.values(FIXED_FORM_SETTING_KEYS)));
  const byKey = new Map(rows.map((r) => [r.key, readList(r.publishedValue)]));
  return {
    contact: byKey.get(FIXED_FORM_SETTING_KEYS.contact) ?? [],
    admission: byKey.get(FIXED_FORM_SETTING_KEYS.admission) ?? [],
  };
}

/**
 * Validate one list against the fixed-form rules. Mirrors validateFieldList
 * but rejects non-text field types and enforces the 10-field cap.
 */
export function validateFixedFormFieldList(fields: unknown): {
  ok: true;
  fields: CustomFormField[];
} | { ok: false; errors: string[] } {
  if (!Array.isArray(fields)) return { ok: false, errors: ["Fields must be a list."] };
  if (fields.length > FIXED_FORM_MAX_FIELDS) {
    return {
      ok: false,
      errors: [`A fixed form carries at most ${FIXED_FORM_MAX_FIELDS} extra fields.`],
    };
  }
  for (const raw of fields) {
    const type = String((raw as { type?: unknown } | null)?.type ?? "");
    if (!FIXED_TYPE_SET.has(type)) {
      return {
        ok: false,
        errors: [
          `"${type || "unknown"}" is not allowed on a fixed form — use text, textarea, number, date, select or checkbox.`,
        ],
      };
    }
  }
  const result = validateFieldList(fields);
  if (!result.ok) return result;
  // Double-guard: validateFieldList is the shared (full) validator.
  const filtered = result.fields.filter((f) => FIXED_TYPE_SET.has(f.type));
  if (filtered.length !== result.fields.length) {
    return { ok: false, errors: ["A field type is not allowed on a fixed form."] };
  }
  return { ok: true, fields: filtered };
}

/** Save both lists (one site_settings row per form, upsert by key). */
export async function setFixedFormExtraFields(
  values: { contact: CustomFormField[]; admission: CustomFormField[] },
  userId: number,
): Promise<void> {
  for (const key of FIXED_FORM_KEYS) {
    const settingKey = FIXED_FORM_SETTING_KEYS[key];
    const [existing] = await db
      .select({ id: siteSettings.id })
      .from(siteSettings)
      .where(eq(siteSettings.key, settingKey))
      .limit(1);
    if (existing) {
      await db
        .update(siteSettings)
        .set({ publishedValue: values[key], updatedBy: userId, updatedAt: new Date() })
        .where(eq(siteSettings.id, existing.id));
    } else {
      await db.insert(siteSettings).values({
        key: settingKey,
        draftValue: values[key],
        publishedValue: values[key],
        updatedBy: userId,
      });
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   v2.8.86.0 — BASE-FIELD OVERRIDES (edit the built-in questions).

   The contact + admission forms' BUILT-IN questions become admin-editable
   from the same Customize tab: label, placeholder, required on/off and
   hidden/shown — with per-field guard rails so the forms can never lose
   their function (the receipt needs a name + email; a contact needs a
   message). Overrides live in site_settings as
   { [fieldKey]: { label?, placeholder?, required?, hidden? } } and every
   consumer (public forms, validation, storage) reads the EFFECTIVE merge.
   ═══════════════════════════════════════════════════════════════════════ */

/** One admin override for a built-in question (all parts optional). */
export type FixedBaseOverride = {
  label?: string;
  placeholder?: string;
  required?: boolean;
  hidden?: boolean;
};

/** Canonical spec of one built-in question. */
export type FixedBaseFieldSpec = {
  key: string;
  label: string;
  required: boolean;
  /** The admin may hide it entirely. */
  hideable: boolean;
  /** The admin may drop the required flag. */
  canUnrequire: boolean;
  placeholder?: string;
  /** Admin-facing hint shown in the customize editor. */
  hint?: string;
};

export const FIXED_FORM_BASE_SETTING_KEYS: Record<FixedFormKey, string> = {
  contact: "contact_base_overrides",
  admission: "admission_base_overrides",
};

/**
 * The built-in questions, in display order. `hideable: false` marks the
 * fields a submission cannot function without (the receipt greets by the
 * name, replies and receipts need the email, a contact needs a message).
 */
export const FIXED_FORM_BASE_FIELDS: Record<FixedFormKey, FixedBaseFieldSpec[]> = {
  contact: [
    { key: "inquiryType", label: "Inquiry Type", required: true, hideable: true, canUnrequire: false, hint: "The type chips — always carries a selection. Hidden submissions are logged as General Inquiries." },
    { key: "name", label: "Full Name", required: true, hideable: false, canUnrequire: false, placeholder: "e.g. Mr. Sahan Jayawardena", hint: "Locked — the receipt and the office reply need a name." },
    { key: "email", label: "Email Address", required: true, hideable: false, canUnrequire: false, placeholder: "sahan@example.com", hint: "Locked — the receipt and the office reply need it." },
    { key: "phone", label: "Phone Number", required: true, hideable: true, canUnrequire: true, placeholder: "+94 77 123 4567" },
    { key: "grade", label: "Grade Applying For", required: false, hideable: true, canUnrequire: false, hint: "Only shows on admissions-type inquiries." },
    { key: "message", label: "Message / Details", required: true, hideable: false, canUnrequire: false, placeholder: "Please provide details regarding your inquiry...", hint: "Locked — the message is the point of the form." },
  ],
  admission: [
    { key: "studentName", label: "Student's full name", required: true, hideable: false, canUnrequire: false, placeholder: "Enter full name as in the birth certificate", hint: "Locked — every record starts with the student." },
    { key: "dob", label: "Date of birth", required: true, hideable: true, canUnrequire: true },
    { key: "gender", label: "Gender", required: true, hideable: true, canUnrequire: false, hint: "A select with a default; hidden records log N/A." },
    { key: "medium", label: "Medium", required: true, hideable: true, canUnrequire: false, hint: "A select with a default; hidden records log N/A." },
    { key: "currentGrade", label: "Current grade", required: true, hideable: true, canUnrequire: true, hint: "Grade 6 intake only." },
    { key: "currentSchool", label: "Current / previous school", required: true, hideable: true, canUnrequire: true, placeholder: "Name of present school" },
    { key: "stream", label: "Preferred stream", required: true, hideable: true, canUnrequire: false, hint: "A/L only — the stream chips stay required while visible." },
    { key: "olYear", label: "Year sat the O/L examination", required: true, hideable: true, canUnrequire: true, placeholder: "e.g. 2025", hint: "A/L only." },
    { key: "olIndex", label: "O/L index number", required: false, hideable: true, canUnrequire: false, placeholder: "Optional", hint: "A/L only — optional by default." },
    { key: "olResults", label: "O/L results summary", required: true, hideable: true, canUnrequire: true, hint: "A/L only." },
    { key: "guardianName", label: "Guardian's full name", required: true, hideable: false, canUnrequire: false, placeholder: "Full name", hint: "Locked — the receipt and the office reply greet the guardian." },
    { key: "relationship", label: "Relationship to student", required: true, hideable: true, canUnrequire: false, hint: "A select with a default; hidden records log N/A." },
    { key: "phone", label: "Phone", required: true, hideable: true, canUnrequire: true, placeholder: "+94 77 123 4567" },
    { key: "email", label: "Email", required: true, hideable: false, canUnrequire: false, placeholder: "you@example.com", hint: "Locked — the receipt and the office reply need it." },
    { key: "address", label: "Residential address", required: true, hideable: true, canUnrequire: true, placeholder: "Street, city, postal code" },
    { key: "siblingName", label: "Sibling already at the college", required: false, hideable: true, canUnrequire: false, placeholder: "Sibling's name & grade" },
    { key: "fatherOldThomian", label: "Is the father an Old Thomian?", required: false, hideable: true, canUnrequire: false },
    { key: "fatherYears", label: "Years at the college", required: false, hideable: true, canUnrequire: false, placeholder: "e.g. 1978 – 1990" },
    { key: "housePreference", label: "House preference (sibling legacy)", required: false, hideable: true, canUnrequire: false },
    { key: "message", label: "Anything else we should know?", required: false, hideable: true, canUnrequire: false, placeholder: "Optional message to the admissions office…" },
  ],
};

const BASE_FIELD_INDEX: Record<FixedFormKey, Map<string, FixedBaseFieldSpec>> = {
  contact: new Map(FIXED_FORM_BASE_FIELDS.contact.map((f) => [f.key, f])),
  admission: new Map(FIXED_FORM_BASE_FIELDS.admission.map((f) => [f.key, f])),
};

function readBaseOverrides(value: unknown): Record<string, FixedBaseOverride> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, FixedBaseOverride> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const part = raw as Record<string, unknown>;
    const override: FixedBaseOverride = {};
    if (typeof part.label === "string") override.label = part.label;
    if (typeof part.placeholder === "string") override.placeholder = part.placeholder;
    if (typeof part.required === "boolean") override.required = part.required;
    if (typeof part.hidden === "boolean") override.hidden = part.hidden;
    if (Object.keys(override).length) out[key] = override;
  }
  return out;
}

/** The stored overrides for one fixed form (empty object when none). */
export async function getFixedFormBaseOverrides(
  key: FixedFormKey,
): Promise<Record<string, FixedBaseOverride>> {
  const [row] = await db
    .select({ publishedValue: siteSettings.publishedValue })
    .from(siteSettings)
    .where(eq(siteSettings.key, FIXED_FORM_BASE_SETTING_KEYS[key]))
    .limit(1);
  if (!row) return {};
  return readBaseOverrides(row.publishedValue);
}

/** The RAW stored overrides for both fixed forms, in one round-trip. */
export async function getAllFixedFormBaseOverrides(): Promise<
  Record<FixedFormKey, Record<string, FixedBaseOverride>>
> {
  const rows = await db
    .select({ key: siteSettings.key, publishedValue: siteSettings.publishedValue })
    .from(siteSettings)
    .where(inArray(siteSettings.key, Object.values(FIXED_FORM_BASE_SETTING_KEYS)));
  const byKey = new Map(rows.map((r) => [r.key, readBaseOverrides(r.publishedValue)]));
  return {
    contact: byKey.get(FIXED_FORM_BASE_SETTING_KEYS.contact) ?? {},
    admission: byKey.get(FIXED_FORM_BASE_SETTING_KEYS.admission) ?? {},
  };
}

/** Defaults merged with the stored overrides — what the form should render. */
export function applyBaseOverrides(
  key: FixedFormKey,
  overrides: Record<string, FixedBaseOverride>,
): EffectiveBaseField[] {
  return FIXED_FORM_BASE_FIELDS[key].map((spec) => {
    const o = overrides[spec.key] ?? {};
    const hidden = o.hidden === true;
    const label = (o.label ?? "").trim() || spec.label;
    const placeholder = (o.placeholder ?? "").trim();
    return {
      key: spec.key,
      label,
      placeholder: placeholder || (spec.placeholder ?? ""),
      required: hidden ? false : (o.required ?? spec.required),
      hidden,
      canHide: spec.hideable,
      canUnrequire: spec.canUnrequire,
      hint: spec.hint,
    } satisfies EffectiveBaseField;
  });
}

/** Effective built-in questions for one fixed form (one round-trip). */
export async function getEffectiveBaseFields(
  key: FixedFormKey,
): Promise<EffectiveBaseField[]> {
  return applyBaseOverrides(key, await getFixedFormBaseOverrides(key));
}

/** Effective built-in questions for both fixed forms, in one round-trip. */
export async function getAllEffectiveBaseFields(): Promise<
  Record<FixedFormKey, EffectiveBaseField[]>
> {
  const rows = await db
    .select({ key: siteSettings.key, publishedValue: siteSettings.publishedValue })
    .from(siteSettings)
    .where(inArray(siteSettings.key, Object.values(FIXED_FORM_BASE_SETTING_KEYS)));
  const byKey = new Map(rows.map((r) => [r.key, readBaseOverrides(r.publishedValue)]));
  return {
    contact: applyBaseOverrides("contact", byKey.get(FIXED_FORM_BASE_SETTING_KEYS.contact) ?? {}),
    admission: applyBaseOverrides("admission", byKey.get(FIXED_FORM_BASE_SETTING_KEYS.admission) ?? {}),
  };
}

/** Validate one panel's override map against the canonical specs. */
export function validateFixedFormBaseOverrides(
  key: FixedFormKey,
  value: unknown,
): { ok: true; overrides: Record<string, FixedBaseOverride> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const raw = readBaseOverrides(value);
  const clean: Record<string, FixedBaseOverride> = {};
  for (const [fieldKey, override] of Object.entries(raw)) {
    const spec = BASE_FIELD_INDEX[key].get(fieldKey);
    if (!spec) {
      errors.push(`"${fieldKey}" is not a built-in question of this form.`);
      continue;
    }
    const cleanOverride: FixedBaseOverride = {};
    if (override.label !== undefined) {
      const label = override.label.trim().slice(0, 120);
      if (label) cleanOverride.label = label;
    }
    if (override.placeholder !== undefined) {
      const placeholder = override.placeholder.trim().slice(0, 200);
      if (placeholder) cleanOverride.placeholder = placeholder;
    }
    if (override.required !== undefined) {
      if (!override.required && !spec.canUnrequire) {
        errors.push(`"${spec.label}" must stay required.`);
      } else {
        cleanOverride.required = override.required;
      }
    }
    if (override.hidden !== undefined) {
      if (override.hidden && !spec.hideable) {
        errors.push(`"${spec.label}" cannot be hidden.`);
      } else {
        cleanOverride.hidden = override.hidden;
      }
    }
    if (Object.keys(cleanOverride).length) clean[fieldKey] = cleanOverride;
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, overrides: clean };
}

/** Save both panels' override maps (one site_settings row per form). */
export async function setFixedFormBaseOverrides(
  values: {
    contact: Record<string, FixedBaseOverride>;
    admission: Record<string, FixedBaseOverride>;
  },
  userId: number,
): Promise<void> {
  for (const key of FIXED_FORM_KEYS) {
    const settingKey = FIXED_FORM_BASE_SETTING_KEYS[key];
    const payload = values[key];
    const [existing] = await db
      .select({ id: siteSettings.id })
      .from(siteSettings)
      .where(eq(siteSettings.key, settingKey))
      .limit(1);
    if (existing) {
      await db
        .update(siteSettings)
        .set({ publishedValue: payload, updatedBy: userId, updatedAt: new Date() })
        .where(eq(siteSettings.id, existing.id));
    } else {
      await db.insert(siteSettings).values({
        key: settingKey,
        draftValue: payload,
        publishedValue: payload,
        updatedBy: userId,
      });
    }
  }
}
