"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  FileUp,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type { CustomFormField } from "@/db/schema";
import {
  FORM_FIELD_TYPE_LABELS_CLIENT,
  OPTION_FIELD_TYPES,
} from "@/lib/form-field-client";
import {
  FieldActions,
  FieldBox,
  FieldChip,
  FieldIndexBadge,
  SwitchCell,
  ffInput,
  fieldIconButton,
  fieldIconDelete,
  ffTextarea,
} from "@/components/admin/form-field-ui";

/**
 * v2.8.85.0 — the Form Builder EDITOR: form meta, collection window,
 * toggles, and the question list (add / edit / reorder / delete), plus the
 * Excel header import that APPENDS generated questions for the admin to
 * adjust before saving. All changes are local until Save (PUT).
 *
 * v2.8.87.0 — question cards rebuilt on the shared form-field-ui anatomy
 * (header badge + chips + actions, then an aligned labelled control grid
 * with real switches) — the owner found the old one-line-per-field layout
 * cramped on desktop. Form meta below is unchanged.
 */

export type BuilderEditorForm = {
  id: number;
  slug: string;
  title: string;
  description: string;
  published: boolean;
  receiptEmail: boolean;
  officeNotify: boolean;
  openAtInput: string;
  closeAtInput: string;
  fields: CustomFormField[];
};

export type FieldTypeOption = { value: string; label: string };

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

