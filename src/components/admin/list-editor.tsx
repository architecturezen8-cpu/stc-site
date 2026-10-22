"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";

/**
 * Editor for the repeatable page lists (A/L stream teachers, A/L stream
 * classes, Old Thomians honour roll). Rendered inside the visual editor's
 * inspector for sections whose type starts with "list_".
 *
 * The user-facing flow matches the request: the existing items are listed,
 * and a "＋ Add new" button sits at the very END of the list. New stream
 * teachers can be created from scratch (with an optional Staff-directory
 * copy) or picked from the staff already in the directory.
 */

export type ListKind =
  | "list_stream_teachers"
  | "list_stream_classes"
  | "list_old_thomians";

type ApiType = "stream_teachers" | "stream_classes" | "old_thomians";

type StaffOption = {
  id: number;
  name: string;
  role: string;
  department: string;
  qualification: string;
  image: string | null;
};

type AnyItem = Record<string, unknown> & { id: number };

const DEPARTMENTS = [
  "Science & ICT",
  "Mathematics",
  "Languages & Humanities",
  "Commerce",
  "Junior School",
  "Sports & Cadeting",
  "Arts & Culture",
];

const STREAM_DEPARTMENT: Record<string, string> = {
  "biological-science": "Science & ICT",
  "physical-science": "Science & ICT",
  commerce: "Commerce",
  arts: "Arts & Culture",
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.055] px-3.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

const apiTypeOf = (kind: ListKind): ApiType =>
  kind === "list_stream_teachers"
    ? "stream_teachers"
    : kind === "list_stream_classes"
      ? "stream_classes"
      : "old_thomians";

