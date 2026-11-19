"use client";

import type { CustomFormField } from "@/db/schema";

/**
 * v2.8.85.0 — the admin-configured EXTRA questions on the FIXED public
 * forms (contact + admission application). Purely presentational: the host
 * form owns the values state and posts them as `extraData` (field id →
 * value) inside its existing JSON body. Only the text-only types the admin
 * customize tab allows can appear here (no file upload on fixed forms).
 */

export function FixedFormExtraFields({
  fields,
  values,
  onValue,
  inputClassName,
}: {
  fields: CustomFormField[];
  values: Record<string, string>;
  onValue: (fieldId: string, value: string) => void;
  /** Matches the host form's input styling. */
  inputClassName: string;
}) {
  if (!fields.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.id] ?? "";
        const id = `extra-${field.id}`;
        return (
          <label key={field.id} className={`block min-w-0 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}>
            <span className="mb-2 block font-sans text-[10px] uppercase tracking-[0.2em] text-fg/50">
              {field.label} {field.required ? <span className="text-red-500">*</span> : null}
            </span>
            {field.type === "textarea" ? (
              <textarea
                id={id}
                rows={3}
                required={field.required}
                value={value}
                onChange={(e) => onValue(field.id, e.target.value)}
                placeholder={field.placeholder || ""}
                className={`${inputClassName} h-auto resize-none py-3`}
              />
            ) : field.type === "select" ? (
              <select
                id={id}
                required={field.required}
                value={value}
                onChange={(e) => onValue(field.id, e.target.value)}
                className={inputClassName}
              >
                <option value="">{field.placeholder || "Select…"}</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <span
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm text-fg/80 transition-colors hover:border-fg/40 ${
                  value === "Yes" ? "border-gold bg-gold/10" : "border-fg/15"
                }`}
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={value === "Yes"}
                  onChange={(e) => onValue(field.id, e.target.checked ? "Yes" : "")}
                  className="h-4 w-4 shrink-0 accent-gold"
                />
                {field.placeholder || "Yes"}
              </span>
            ) : (
              <input
                id={id}
                type={field.type === "number" ? "text" : field.type === "date" ? "date" : "text"}
                inputMode={field.type === "number" ? "decimal" : undefined}
                required={field.required}
                value={value}
                onChange={(e) => onValue(field.id, e.target.value)}
                placeholder={field.placeholder || ""}
                className={inputClassName}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