let idCounter = 0;
function newFieldId(): string {
  idCounter += 1;
  return `f${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FormBuilderEditor({
  initial,
  typeOptions,
}: {
  initial: BuilderEditorForm;
  typeOptions: FieldTypeOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [published, setPublished] = useState(initial.published);
  const [receiptEmail, setReceiptEmail] = useState(initial.receiptEmail);
  const [officeNotify, setOfficeNotify] = useState(initial.officeNotify);
  const [openAtInput, setOpenAtInput] = useState(initial.openAtInput);
  const [closeAtInput, setCloseAtInput] = useState(initial.closeAtInput);
  const [fields, setFields] = useState<CustomFormField[]>(initial.fields);

  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const optionTypes = useMemo(() => new Set(OPTION_FIELD_TYPES), []);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const patchField = (index: number, patch: Partial<CustomFormField>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { id: newFieldId(), label: "New question", type: "text", required: false },
    ]);
  };

  /* Excel header import — generated fields APPEND for the admin to adjust. */
  const importExcel = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/admin/forms/builder/${initial.id}/import`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { ok?: boolean; fields?: CustomFormField[]; error?: string };
      if (!res.ok || !data.ok || !Array.isArray(data.fields)) {
        throw new Error(data.error || "The import failed.");
      }
      setFields((prev) => [...prev, ...data.fields!]);
      flash(`Imported ${data.fields.length} question(s) from the sheet.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The import failed.");
    } finally {
      setImporting(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setError(null);
    if (!title.trim()) {
      setError("The form needs a title.");
      return;
    }
    for (const field of fields) {
      if (!field.label.trim()) {
        setError("Every question needs a label.");
        return;
      }
      if (optionTypes.has(field.type) && (field.options ?? []).filter(Boolean).length < 2) {
        setError(`"${field.label}" needs at least 2 options.`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/forms/builder/${initial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          description,
          published,
          receiptEmail,
          officeNotify,
          openAt: openAtInput || null,
          closeAt: closeAtInput || null,
          fields,
        }),
      });
      const data = (await res.json()) as {
        form?: { slug: string; title: string };
        error?: string;
      };
      if (!res.ok || !data.form) {
        throw new Error(data.error || "Could not save the form.");
      }
      setSlug(data.form.slug);
      flash("Form saved.");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the form.");
    } finally {
      setSaving(false);
    }
  };

  const typeLabelOf = (value: string) =>
    typeOptions.find((opt) => opt.value === value)?.label ??
    FORM_FIELD_TYPE_LABELS_CLIENT[value] ??
    value;

  return (
    <div className="space-y-4 pb-4">
      {/* ── Form meta ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
          Form details
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-white/40">
              Title *
            </span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-white/40">
              Address (slug) — forms/&lt;slug&gt;
            </span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={input}
              placeholder="auto-generated from the title"
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-white/40">
              Description (shown on the public hub card)
            </span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${input} resize-none`}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
          <Toggle
            checked={published}
            onChange={setPublished}
            label="Published"
            hint="Visible on the public /forms hub"
          />
          <Toggle
            checked={receiptEmail}
            onChange={setReceiptEmail}
            label="Receipt email"
            hint="Submitter gets a branded acknowledgement"
          />
          <Toggle
            checked={officeNotify}
            onChange={setOfficeNotify}
            label="Office heads-up"
            hint="Office email on every submission"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-white/40">
              Opens at (Sri Lanka time) — optional
            </span>
            <input
              type="datetime-local"
              value={openAtInput}
              onChange={(e) => setOpenAtInput(e.target.value)}
              className={input}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.18em] text-white/40">
              Closes at (Sri Lanka time) — optional
            </span>
            <input
              type="datetime-local"
              value={closeAtInput}
              onChange={(e) => setCloseAtInput(e.target.value)}
              className={input}
            />
          </label>
        </div>
      </section>

      {/* ── Questions ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
            Questions ({fields.length})
          </h2>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]">
              {importing ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
              Import Excel headers
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void importExcel(file);
                }}
              />
            </label>
            <button
              onClick={addField}
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
            >
              <Plus size={14} /> Add question
            </button>
          </div>
        </div>

        {fields.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-white/12 py-10 text-center text-sm text-white/40">
            No questions yet — add one by hand or import a spreadsheet&apos;s header row.
          </p>
        ) : (
          <div className="hscroll mt-4 max-h-[58vh] space-y-3 overflow-y-auto pr-2.5">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5"
              >
                {/* header — number + type chip + row actions */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FieldIndexBadge index={index + 1} />
                    <FieldChip>{typeLabelOf(field.type)}</FieldChip>
                  </div>
                  <FieldActions>
                    <button
                      onClick={() => moveField(index, -1)}
                      disabled={index === 0}
                      className={fieldIconButton}
                      aria-label="Move question up"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => moveField(index, 1)}
                      disabled={index === fields.length - 1}
                      className={fieldIconButton}
                      aria-label="Move question down"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => removeField(index)}
                      className={fieldIconDelete}
                      aria-label={`Delete question ${index + 1}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </FieldActions>
                </div>

                {/* labelled control grid */}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FieldBox label="Question" className="sm:col-span-2">
                    <input
                      value={field.label}
                      onChange={(e) => patchField(index, { label: e.target.value })}
                      placeholder="Question label"
                      className={`${ffInput} font-medium`}
                      aria-label={`Question ${index + 1} label`}
                    />
                  </FieldBox>
                  <FieldBox label="Answer type">
                    <select
                      value={field.type}
                      onChange={(e) => patchField(index, { type: e.target.value })}
                      className={ffInput}
                      aria-label={`Question ${index + 1} type`}
                    >
                      {typeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </FieldBox>
                  <SwitchCell
                    label="Required"
                    description="The form refuses to submit without it"
                    checked={field.required}
                    onChange={(v) => patchField(index, { required: v })}
                  />
                  {field.type !== "checkbox" && field.type !== "file" && field.type !== "radio" && (
                    <FieldBox label="Placeholder hint — optional">
                      <input
                        value={field.placeholder ?? ""}
                        onChange={(e) =>
                          patchField(index, { placeholder: e.target.value || undefined })
                        }
                        placeholder="Shown inside the empty answer box"
                        className={ffInput}
                        aria-label={`Question ${index + 1} placeholder`}
                      />
                    </FieldBox>
                  )}
                  <FieldBox label="Help text — optional">
                    <input
                      value={field.helpText ?? ""}
                      onChange={(e) => patchField(index, { helpText: e.target.value || undefined })}
                      placeholder="A short line under the question"
                      className={ffInput}
                      aria-label={`Question ${index + 1} help text`}
                    />
                  </FieldBox>
                  {optionTypes.has(field.type) && (
                    <FieldBox
                      label="Options"
                      hint="at least 2 — one per line or comma-separated"
                      className="sm:col-span-2"
                    >
                      <textarea
                        value={(field.options ?? []).join("\n")}
                        onChange={(e) => {
                          const options = e.target.value
                            .split(/\n|,/)
                            .map((o) => o.trim())
                            .filter(Boolean);
                          patchField(index, { options: options.length ? options : undefined });
                        }}
                        placeholder={"Sinhala\nTamil\nEnglish"}
                        rows={2}
                        className={ffTextarea}
                        aria-label={`Question ${index + 1} options`}
                      />
                    </FieldBox>
                  )}
                  {field.type === "file" && (
                    <>
                      <SwitchCell
                        label="Images only"
                        description="Pictures only — no documents"
                        checked={Boolean(field.acceptImages)}
                        onChange={(v) => patchField(index, { acceptImages: v || undefined })}
                      />
                      <SwitchCell
                        label="Allow several files"
                        description="More than one file per answer"
                        checked={Boolean(field.multiple)}
                        onChange={(v) => patchField(index, { multiple: v || undefined })}
                      />
                      <p className="text-[10.5px] text-white/30 sm:col-span-2">
                        20 MB max per file · 5 files max per submission
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Save bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/12 bg-[#141414]/95 px-4 py-3 shadow-lift backdrop-blur">
        <p className="text-[11px] text-white/45">
          {published
            ? "This form is LIVE on the public hub once saved."
            : "Saved changes stay hidden until Published."}
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ffd444] px-5 py-2.5 text-xs font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save form
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#181818] px-5 py-2.5 text-xs text-white shadow-lift">
          {toast}
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-[#ffd444]"
      />
      <span>
        <span className="block text-xs font-medium text-white/85">{label}</span>
        <span className="block text-[10.5px] text-white/40">{hint}</span>
      </span>
    </label>
  );
}