export function ListEditor({
  kind,
  pagePath,
  onSaved,
}: {
  kind: ListKind;
  /** Public path of the page being edited — used to derive the stream slug. */
  pagePath: string;
  /** Called after every successful mutation so the page preview refreshes. */
  onSaved: () => void;
}) {
  const type = apiTypeOf(kind);
  const isTeachers = type === "stream_teachers";
  const isClasses = type === "stream_classes";
  const streamSlug = useMemo(() => {
    const parts = pagePath.split("/").filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 1] : "";
  }, [pagePath]);

  const [items, setItems] = useState<AnyItem[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [form, setForm] = useState<Record<string, string>>({});
  const [staffId, setStaffId] = useState<number | null>(null);
  const [syncStaff, setSyncStaff] = useState(true);
  const [staffDepartment, setStaffDepartment] = useState(
    STREAM_DEPARTMENT[streamSlug] ?? DEPARTMENTS[0],
  );
  const [markNew, setMarkNew] = useState(true);

  const load = useCallback(() => {
    const query =
      type === "old_thomians"
        ? `type=${type}`
        : `type=${type}&stream=${encodeURIComponent(streamSlug)}`;
    return Promise.all([
      fetch(`/api/admin/lists?${query}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/lists?type=staff_options", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([listData, staffData]) => {
        setItems(listData.items ?? []);
        setStaffOptions(staffData.staff ?? []);
      })
      .finally(() => setLoading(false));
  }, [type, streamSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({});
    setStaffId(null);
    setSyncStaff(true);
    setMarkNew(true);
    setStaffDepartment(STREAM_DEPARTMENT[streamSlug] ?? DEPARTMENTS[0]);
    setAdding(false);
    setError(null);
  };

  const pickStaff = (value: string) => {
    const id = Number(value) || null;
    setStaffId(id);
    const member = staffOptions.find((s) => s.id === id);
    if (member) {
      setForm((current) => ({
        ...current,
        name: member.name,
        role: isClasses ? (current.classTeacher ?? "") : member.role,
        qualification: member.qualification ?? "",
        image: member.image ?? "",
        ...(isTeachers ? { subject: current.subject ?? "" } : {}),
        ...(type === "old_thomians" ? { note: current.note ?? "", field: current.field ?? "" } : {}),
      }));
    }
  };

  const addItem = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          stream: streamSlug,
          staffId,
          syncStaff: isTeachers && !staffId && syncStaff,
          staffDepartment,
          item: { ...form, isNew: markNew },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add.");
      resetForm();
      load();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  };

  const patchItem = async (id: number, patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch("/api/admin/lists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, item: patch }),
      });
      load();
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (id: number) => {
    if (!window.confirm("Remove this entry from the list?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/lists?type=${type}&id=${id}`, { method: "DELETE" });
      load();
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const field = (key: string, label: string, placeholder = "") => (
    <label className="block min-w-0">
      <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <input
        value={form[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
        className={`${input} h-10`}
      />
    </label>
  );

  const fieldFor = (item: AnyItem, key: string, label: string) => (
    <label className="block min-w-0">
      <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </span>
      <input
        defaultValue={String(item[key] ?? "")}
        key={`${item.id}-${key}-${String(item[key] ?? "")}`}
        onBlur={(e) => {
          if (e.target.value !== String(item[key] ?? "")) {
            patchItem(item.id, { [key]: e.target.value });
          }
        }}
        className={`${input} h-10`}
      />
    </label>
  );

  const imageFieldFor = (item: AnyItem, key: string) => (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={adminGridThumbSrc(String(item[key] ?? "")) || "/images/staff/teacher-1.jpg"}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-10 w-10 rounded-lg border border-white/10 object-cover"
      />
      <MediaLibraryButton
        preferFolder="site-assets"
        onSelect={(picked) => patchItem(item.id, { [key]: picked.url })}
      />
    </div>
  );

  const toggleNew = (item: AnyItem) => patchItem(item.id, { isNew: !item.isNew });

  return (
    <div className="min-w-0">
      {loading ? (
        <p className="flex items-center gap-2 py-6 text-[12px] text-white/40">
          <Loader2 size={14} className="animate-spin" /> Loading list…
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const editing = editingId === item.id;
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
              >
                <div className="flex items-center gap-3 px-3.5 py-3">
                  {"image" in item && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={adminGridThumbSrc(String(item.image ?? "")) || "/images/staff/teacher-1.jpg"}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-9 w-9 shrink-0 rounded-lg border border-white/10 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[12.5px] font-semibold text-white">
                      <span className="truncate">{String(item.name ?? item.code ?? "")}</span>
                      {item.isNew ? (
                        <span className="shrink-0 rounded-full bg-[#ffd444] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#0b0b0a]">
                          New
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[10.5px] text-white/40">
                      {isClasses
                        ? `${String(item.grade ?? "")} · ${String(item.classTeacher ?? "")}`
                        : String(item.role ?? item.field ?? "")}
                    </p>
                  </div>
                  {editingId === null || editing ? (
                    <button
                      onClick={() => setEditingId(editing ? null : item.id)}
                      aria-label="Edit entry"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 hover:bg-white/10 hover:text-white"
                    >
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${editing ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : null}
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Delete entry"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/45 hover:bg-red-500/20 hover:text-red-300"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {editing && (
                  <div className="space-y-3 border-t border-white/10 px-3.5 py-3.5">
                    {isClasses ? (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {fieldFor(item, "code", "Code")}
                          {fieldFor(item, "grade", "Grade")}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {fieldFor(item, "strength", "Strength")}
                          {fieldFor(item, "room", "Room")}
                        </div>
                        {fieldFor(item, "classTeacher", "Class teacher")}
                      </>
                    ) : (
                      <>
                        {fieldFor(item, "name", "Name")}
                        {isTeachers ? (
                          <div className="grid grid-cols-2 gap-2">
                            {fieldFor(item, "role", "Role")}
                            {fieldFor(item, "subject", "Subject")}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {fieldFor(item, "field", "Field")}
                            <label className="block min-w-0">
                              <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                                New badge
                              </span>
                              <button
                                onClick={() => toggleNew(item)}
                                className={`h-10 w-full rounded-xl border text-[11px] font-semibold ${
                                  item.isNew
                                    ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                                    : "border-white/12 text-white/45"
                                }`}
                              >
                                {item.isNew ? "NEW shown" : "NEW hidden"}
                              </button>
                            </label>
                          </div>
                        )}
                        {isTeachers && (
                          <button
                            onClick={() => toggleNew(item)}
                            className={`h-10 w-full rounded-xl border text-[11px] font-semibold ${
                              item.isNew
                                ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                                : "border-white/12 text-white/45"
                            }`}
                          >
                            {item.isNew ? "NEW badge shown" : "NEW badge hidden"}
                          </button>
                        )}
                        {isTeachers && fieldFor(item, "qualification", "Qualification")}
                        {type === "old_thomians" && fieldFor(item, "note", "Note")}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                            Photo
                          </span>
                          {imageFieldFor(item, "image")}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── The "+" add button at the very end of the list ────────── */}
          {adding ? (
            <div className="space-y-3 rounded-xl border border-[#ffd444]/40 bg-[#ffd444]/[0.06] p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffd444]">
                  {isClasses ? "Add a class" : isTeachers ? "Add a teacher" : "Add an Old Thomian"}
                </p>
                <button
                  onClick={resetForm}
                  aria-label="Close add form"
                  className="grid h-8 w-8 place-items-center rounded-full text-white/45 hover:bg-white/10 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              {!isClasses && (
                <label className="block min-w-0">
                  <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                    Pick from existing staff (optional)
                  </span>
                  <select
                    value={staffId ?? ""}
                    onChange={(e) => pickStaff(e.target.value)}
                    className={`${input} h-10 appearance-none`}
                  >
                    <option value="" className="bg-[#141310] text-white">
                      — Create new —
                    </option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#141310] text-white">
                        {s.name} · {s.role}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {isClasses ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {field("code", "Class code", "12-A")}
                    {field("grade", "Grade", "Grade 12")}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {field("strength", "Strength", "40 students")}
                    {field("room", "Room", "Room 12")}
                  </div>
                  <label className="block min-w-0">
                    <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      Class teacher (pick from staff below)
                    </span>
                    <select
                      value={form.classTeacher ?? ""}
                      onChange={(e) => setForm((c) => ({ ...c, classTeacher: e.target.value }))}
                      className={`${input} h-10 appearance-none`}
                    >
                      <option value="" className="bg-[#141310] text-white">
                        — Type or pick —
                      </option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.name} className="bg-[#141310] text-white">
                          {s.name} · {s.role}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  {field("name", "Name", "Full name")}
                  {isTeachers ? (
                    <div className="grid grid-cols-2 gap-2">
                      {field("role", "Role", "Teacher")}
                      {field("subject", "Subject", "Biology")}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {field("field", "Field", "Cricket")}
                      <label className="block min-w-0">
                        <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                          New badge
                        </span>
                        <button
                          onClick={() => setMarkNew((v) => !v)}
                          className={`h-10 w-full rounded-xl border text-[11px] font-semibold ${
                            markNew
                              ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                              : "border-white/12 text-white/45"
                          }`}
                        >
                          {markNew ? "NEW shown" : "NEW hidden"}
                        </button>
                      </label>
                    </div>
                  )}
                  {isTeachers && (
                    <button
                      onClick={() => setMarkNew((v) => !v)}
                      className={`h-10 w-full rounded-xl border text-[11px] font-semibold ${
                        markNew
                          ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                          : "border-white/12 text-white/45"
                      }`}
                    >
                      {markNew ? "NEW badge shown" : "NEW badge hidden"}
                    </button>
                  )}
                  {type === "old_thomians" && field("note", "Note", "e.g. Sri Lanka Test cricketer")}
                  {isTeachers && field("qualification", "Qualification", "B.Sc., PGDE")}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                      Photo
                    </span>
                    <div className="flex items-center gap-2">
                      {form.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={adminGridThumbSrc(form.image)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-10 w-10 rounded-lg border border-white/10 object-cover"
                        />
                      ) : null}
                      <MediaLibraryButton
                        preferFolder="site-assets"
                        onSelect={(picked) =>
                          setForm((current) => ({ ...current, image: picked.url }))
                        }
                      />
                    </div>
                  </div>

                  {isTeachers && (
                    <div className="space-y-2 rounded-xl border border-white/10 p-3">
                      <label className="flex items-center gap-2.5 text-[12px] text-white/70">
                        <input
                          type="checkbox"
                          checked={staffId ? false : syncStaff}
                          disabled={Boolean(staffId)}
                          onChange={(e) => setSyncStaff(e.target.checked)}
                          className="h-4 w-4 accent-[#ffd444]"
                        />
                        Also add to the Staff directory (sync)
                      </label>
                      {staffId ? (
                        <p className="text-[10.5px] text-white/35">
                          Linked to an existing staff member — no new staff row will be created.
                        </p>
                      ) : syncStaff ? (
                        <label className="block min-w-0">
                          <span className="mb-1.5 block font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
                            Staff department
                          </span>
                          <select
                            value={staffDepartment}
                            onChange={(e) => setStaffDepartment(e.target.value)}
                            className={`${input} h-10 appearance-none`}
                          >
                            {DEPARTMENTS.map((d) => (
                              <option key={d} value={d} className="bg-[#141310] text-white">
                                {d}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-[11px] text-red-300">{error}</p>}

              <button
                onClick={addItem}
                disabled={busy}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ffd444] text-[12px] font-bold text-[#0b0b0a] transition-opacity disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add to list
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-3.5 text-[12px] font-semibold text-white/55 transition-colors hover:border-[#ffd444] hover:bg-[#ffd444]/[0.06] hover:text-[#ffd444]"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#ffd444] text-[#0b0b0a]">
                <Plus size={12} />
              </span>
              {isClasses
                ? "Add a new class"
                : isTeachers
                  ? "Add a new teacher"
                  : "Add a new Old Thomian"}
            </button>
          )}

          <p className="flex items-center gap-1.5 pt-1 text-[10px] text-white/25">
            <RefreshCw size={10} /> Edits apply to the live page immediately.
          </p>
        </div>
      )}
    </div>
  );
}
