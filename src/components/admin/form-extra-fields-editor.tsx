"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { CustomFormField } from "@/db/schema";
import { FORM_FIELD_TYPE_LABELS_CLIENT, OPTION_FIELD_TYPES } from "@/lib/form-field-client";
import type { FieldTypeOption } from "@/components/admin/form-builder-editor";
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
 * v2.8.85.0 / v2.8.86.0 / v2.8.87.0 — the "Customize fields" editor for the
 * FIXED forms (contact + admission application), inside Admin Studio →
 * Forms → Customize.
 *
 * Two layers per form:
 *   1. BUILT-IN QUESTIONS — the questions that live in code. Each can be
 *      renamed, re-placeholdered, made optional, or hidden — within the
 *      per-field guard rails (name/email/message stay; the receipt needs
 *      them). An untouched field holds no override; Reset drops the row's
 *      overrides back to the built-in defaults.
 *   2. EXTRA QUESTIONS — the admin's own additions (the v2.8.85.0 editor),
 *      text-only, 10 per form.
 * One Save persists BOTH layers; the public forms update immediately.
 *
 * v2.8.87.0 — the owner found the old single-row cards cramped and hard to
 * read on desktop ("editing fields okkoma ekagaode wage … lassanata align
 * karala hadanna"). Every card now uses the shared form-field-ui anatomy:
 * header badge + chips, then an aligned, labelled control grid with real
 * switches — mobile keeps the stacked layout the owner liked.
 */

type PanelKey = "contact" | "admission";

const PANEL_META: Record<PanelKey, { title: string; hint: string }> = {
  contact: {
    title: "Contact form fields",
    hint: "The public Contact page form — built-ins below, your extra questions after them.",
  },
  admission: {
    title: "Application form fields",
    hint: "The admissions application form — built-ins below, your extra questions after them.",
  },
};

/** Canonical built-in row as the API hands it over. */
type BaseDefaultRow = {
  key: string;
  label: string;
  required: boolean;
  canHide: boolean;
  canUnrequire: boolean;
  placeholder?: string;
  hint?: string;
};

/** One stored override — mirrors the server's FixedBaseOverride. */
type BaseOverride = {
  label?: string;
  placeholder?: string;
  required?: boolean;
  hidden?: boolean;
};

type BaseState = Record<PanelKey, Record<string, BaseOverride>>;

const EMPTY_BASE: BaseState = { contact: {}, admission: {} };

let idCounter = 0;
function newFieldId(): string {
  idCounter += 1;
  return `x${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function FormExtraFieldsEditor({
  typeOptions,
}: {
  typeOptions: FieldTypeOption[];
}) {
  const [contact, setContact] = useState<CustomFormField[]>([]);
  const [admission, setAdmission] = useState<CustomFormField[]>([]);
  const [baseDefaults, setBaseDefaults] = useState<Record<PanelKey, BaseDefaultRow[]>>({
    contact: [],
    admission: [],
  });
  const [baseOv, setBaseOv] = useState<BaseState>(EMPTY_BASE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/forms/extra-fields", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.contact)) setContact(data.contact);
        if (Array.isArray(data.admission)) setAdmission(data.admission);
        if (data.baseDefaults) {
          setBaseDefaults({
            contact: Array.isArray(data.baseDefaults.contact) ? data.baseDefaults.contact : [],
            admission: Array.isArray(data.baseDefaults.admission) ? data.baseDefaults.admission : [],
          });
        }
        if (data.baseOverrides && typeof data.baseOverrides === "object") {
          setBaseOv({
            contact:
              data.baseOverrides.contact && typeof data.baseOverrides.contact === "object"
                ? data.baseOverrides.contact
                : {},
            admission:
              data.baseOverrides.admission && typeof data.baseOverrides.admission === "object"
                ? data.baseOverrides.admission
                : {},
          });
        }
      })
      .catch(() => setError("Could not load the saved fields."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const optionTypes = new Set(OPTION_FIELD_TYPES);
  const typeLabelOf = (value: string) =>
    typeOptions.find((opt) => opt.value === value)?.label ??
    FORM_FIELD_TYPE_LABELS_CLIENT[value] ??
    value;

  const patch = (panel: PanelKey, index: number, part: Partial<CustomFormField>) => {
    const setter = panel === "contact" ? setContact : setAdmission;
    setter((prev) => prev.map((f, i) => (i === index ? { ...f, ...part } : f)));
  };

  const move = (panel: PanelKey, index: number, direction: -1 | 1) => {
    const setter = panel === "contact" ? setContact : setAdmission;
    setter((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (panel: PanelKey, index: number) => {
    const setter = panel === "contact" ? setContact : setAdmission;
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const add = (panel: PanelKey) => {
    const setter = panel === "contact" ? setContact : setAdmission;
    setter((prev) =>
      prev.length >= 10
        ? prev
        : [...prev, { id: newFieldId(), label: "New question", type: "text", required: false }],
    );
  };

  /* ── v2.8.86.0 — built-in question overrides ─────────────────────────── */

  /** Effective values of one built-in row (defaults merged with overrides). */
  const baseEff = (panel: PanelKey, row: BaseDefaultRow) => {
    const o = baseOv[panel][row.key] ?? {};
    return {
      label: o.label || row.label,
      placeholder: o.placeholder || row.placeholder || "",
      required: o.required ?? row.required,
      hidden: o.hidden === true,
    };
  };

  /** Set/unset parts of one override; false/empty values DROP the part. */
  const patchBase = (panel: PanelKey, key: string, part: BaseOverride) => {
    setBaseOv((prev) => {
      const cur: BaseOverride = { ...(prev[panel][key] ?? {}) };
      if (part.label !== undefined) {
        if (part.label) cur.label = part.label;
        else delete cur.label;
      }
      if (part.placeholder !== undefined) {
        if (part.placeholder) cur.placeholder = part.placeholder;
        else delete cur.placeholder;
      }
      if (part.required !== undefined) {
        if (part.required) cur.required = true;
        else delete cur.required;
      }
      if (part.hidden !== undefined) {
        if (part.hidden) cur.hidden = true;
        else delete cur.hidden;
      }
      const panelNext = { ...prev[panel] };
      if (Object.keys(cur).length) panelNext[key] = cur;
      else delete panelNext[key];
      return { ...prev, [panel]: panelNext };
    });
  };

  /** Drop every override of one row — back to the built-in defaults. */
  const resetBase = (panel: PanelKey, key: string) => {
    setBaseOv((prev) => {
      const panelNext = { ...prev[panel] };
      delete panelNext[key];
      return { ...prev, [panel]: panelNext };
    });
  };

  const save = async () => {
    if (saving) return;
    setError(null);
    for (const [panel, list] of [["contact", contact], ["admission", admission]] as const) {
      if (list.length > 10) {
        setError(`${PANEL_META[panel].title}: at most 10 extra fields are allowed.`);
        return;
      }
      for (const field of list) {
        if (!field.label.trim()) {
          setError(`${PANEL_META[panel].title}: every extra question needs a label.`);
          return;
        }
        if (optionTypes.has(field.type) && (field.options ?? []).filter(Boolean).length < 2) {
          setError(`${PANEL_META[panel].title}: "${field.label}" needs at least 2 options.`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/forms/extra-fields", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, admission, baseOverrides: baseOv }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save the fields.");
      setToast("Saved — the public forms update immediately.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save the fields.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-white/50">
        <Loader2 size={18} className="animate-spin" /> Loading saved fields…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs leading-relaxed text-white/55">
          Edit the two FIXED public forms. Built-in questions can be renamed,
          re-hinted, made optional or hidden (locked ones keep the form working).
          Your own extra questions —{" "}
          <span className="text-white/75">short text, long text, number, date, dropdown, checkbox</span>{" "}
          — sit after the built-ins, at most <span className="text-white/75">10 per form</span>.
          Answers appear inside each submission&apos;s detail view.
        </p>
      </div>

      {(["contact", "admission"] as const).map((panel) => {
        const list = panel === "contact" ? contact : admission;
        const baseRows = baseDefaults[panel];
        return (
          <section key={panel} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
                  {PANEL_META[panel].title}
                </h2>
                <p className="mt-1 text-[11px] text-white/40">{PANEL_META[panel].hint}</p>
              </div>
              <button
                onClick={() => add(panel)}
                disabled={list.length >= 10}
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-xs font-medium text-white/70 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444] disabled:opacity-40"
              >
                <Plus size={14} /> Add extra question
              </button>
            </div>

            {/* ── BUILT-IN questions ─────────────────────────────────────── */}
            {baseRows.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                    Built-in questions ({baseRows.length})
                  </p>
                  <p className="text-[10px] text-white/25">
                    Locked fields cannot hide — the receipts and replies need them
                  </p>
                </div>
                <div className="hscroll max-h-[46vh] space-y-2.5 overflow-y-auto pr-2.5">
                  {baseRows.map((row) => {
                    const eff = baseEff(panel, row);
                    const dirty = Boolean(baseOv[panel][row.key]);
                    return (
                      <div
                        key={row.key}
                        className={`rounded-xl border p-3.5 transition-colors ${
                          eff.hidden
                            ? "border-white/5 bg-transparent"
                            : "border-white/10 bg-white/[0.02]"
                        } ${dirty ? "border-[#ffd444]/30" : ""}`}
                      >
                        {/* header — identity + status chips + reset */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <FieldChip tone={eff.hidden ? "dim" : "muted"}>
                              {eff.hidden ? "hidden" : row.key}
                            </FieldChip>
                            {dirty && <FieldChip tone="gold">edited</FieldChip>}
                            {!row.canUnrequire && !eff.hidden && (
                              <FieldChip tone="dim">always required</FieldChip>
                            )}
                          </div>
                          {dirty && (
                            <button
                              onClick={() => resetBase(panel, row.key)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 px-2.5 text-[10px] font-medium text-white/50 transition-colors hover:border-white/35 hover:text-white"
                              aria-label={`Reset ${row.label} to the built-in default`}
                              title="Reset to default"
                            >
                              <RotateCcw size={11} /> Reset
                            </button>
                          )}
                        </div>

                        {/* labelled control grid */}
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <FieldBox label="Label shown on the form">
                            <input
                              value={eff.label}
                              onChange={(e) => patchBase(panel, row.key, { label: e.target.value })}
                              placeholder={row.label}
                              disabled={eff.hidden}
                              className={`${ffInput} font-medium`}
                              aria-label={`${row.label} — custom label`}
                            />
                          </FieldBox>
                          {row.placeholder !== undefined && (
                            <FieldBox label="Placeholder hint">
                              <input
                                value={eff.placeholder}
                                onChange={(e) =>
                                  patchBase(panel, row.key, { placeholder: e.target.value })
                                }
                                placeholder={row.placeholder}
                                disabled={eff.hidden}
                                className={ffInput}
                                aria-label={`${row.label} — custom placeholder`}
                              />
                            </FieldBox>
                          )}
                          {row.canUnrequire && (
                            <SwitchCell
                              label="Required"
                              description="The form refuses to submit without it"
                              checked={eff.required}
                              disabled={eff.hidden}
                              onChange={(v) => patchBase(panel, row.key, { required: v })}
                            />
                          )}
                          {row.canHide && (
                            <SwitchCell
                              label="Visible on the form"
                              description="Turn off to remove it from the public form"
                              checked={!eff.hidden}
                              onChange={(v) => patchBase(panel, row.key, { hidden: !v })}
                            />
                          )}
                        </div>

                        {row.hint && !eff.hidden && (
                          <p className="mt-2.5 text-[10.5px] leading-relaxed text-white/30">
                            {row.hint}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── EXTRA questions ────────────────────────────────────────── */}
            <div className="mt-5 mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                Your extra questions ({list.length}/10)
              </p>
            </div>
            {list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/12 py-8 text-center text-sm text-white/40">
                No extra questions — the form runs with its built-ins only.
              </p>
            ) : (
              <div className="hscroll mt-2 max-h-[40vh] space-y-3 overflow-y-auto pr-2.5">
                {list.map((field, index) => (
                  <div key={field.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                    {/* header — number + type chip + row actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FieldIndexBadge index={index + 1} />
                        <FieldChip>{typeLabelOf(field.type)}</FieldChip>
                      </div>
                      <FieldActions>
                        <button
                          onClick={() => move(panel, index, -1)}
                          disabled={index === 0}
                          className={fieldIconButton}
                          aria-label="Move question up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => move(panel, index, 1)}
                          disabled={index === list.length - 1}
                          className={fieldIconButton}
                          aria-label="Move question down"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => remove(panel, index)}
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
                          onChange={(e) => patch(panel, index, { label: e.target.value })}
                          placeholder="Question label"
                          className={`${ffInput} font-medium`}
                          aria-label={`Question ${index + 1} label`}
                        />
                      </FieldBox>
                      <FieldBox label="Answer type">
                        <select
                          value={field.type}
                          onChange={(e) => patch(panel, index, { type: e.target.value })}
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
                        onChange={(v) => patch(panel, index, { required: v })}
                      />
                      {field.type !== "checkbox" && (
                        <FieldBox label="Placeholder hint — optional" className="sm:col-span-2">
                          <input
                            value={field.placeholder ?? ""}
                            onChange={(e) =>
                              patch(panel, index, { placeholder: e.target.value || undefined })
                            }
                            placeholder="Shown inside the empty answer box"
                            className={ffInput}
                            aria-label={`Question ${index + 1} placeholder`}
                          />
                        </FieldBox>
                      )}
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
                              patch(panel, index, { options: options.length ? options : undefined });
                            }}
                            placeholder={"Sinhala\nTamil\nEnglish"}
                            rows={2}
                            className={ffTextarea}
                            aria-label={`Question ${index + 1} options`}
                          />
                        </FieldBox>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {error && (
        <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/12 bg-[#141414]/95 px-4 py-3">
        <p className="text-[11px] text-white/45">Saved changes go live on the public forms immediately.</p>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ffd444] px-5 py-2.5 text-xs font-semibold text-[#0b0b0a] transition-colors hover:bg-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save form fields
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
