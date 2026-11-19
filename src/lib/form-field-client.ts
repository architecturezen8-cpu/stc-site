/**
 * v2.8.85.0 — CLIENT-SAFE field-type rules.
 *
 * src/lib/form-builder.ts is `server-only`; the client editors need one
 * tiny rule from it — which field types carry an options list. This mirror
 * keeps the browser bundle free of the server contract. Keep in sync with
 * OPTION_FIELD_TYPES in src/lib/form-builder.ts.
 */

export const OPTION_FIELD_TYPES: ReadonlySet<string> = new Set(["select", "radio"]);

/**
 * v2.8.87.0 — client-safe mirror of FORM_FIELD_TYPE_LABELS in the
 * server-only src/lib/form-builder.ts. The editor cards show the human type
 * name ("Short text", "Dropdown"…) as a chip beside each question. Keep in
 * sync with the server contract.
 */
export const FORM_FIELD_TYPE_LABELS_CLIENT: Record<string, string> = {
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
  file: "File upload",
};

/* ── v2.8.86.0 — FIXED-FORM BASE FIELDS (client-safe types) ─────────────
   The built-in questions of the contact + admission forms are editable
   from the Customize tab: label, placeholder, required on/off and
   hidden/shown — within per-field guard rails the server enforces. The
   public forms receive the EFFECTIVE list (defaults merged with the
   stored overrides) from their server pages; these types + helper keep
   that contract free of the server-only modules. */

/** One built-in question as the public form should render it. */
export type EffectiveBaseField = {
  /** Body/db key — e.g. "phone", "studentName", "olYear". */
  key: string;
  /** Effective display label (override applied). */
  label: string;
  /** Effective placeholder (override applied; "" when none). */
  placeholder: string;
  /** Effective required flag (override applied; hidden fields read false). */
  required: boolean;
  /** Effective hidden flag — the host form must not render/submit it. */
  hidden: boolean;
  /** Admin may hide this field at all (core fields are locked visible). */
  canHide: boolean;
  /** Admin may turn the required flag off. */
  canUnrequire: boolean;
  /** Admin-facing hint (why a control is locked). */
  hint?: string;
};

/** Look up one effective base field by key. */
export function findBaseField(
  baseFields: EffectiveBaseField[] | undefined,
  key: string,
): EffectiveBaseField | undefined {
  return baseFields?.find((f) => f.key === key);
}

/** Effective label or the component's built-in fallback. */
export function baseLabel(
  baseFields: EffectiveBaseField[] | undefined,
  key: string,
  fallback: string,
): string {
  return findBaseField(baseFields, key)?.label ?? fallback;
}

/** Effective required flag or the component's built-in fallback. */
export function baseRequired(
  baseFields: EffectiveBaseField[] | undefined,
  key: string,
  fallback: boolean,
): boolean {
  return findBaseField(baseFields, key)?.required ?? fallback;
}

/** Effective placeholder ("" → use the component's built-in fallback). */
export function basePlaceholder(
  baseFields: EffectiveBaseField[] | undefined,
  key: string,
  fallback: string,
): string {
  return findBaseField(baseFields, key)?.placeholder || fallback;
}

/** True when the admin hid this built-in question. */
export function baseHidden(
  baseFields: EffectiveBaseField[] | undefined,
  key: string,
): boolean {
  return findBaseField(baseFields, key)?.hidden === true;
}
