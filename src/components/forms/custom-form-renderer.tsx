"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Paperclip, Send, Upload, X } from "lucide-react";
import type { CustomFormField } from "@/db/schema";
import { MailSpamNote } from "@/components/mail-spam-note";
import { BY_EXT } from "@/lib/portal-file-types";
import { isFormWindowOpenClient } from "@/lib/form-window";

/**
 * v2.8.85.0 — PUBLIC renderer for an admin-built custom form.
 *
 * The field list arrives from the server (customForms.fields); this
 * component renders it, validates locally (the same rules the submit API
 * enforces), uploads file answers through /api/forms/upload (presign or
 * proxy — whichever the route answers) and posts the answer set to
 * /api/forms/[slug]/submit. The success screen hands the submitter their
 * reference code and the shared red spam note.
 *
 * NOTE: src/lib/form-builder.ts is server-only, so the few shared rules
 * this component needs (file caps, max file count, window check) are
 * mirrored here — keep them in sync when the server values change.
 */

const FORM_FILE_MAX_BYTES = 20 * 1024 * 1024;
const FORM_MAX_FILES = 5;

const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/bmp";
const ALL_ACCEPT = Object.keys(BY_EXT)
  .map((ext) => `.${ext}`)
  .join(",");

type UploadedFile = {
  fieldId: string;
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type Props = {
  slug: string;
  title: string;
  fields: CustomFormField[];
  openAt: string | null;
  closeAt: string | null;
  receiptEmail: boolean;
};

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CustomFormRenderer({ slug, title, fields, openAt, closeAt, receiptEmail }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, File[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ reference: string; message: string } | null>(null);

  /* Render-stable "now" — a Date stays inside a lazy initializer (purity). */
  const [now] = useState(() => new Date());
  const window = useMemo(() => isFormWindowOpenClient(openAt, closeAt, now), [openAt, closeAt, now]);

  const totalPicked = useMemo(
    () => Object.values(picked).reduce((sum, list) => sum + list.length, 0),
    [picked],
  );

  const emailField = fields.find((f) => f.type === "email") ?? null;

  const setValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => (prev[fieldId] ? { ...prev, [fieldId]: "" } : prev));
  };

  const setFiles = (fieldId: string, list: File[]) => {
    setPicked((prev) => ({ ...prev, [fieldId]: list }));
    setErrors((prev) => (prev[fieldId] ? { ...prev, [fieldId]: "" } : prev));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    let fileCount = 0;
    for (const field of fields) {
      if (field.type === "file") {
        const list = picked[field.id] ?? [];
        fileCount += list.length;
        if (field.required && list.length === 0) {
          next[field.id] = `"${field.label}" is required.`;
          continue;
        }
        for (const file of list) {
          if (file.size > FORM_FILE_MAX_BYTES) {
            next[field.id] = `"${file.name}" is larger than the ${mb(FORM_FILE_MAX_BYTES)} limit.`;
            break;
          }
        }
        continue;
      }
      const value = (values[field.id] ?? "").trim();
      if (field.required && !value) {
        next[field.id] = `"${field.label}" is required.`;
        continue;
      }
      if (!value) continue;
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        next[field.id] = `"${field.label}" needs a valid email address.`;
        continue;
      }
      if (field.type === "number" && !/^-?\d+(\.\d+)?$/.test(value)) {
        next[field.id] = `"${field.label}" must be a number.`;
        continue;
      }
      if ((field.type === "select" || field.type === "radio") && field.options && !field.options.includes(value)) {
        next[field.id] = `"${field.label}" has an invalid choice.`;
      }
    }
    if (fileCount > FORM_MAX_FILES) {
      next.__files = `A submission carries at most ${FORM_MAX_FILES} files across all questions.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const uploadOne = async (fieldId: string, file: File): Promise<UploadedFile> => {
    const fd = new FormData();
    fd.append("slug", slug);
    fd.append("fieldName", fieldId);
    fd.append("file", file);
    const res = await fetch("/api/forms/upload", { method: "POST", body: fd });
    const json = (await res.json()) as {
      ok?: boolean;
      mode?: "presign" | "proxy";
      error?: string;
      key?: string;
      url?: string;
      headers?: Record<string, string>;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    if (!res.ok || !json.ok || !json.key) {
      throw new Error(json.error || `"${file.name}" could not be uploaded.`);
    }
    if (json.mode === "presign" && json.url) {
      const put = await fetch(json.url, {
        method: "PUT",
        headers: json.headers ?? {},
        body: file,
      });
      if (!put.ok) throw new Error(`"${file.name}" could not be uploaded.`);
    }
    return {
      fieldId,
      key: json.key,
      fileName: json.fileName ?? file.name,
      mimeType: json.mimeType ?? file.type ?? "application/octet-stream",
      sizeBytes: json.sizeBytes ?? file.size,
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const files: UploadedFile[] = [];
      for (const field of fields) {
        if (field.type !== "file") continue;
        for (const file of picked[field.id] ?? []) {
          files.push(await uploadOne(field.id, file));
        }
      }
      const res = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values, files }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        reference?: string;
        message?: string;
        error?: string;
        issues?: { fieldId: string; error: string }[];
      };
      if (!res.ok || !json.ok) {
        if (json.issues?.length) {
          const next: Record<string, string> = {};
          for (const issue of json.issues) next[issue.fieldId] = issue.error;
          setErrors(next);
        }
        throw new Error(json.error || "The submission could not be sent. Try again.");
      }
      setSuccess({ reference: json.reference ?? "", message: json.message ?? "" });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Success screen ─────────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="rounded-2xl border border-fg/10 bg-surface p-8 shadow-soft md:p-12">
        <div className="animate-fade-up py-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gold/20 text-gold">
            <CheckCircle2 size={36} />
          </div>
          <h3 className="mt-6 font-display text-3xl font-semibold tracking-[-0.02em]">
            Submission received
          </h3>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-fg/60">
            {success.message}
          </p>
          <div className="mt-7 inline-flex flex-col items-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-8 py-5">
            <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-fg/50">
              Your reference
            </span>
            <span className="font-display text-3xl font-semibold tracking-[0.06em] text-gold">
              {success.reference}
            </span>
          </div>
          <p className="mx-auto mt-5 max-w-md text-[13.5px] font-medium leading-relaxed text-fg/70">
            Keep this reference safe — quote it whenever you contact the office
            about this submission.
          </p>
          {receiptEmail && emailField ? (
            <MailSpamNote className="mx-auto mt-6 flex max-w-md items-start gap-2 text-sm text-red-600 dark:text-red-400" />
          ) : null}
          <button
            onClick={() => {
              setSuccess(null);
              setValues({});
              setPicked({});
              setErrors({});
            }}
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-fg/20 px-6 py-3 text-sm font-medium text-fg transition-colors hover:border-fg hover:bg-fg hover:text-surface"
          >
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  /* ── Closed / not-yet-open ──────────────────────────────────────────── */
  if (!window.open) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-fg/15 bg-surface-2 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-red-500/10 text-red-500">
          <AlertCircle size={26} />
        </span>
        <h3 className="mt-6 font-display text-2xl font-semibold">This form is not accepting submissions</h3>
        <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-fg/55">{window.reason}</p>
      </div>
    );
  }

  /* ── The form ───────────────────────────────────────────────────────── */
  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-2xl border border-fg/10 bg-surface p-6 shadow-soft sm:p-8 md:p-10"
      noValidate
    >
      <div className="space-y-6">
        {fields.map((field) => {
          const error = errors[field.id];
          const value = values[field.id] ?? "";
          const fieldFiles = picked[field.id] ?? [];
          return (
            <div key={field.id}>
              {/* Label row */}
              <label
                htmlFor={`fld-${field.id}`}
                className="block font-sans text-[10px] uppercase tracking-[0.3em] text-fg/60"
              >
                {field.label} {field.required ? <span className="text-red-500">*</span> : null}
              </label>
              {field.helpText ? (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg/45">{field.helpText}</p>
              ) : null}

              <div className="mt-2.5">
                {field.type === "textarea" ? (
                  <textarea
                    id={`fld-${field.id}`}
                    rows={4}
                    required={field.required}
                    value={value}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    placeholder={field.placeholder || ""}
                    className="w-full resize-none rounded-xl border border-fg/15 bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg/30 transition-colors focus:border-gold focus:outline-none"
                  />
                ) : field.type === "select" ? (
                  <select
                    id={`fld-${field.id}`}
                    required={field.required}
                    value={value}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    className="w-full rounded-xl border border-fg/15 bg-surface px-4 py-3 text-sm text-fg transition-colors focus:border-gold focus:outline-none"
                  >
                    <option value="">{field.placeholder || "Select an option…"}</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : field.type === "radio" ? (
                  <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={field.label}>
                    {(field.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                          value === opt
                            ? "border-gold bg-gold/10 text-fg"
                            : "border-fg/15 text-fg/70 hover:border-fg/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`fld-${field.id}`}
                          value={opt}
                          checked={value === opt}
                          onChange={() => setValue(field.id, opt)}
                          className="h-4 w-4 shrink-0 accent-gold"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : field.type === "checkbox" ? (
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-fg/15 px-4 py-3 text-sm text-fg/80 transition-colors hover:border-fg/40">
                    <input
                      id={`fld-${field.id}`}
                      type="checkbox"
                      checked={value === "Yes"}
                      onChange={(e) => setValue(field.id, e.target.checked ? "Yes" : "")}
                      className="h-4 w-4 shrink-0 accent-gold"
                    />
                    {field.placeholder || "Yes"}
                  </label>
                ) : field.type === "file" ? (
                  <div>
                    <label
                      className={`inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-fg/20 px-5 py-3 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-fg/70 transition-colors hover:border-gold hover:text-fg ${
                        fieldFiles.length ? "" : "border-dashed"
                      }`}
                    >
                      <Upload size={14} />
                      {fieldFiles.length ? "Add another file" : "Choose a file"}
                      <input
                        type="file"
                        className="sr-only"
                        multiple={field.multiple}
                        accept={field.acceptImages ? IMAGE_ACCEPT : ALL_ACCEPT}
                        onChange={(e) => {
                          const incoming = Array.from(e.target.files ?? []);
                          e.target.value = "";
                          if (!incoming.length) return;
                          setFiles(field.id, field.multiple ? [...fieldFiles, ...incoming] : incoming.slice(0, 1));
                        }}
                      />
                    </label>
                    <p className="mt-2 font-sans text-[10.5px] leading-relaxed text-fg/40">
                      {field.acceptImages ? "Images only" : "PDF, Word, Excel, images, video and ZIP"} ·
                      up to {mb(FORM_FILE_MAX_BYTES)} each
                      {field.multiple ? " · several files allowed" : ""}
                    </p>
                    {fieldFiles.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {fieldFiles.map((file, idx) => (
                          <li
                            key={`${file.name}-${idx}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-fg/10 bg-surface-2 px-3.5 py-2.5"
                          >
                            <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-fg/70">
                              <Paperclip size={12} className="shrink-0 text-gold" />
                              <span className="truncate">{file.name}</span>
                              <span className="shrink-0 text-fg/35">({mb(file.size)})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setFiles(
                                  field.id,
                                  fieldFiles.filter((_, i) => i !== idx),
                                )
                              }
                              aria-label={`Remove ${file.name}`}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-fg/40 transition-colors hover:bg-red-500/10 hover:text-red-500"
                            >
                              <X size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <input
                    id={`fld-${field.id}`}
                    type={
                      field.type === "number"
                        ? "text"
                        : field.type === "email"
                          ? "email"
                          : field.type === "phone"
                            ? "tel"
                            : field.type === "date"
                              ? "date"
                              : field.type === "time"
                                ? "time"
                                : "text"
                    }
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    required={field.required}
                    value={value}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    placeholder={field.placeholder || ""}
                    className="w-full rounded-xl border border-fg/15 bg-transparent px-4 py-3 text-sm text-fg placeholder:text-fg/30 transition-colors focus:border-gold focus:outline-none"
                  />
                )}
              </div>

              {error ? (
                <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-red-600 dark:text-red-400">
                  <AlertCircle size={13} /> {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {errors.__files ? (
        <p className="flex items-center gap-1.5 text-[12.5px] text-red-600 dark:text-red-400">
          <AlertCircle size={13} /> {errors.__files}
        </p>
      ) : null}

      {submitError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          {submitError}
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-fg/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-sans text-[9px] uppercase tracking-[0.2em] text-fg/40">
          Answers are logged to the College office
        </p>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2.5 rounded-full bg-gold px-8 py-3.5 text-[13px] font-medium text-ink transition-colors duration-300 hover:bg-fg hover:text-surface disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {totalPicked > 0 ? "Uploading…" : "Submitting…"}
            </>
          ) : (
            <>
              Submit
              <Send size={14} />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
