"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Camera,
  FileSpreadsheet,
  X,
} from "lucide-react";
import type { ImportPreviewRow } from "@/lib/verification-import";
import { IMPORT_FIELDS, type ImportMapping } from "@/lib/verification-import";
import { isUploadCancelled, xhrUpload } from "@/lib/upload-client";
import { speedLabel } from "@/components/portal/upload-progress-row";

/* ────────────────────────────────────────────────────────────────────────
   Admin → Verification Records — manage the OFFICE REGISTERS that
   self-registrations are verified against. Students tab: admission no,
   register no, name, class, father & mother names, phone/email. Teachers
   tab: teacher ID, name, email, phone, designation.

   v2.8.39.0 — every colour now reads the .lms-admin-scope --la-* token
   set, so the register is fully readable in BOTH studio themes (the old
   white-alpha utilities vanished on the pastel light canvas) and a
   search box filters whichever register is open.
   v2.8.48.0 — EDIT: every row grows an Edit action (pencil) that opens
   the dialog prefilled; identity fields (admission no / teacher ID) are
   locked, and a class change on a student moves their enrollment so the
   attendance roster follows the register.
   v2.8.59.0 — TWO owner fixes:
   · CLASS IS A DROPDOWN (owner: "class eka type karanna denne nathuwa
     selection list ekak demuda. mokada waradiyata type karoth okkoma
     waradenawa ne ekai") — options come from the live class master + the
     register's own distinct names, so typos can't break verification;
   · PROFILE PHOTOS (owner: "lms-admintai ... images danna option ekak
     danna wei ne") — a camera button per row uploads JPG/PNG/WebP to the
     register row; the portals (profile card + roster wall) pick it up.
   v2.8.67.2 — EXCEL IMPORT (owner: "excel sheet import option ekak
     danna... headers scan karala auto headers genarate wela") — an Import
     Excel dialog scans the sheet, auto-detects the columns, shows a
     ready/invalid preview, then commits on confirm; plus BATCH SELECT +
     DELETE (checkbox per row, select-all on the filtered set, one
     confirm → one request).
   ──────────────────────────────────────────────────────────────────── */

export type StudentRecordRow = {
  id: number;
  admissionNo: string;
  registerNo: string | null;
  fullName: string;
  className: string;
  fatherName: string;
  motherName: string;
  phone: string | null;
  email: string | null;
  photoUrl?: string | null;
};

export type TeacherRecordRow = {
  id: number;
  teacherId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  photoUrl?: string | null;
};

const input =
  "h-11 w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-3.5 text-[13.5px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]";
const btnGold =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#141400] shadow-[0_10px_22px_-12px_rgba(255,212,68,0.8)] transition-colors hover:bg-[#e8c13a] disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-border)] px-4 text-[12.5px] font-medium text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)] disabled:opacity-50";
const searchInput =
  "h-10 w-full rounded-full border border-[var(--la-input-border)] bg-[var(--la-input-bg)] pl-9 pr-3.5 text-[13px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]";
const btnDanger =
  "inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[var(--la-danger-bg)] px-4 text-[12.5px] font-semibold text-[var(--la-danger-text)] transition-colors hover:bg-[var(--la-danger-bg)] disabled:opacity-50";

/* Friendly names for the auto-detected column pills in the import dialog. */
const IMPORT_FIELD_LABELS: Record<string, string> = {
  admissionNo: "Admission no",
  fullName: "Full name",
  className: "Class",
  registerNo: "Register no",
  fatherName: "Father's name",
  motherName: "Mother's name",
  phone: "Phone",
  email: "Email",
  teacherId: "Teacher ID",
  designation: "Designation",
};

type ImportPreviewState = {
  mapped: Record<string, string>;
  unmapped: string[];
  headers: string[];
  rows: ImportPreviewRow[];
  validCount: number;
  invalidCount: number;
};

export function VerificationRecordsManager({
  initialStudents,
  initialTeachers,
  classNames,
}: {
  initialStudents: StudentRecordRow[];
  initialTeachers: TeacherRecordRow[];
  /** v2.8.59.0 — the dropdown's options: the live class master merged with
   *  the register's own distinct class names (naturally sorted server-side). */
  classNames: string[];
}) {
  const [tab, setTab] = useState<"student" | "teacher">("student");
  const [students, setStudents] = useState(initialStudents);
  const [teachers, setTeachers] = useState(initialTeachers);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  /* v2.8.59.0 — per-row photo uploads (the camera button). */
  const [photoBusyId, setPhotoBusyId] = useState<number | null>(null);
  /* v2.8.68.1 — live photo-upload progress + cancel. */
  const [photoProg, setPhotoProg] = useState<{ pct: number; bps: number | null } | null>(null);
  const photoAbortRef = useRef<(() => void) | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoTarget, setPhotoTarget] = useState<{
    type: "student" | "teacher";
    id: number;
  } | null>(null);
  /* v2.8.67.2 — Excel import (preview → commit) + batch selection. */
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  /* v2.8.68.1 — live sheet-upload progress + cancel. */
  const [importProg, setImportProg] = useState<{ pct: number; bps: number | null } | null>(null);
  const importAbortRef = useRef<(() => void) | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  /* v2.8.70.4 — the office's editable field→column mapping (from the
     preview's suggestion) + the sheet's headers for the editor. */
  const [importMapping, setImportMapping] = useState<ImportMapping | null>(null);
  const [importMappingDirty, setImportMappingDirty] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const flash = (kind: "ok" | "err", text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4200);
  };

  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const createRecord = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/verification-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, ...form }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        student?: StudentRecordRow;
        teacher?: TeacherRecordRow;
        autoEnrolledInto?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Unable to save the record.");

      if (tab === "student" && data.student) {
        setStudents((list) => [data.student as StudentRecordRow, ...list]);
      } else if (data.teacher) {
        setTeachers((list) => [data.teacher as TeacherRecordRow, ...list]);
      }
      setForm({});
      setAddOpen(false);
      flash(
        "ok",
        tab === "student" && data.autoEnrolledInto
          ? `${data.student?.fullName ?? "Student"} added and enrolled into ${data.autoEnrolledInto} — attendance-ready even without an account.`
          : "Record added to the register.",
      );
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to save the record.");
    } finally {
      setBusy(false);
    }
  };

  /* v2.8.48.0 — open the dialog prefilled with the row's editable fields. */
  const openEdit = (row: StudentRecordRow | TeacherRecordRow) => {
    setEditId(row.id);
    setForm({
      fullName: row.fullName,
      ...("className" in row
        ? {
            admissionNo: row.admissionNo,
            registerNo: row.registerNo ?? "",
            className: row.className,
            fatherName: row.fatherName,
            motherName: row.motherName,
            phone: row.phone ?? "",
            email: row.email ?? "",
          }
        : {
            teacherId: row.teacherId,
            email: row.email ?? "",
            phone: row.phone ?? "",
            designation: row.designation ?? "",
          }),
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (editId == null) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/verification-records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, id: editId, ...form }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        student?: StudentRecordRow;
        teacher?: TeacherRecordRow;
        enrollmentMoved?: boolean;
        enrollmentNote?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Unable to update the record.");

      if (tab === "student" && data.student) {
        setStudents((list) => list.map((r) => (r.id === editId ? (data.student as StudentRecordRow) : r)));
      } else if (data.teacher) {
        setTeachers((list) => list.map((r) => (r.id === editId ? (data.teacher as TeacherRecordRow) : r)));
      }
      setEditOpen(false);
      setEditId(null);
      setForm({});
      flash(
        "ok",
        tab === "student" && data.enrollmentNote
          ? `Record updated. ${data.enrollmentNote}`
          : data.enrollmentMoved
            ? "Record updated — the student's class enrollment moved with the register."
            : "Record updated.",
      );
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to update the record.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRecord = async (id: number) => {
    if (!window.confirm("Remove this record from the register? Existing approved accounts are not affected.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/verification-records?type=${tab}&id=${id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to delete the record.");
      if (tab === "student") setStudents((list) => list.filter((r) => r.id !== id));
      else setTeachers((list) => list.filter((r) => r.id !== id));
      flash("ok", "Record removed.");
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to delete the record.");
    } finally {
      setBusy(false);
    }
  };

  /* v2.8.59.0 — PROFILE PHOTO upload for a register row (the camera button).
     The photo lands on the register row itself, so it exists before the
     person ever makes an account, and the portals pick it up through the
     admission-no / staff-code joins (profile card + roster wall). */
  const openPhotoPicker = (type: "student" | "teacher", id: number) => {
    setPhotoTarget({ type, id });
    if (photoInputRef.current) photoInputRef.current.value = "";
    photoInputRef.current?.click();
  };

  const uploadPhoto = async (file: File) => {
    if (!photoTarget) return;
    const { type, id } = photoTarget;
    setPhotoBusyId(id);
    setPhotoProg({ pct: 0, bps: null });
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("id", String(id));
      form.append("file", file);
      /* v2.8.68.1 — XHR so the photo shows live progress and can cancel. */
      const up = xhrUpload({
        url: "/api/admin/verification-records/photo",
        method: "POST",
        body: form,
        onProgress: (info) =>
          setPhotoProg({ pct: info.pct, bps: info.bytesPerSecond }),
      });
      photoAbortRef.current = up.abort;
      const res = await up.promise;
      const data = (res.json ?? {}) as {
        ok?: boolean;
        photoUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.photoUrl) {
        throw new Error(data.error || "Unable to upload the photo.");
      }
      if (type === "student") {
        setStudents((list) =>
          list.map((r) => (r.id === id ? { ...r, photoUrl: data.photoUrl! } : r)),
        );
      } else {
        setTeachers((list) =>
          list.map((r) => (r.id === id ? { ...r, photoUrl: data.photoUrl! } : r)),
        );
      }
      flash("ok", "Photo saved — the portals show it on their next load.");
    } catch (err) {
      if (isUploadCancelled(err)) {
        flash("ok", "Photo upload cancelled — nothing changed.");
      } else {
        flash("err", err instanceof Error ? err.message : "Unable to upload the photo.");
      }
    } finally {
      photoAbortRef.current = null;
      setPhotoProg(null);
      setPhotoBusyId(null);
      setPhotoTarget(null);
    }
  };

  /* ── v2.8.67.2 — EXCEL IMPORT ─────────────────────────────────────────
     Choose a sheet → stage=preview returns the auto-detected columns and
     every row's verdict → the office confirms → stage=commit inserts and
     the register is refetched so state keeps the exact server shape. */
  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportMapping(null);
    setImportMappingDirty(false);
    setImportError(null);
  };

  const closeImport = () => {
    if (importBusy) return;
    setImportOpen(false);
    resetImport();
  };

  const refreshRegisters = async () => {
    const res = await fetch("/api/admin/verification-records");
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as {
      students?: Array<Record<string, unknown>>;
      teachers?: Array<Record<string, unknown>>;
    } | null;
    if (!data) return;
    /* Same field pass-through the registers page does server-side. */
    if (Array.isArray(data.students)) {
      setStudents(
        data.students.map((r) => ({
          id: Number(r.id),
          admissionNo: String(r.admissionNo ?? ""),
          registerNo: (r.registerNo as string | null) ?? null,
          fullName: String(r.fullName ?? ""),
          className: String(r.className ?? ""),
          fatherName: String(r.fatherName ?? ""),
          motherName: String(r.motherName ?? ""),
          phone: (r.phone as string | null) ?? null,
          email: (r.email as string | null) ?? null,
          photoUrl: (r.photoUrl as string | null) ?? null,
        })),
      );
    }
    if (Array.isArray(data.teachers)) {
      setTeachers(
        data.teachers.map((r) => ({
          id: Number(r.id),
          teacherId: String(r.teacherId ?? ""),
          fullName: String(r.fullName ?? ""),
          email: (r.email as string | null) ?? null,
          phone: (r.phone as string | null) ?? null,
          designation: (r.designation as string | null) ?? null,
          photoUrl: (r.photoUrl as string | null) ?? null,
        })),
      );
    }
  };

  const runImportPreview = async (file: File, mapping?: ImportMapping | null) => {
    setImportFile(file);
    setImportPreview(null);
    setImportError(null);
    setImportBusy(true);
    setImportProg({ pct: 0, bps: null });
    try {
      const fd = new FormData();
      fd.append("type", tab);
      fd.append("stage", "preview");
      fd.append("file", file);
      /* v2.8.70.4 — re-checks ride the office's edited column mapping. */
      if (mapping) fd.append("mapping", JSON.stringify(mapping));
      /* v2.8.68.1 — XHR: the sheet shows live upload progress and cancels. */
      const up = xhrUpload({
        url: "/api/admin/verification-records/import",
        method: "POST",
        body: fd,
        onProgress: (info) =>
          setImportProg({ pct: info.pct, bps: info.bytesPerSecond }),
      });
      importAbortRef.current = up.abort;
      const res = await up.promise;
      const data = (res.json ?? {}) as {
        ok?: boolean;
        error?: string;
        mapped?: Record<string, string>;
        mapping?: ImportMapping;
        headers?: string[];
        unmapped?: string[];
        rows?: ImportPreviewRow[];
        validCount?: number;
        invalidCount?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "That file could not be read as a spreadsheet.");
      }
      setImportPreview({
        mapped: data.mapped ?? {},
        unmapped: data.unmapped ?? [],
        headers: data.headers ?? [],
        rows: data.rows ?? [],
        validCount: data.validCount ?? 0,
        invalidCount: data.invalidCount ?? 0,
      });
      setImportMapping(data.mapping ?? null);
      setImportMappingDirty(false);
    } catch (err) {
      if (isUploadCancelled(err)) {
        flash("ok", "Import cancelled — nothing was added.");
      } else {
        setImportError(
          err instanceof Error ? err.message : "That file could not be read as a spreadsheet.",
        );
      }
    } finally {
      importAbortRef.current = null;
      setImportProg(null);
      setImportBusy(false);
    }
  };

  /* v2.8.70.4 — re-run the preview under the edited mapping. */
  const recheckImport = async () => {
    if (!importFile || !importMapping || importBusy) return;
    await runImportPreview(importFile, importMapping);
  };

  const commitImport = async () => {
    if (!importFile) return;
    setImportBusy(true);
    setImportProg({ pct: 0, bps: null });
    try {
      const fd = new FormData();
      fd.append("type", tab);
      fd.append("stage", "commit");
      fd.append("file", importFile);
      /* v2.8.70.4 — the commit honours the office's edited mapping. */
      if (importMapping) fd.append("mapping", JSON.stringify(importMapping));
      const up = xhrUpload({
        url: "/api/admin/verification-records/import",
        method: "POST",
        body: fd,
        onProgress: (info) =>
          setImportProg({ pct: info.pct, bps: info.bytesPerSecond }),
      });
      importAbortRef.current = up.abort;
      const res = await up.promise;
      const data = (res.json ?? {}) as {
        ok?: boolean;
        error?: string;
        created?: number;
        skipped?: { rowNumber: number; reason: string }[];
        autoEnrolled?: number;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Unable to import the records.");
      const skipped = data.skipped ?? [];
      const reasons = skipped
        .slice(0, 3)
        .map((s) => `Row ${s.rowNumber}: ${s.reason}`)
        .join(" · ");
      setImportOpen(false);
      resetImport();
      flash(
        "ok",
        `${data.created ?? 0} added · ${skipped.length} skipped${
          reasons ? ` — ${reasons}` : ""
        }${data.autoEnrolled ? ` · ${data.autoEnrolled} attendance-ready` : ""}`,
      );
      await refreshRegisters();
    } catch (err) {
      if (isUploadCancelled(err)) {
        flash("ok", "Import cancelled — nothing was added.");
      } else {
        flash("err", err instanceof Error ? err.message : "Unable to import the records.");
      }
    } finally {
      importAbortRef.current = null;
      setImportProg(null);
      setImportBusy(false);
    }
  };

  /* ── v2.8.67.2 — BATCH SELECT + DELETE ─────────────────────────────── */
  const toggleRowSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Remove ${ids.length} selected record${ids.length === 1 ? "" : "s"} from the register? Existing approved accounts are not affected.`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/verification-records?type=${tab}&ids=${ids.join(",")}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Unable to delete the records.");
      const removed = data.deleted ?? ids.length;
      if (tab === "student") setStudents((list) => list.filter((r) => !selectedIds.has(r.id)));
      else setTeachers((list) => list.filter((r) => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      flash("ok", `${removed} record${removed === 1 ? "" : "s"} removed.`);
    } catch (err) {
      flash("err", err instanceof Error ? err.message : "Unable to delete the records.");
    } finally {
      setBusy(false);
    }
  };

  /* initials for the avatar circle when no photo exists yet */
  const initialsOf = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "S";

  const avatar = (row: StudentRecordRow | TeacherRecordRow, type: "student" | "teacher") => (
    <div className="relative shrink-0">
      {row.photoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={row.photoUrl}
          alt=""
          className="h-12 w-12 rounded-full border border-[var(--la-border)] bg-white object-cover"
        />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[var(--la-tint-blue)] text-[13px] font-semibold text-[var(--la-blue-text)]">
          {initialsOf(row.fullName)}
        </span>
      )}
      <button
        type="button"
        disabled={photoBusyId === row.id}
        onClick={() => openPhotoPicker(type, row.id)}
        title="Set profile photo"
        aria-label={`Set profile photo for ${row.fullName}`}
        className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] text-[var(--la-body)] shadow transition-colors hover:border-[#ffd444] hover:text-[var(--la-heading)] disabled:opacity-50"
      >
        {photoBusyId === row.id ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Camera size={12} />
        )}
      </button>
    </div>
  );

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((r) =>
      [r.fullName, r.admissionNo, r.registerNo ?? "", r.className, r.fatherName, r.motherName, r.phone ?? "", r.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [students, query]);

  const filteredTeachers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((r) =>
      [r.fullName, r.teacherId, r.email ?? "", r.phone ?? "", r.designation ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [teachers, query]);

  const rows = tab === "student" ? filteredStudents : filteredTeachers;

  /* v2.8.67.2 — select-all acts on the FILTERED set (what's on screen). */
  const allRowsSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (allRowsSelected) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  };

  /* one-line summary of a preview row for the import list */
  const importRowSummary = (row: ImportPreviewRow) =>
    (
      tab === "student"
        ? [
            row.values.admissionNo,
            row.values.className,
            row.values.fatherName,
            row.values.motherName,
            row.values.phone,
          ]
        : [row.values.teacherId, row.values.email, row.values.designation, row.values.phone]
    )
      .filter(Boolean)
      .join(" · ") || "—";

  const rowCheckbox = (row: StudentRecordRow | TeacherRecordRow) => (
    <input
      type="checkbox"
      className="h-4 w-4 shrink-0 accent-[#ffd444]"
      checked={selectedIds.has(row.id)}
      onChange={() => toggleRowSelected(row.id)}
      aria-label={`Select ${row.fullName} for batch delete`}
      title="Select for batch delete"
    />
  );

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${
            notice.kind === "ok"
              ? "border-[var(--la-good-bg)] bg-[var(--la-good-bg)] text-[var(--la-good-text)]"
              : "border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] text-[var(--la-danger-text)]"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* v2.8.68.1 — the live photo-upload strip (camera button uploads). */}
      {photoBusyId != null && photoProg ? (
        <div
          role="status"
          aria-label={`Uploading photo: ${photoProg.pct}%`}
          className="rounded-xl border border-[var(--la-border)] bg-[var(--la-accent-soft)] px-4 py-3"
        >
          <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
            <span className="font-semibold text-[var(--la-heading)]">Uploading photo…</span>
            <span className="font-semibold tabular-nums text-[var(--la-muted)]">
              {photoProg.pct}%
              {speedLabel(photoProg.bps) ? ` · ${speedLabel(photoProg.bps)}` : ""}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--la-border)]">
            <div
              className="h-full rounded-full bg-[var(--la-accent)] transition-[width] duration-300"
              style={{ width: `${Math.max(3, photoProg.pct)}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => photoAbortRef.current?.()}
            className="mt-2 inline-flex items-center gap-1 rounded-full text-[10.5px] font-semibold text-[var(--la-muted)] transition-colors hover:text-[var(--la-danger-text)]"
          >
            <X size={11} aria-hidden="true" /> Cancel upload
          </button>
        </div>
      ) : null}

      <p className="text-[12.5px] leading-relaxed text-[var(--la-body)]">
        These registers are the source of truth for portal self-registration.
        A registration only opens automatically when every checked detail
        matches; anything else waits in{" "}
        <span className="font-semibold text-[var(--la-heading)]">Registration Approvals</span>.
      </p>

      {/* Tabs + search + add */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setTab("student");
            setSelectedIds(new Set());
          }}
          className={tab === "student" ? btnGold : btnGhost}
        >
          <GraduationCap size={14} /> Students ({students.length})
        </button>
        <button
          onClick={() => {
            setTab("teacher");
            setSelectedIds(new Set());
          }}
          className={tab === "teacher" ? btnGold : btnGhost}
        >
          <BookOpen size={14} /> Teachers ({teachers.length})
        </button>
        <span className="flex-1" />
        <button
          onClick={() => {
            resetImport();
            setImportOpen(true);
          }}
          className={btnGhost}
        >
          <FileSpreadsheet size={15} /> Import Excel
        </button>
        <button
          onClick={() => {
            setForm({});
            setAddOpen(true);
          }}
          className={btnGold}
        >
          <Plus size={15} /> Add {tab === "student" ? "student" : "teacher"}
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--la-faint)]"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={searchInput}
          placeholder={`Search the ${tab === "student" ? "student" : "staff"} register…`}
          aria-label="Search the register"
        />
      </div>

      {/* v2.8.67.2 — master select bar + sticky batch-delete bar */}
      <div className="flex items-center gap-3 px-1">
        <label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] text-[var(--la-body)]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#ffd444]"
            checked={allRowsSelected}
            onChange={toggleSelectAll}
            disabled={rows.length === 0}
            aria-label={`Select all ${tab === "student" ? "students" : "teachers"} on the list`}
          />
          Select all{query.trim() ? " (filtered)" : ""}
          {rows.length > 0 ? ` · ${rows.length} on the list` : ""}
        </label>
      </div>

      {selectedIds.size > 0 && (
        <div className="la-panel-shadow sticky top-2 z-20 flex items-center gap-3 rounded-full border border-[var(--la-danger-bg)] bg-[var(--la-panel)] px-4 py-2">
          <span className="text-[12.5px] font-semibold text-[var(--la-danger-text)]">
            {selectedIds.size} selected
          </span>
          <span className="flex-1" />
          <button onClick={deleteSelected} disabled={busy} className={btnDanger}>
            <Trash2 size={14} /> Delete selected
          </button>
        </div>
      )}

      {/* LIST */}
      <div className="la-panel-shadow overflow-hidden rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)]">
        <div className="la-scrollbar max-h-[34rem] divide-y divide-[var(--la-divider)] overflow-y-auto">
          {rows.length === 0 && (
            <p className="px-5 py-10 text-center text-[13px] text-[var(--la-muted)]">
              {query.trim()
                ? `No ${tab === "student" ? "students" : "teachers"} match “${query.trim()}”.`
                : `The ${tab} register is empty — add records so self-registrations can be verified.`}
            </p>
          )}

          {tab === "student" &&
            filteredStudents.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--la-panel-soft)]"
              >
                {avatar(row, "student")}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-[var(--la-heading)]">
                    {row.fullName}{" "}
                    <span className="ml-1 inline-block translate-y-[-1px] rounded-full bg-[var(--la-tint-blue)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--la-blue-text)]">
                      {row.className}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--la-muted)]">
                    Admission {row.admissionNo}
                    {row.registerNo ? ` · Register ${row.registerNo}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--la-faint)]">
                    Father {row.fatherName} · Mother {row.motherName}
                    {row.phone ? ` · ${row.phone}` : ""}
                    {row.email ? ` · ${row.email}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {rowCheckbox(row)}
                  <button
                    disabled={busy}
                    onClick={() => openEdit(row)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-border)] px-3 text-[12.5px] font-medium text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)] disabled:opacity-50"
                    title="Edit record"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => deleteRecord(row.id)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-danger-bg)] px-3 text-[12.5px] font-medium text-[var(--la-danger-text)] transition-colors hover:bg-[var(--la-danger-bg)] disabled:opacity-50"
                    title="Remove from register"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

          {tab === "teacher" &&
            filteredTeachers.map((row) => (
              <div
                key={row.id}
                className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--la-panel-soft)]"
              >
                {avatar(row, "teacher")}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-[var(--la-heading)]">
                    {row.fullName}{" "}
                    <span className="ml-1 inline-block translate-y-[-1px] rounded-full bg-[var(--la-good-bg)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--la-good-text)]">
                      {row.teacherId}
                    </span>
                  </p>
                  <p className="mt-1 text-[11.5px] text-[var(--la-faint)]">
                    {row.email || "No email"}
                    {row.phone ? ` · ${row.phone}` : ""}
                    {row.designation ? ` · ${row.designation}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {rowCheckbox(row)}
                  <button
                    disabled={busy}
                    onClick={() => openEdit(row)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-border)] px-3 text-[12.5px] font-medium text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)] disabled:opacity-50"
                    title="Edit record"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => deleteRecord(row.id)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-danger-bg)] px-3 text-[12.5px] font-medium text-[var(--la-danger-text)] transition-colors hover:bg-[var(--la-danger-bg)] disabled:opacity-50"
                    title="Remove from register"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* ADD dialog */}
      {addOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setAddOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Add ${tab} record`}
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Add to {tab === "student" ? "student" : "staff"} register
            </h3>
            <p className="mt-1 text-[12.5px] text-[var(--la-muted)]">
              Type the details exactly as the office holds them — registrants
              must match them.
            </p>
            <form
              className="mt-5 space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                createRecord();
              }}
            >
              {tab === "student" ? (
                <>
                  {/* v2.8.62.0 — the owner: "verification records daddi godak
                      welawata thawa details danna wenawa ne" — only the THREE
                      fields verification actually needs are required now;
                      everything else is optional and can be added later with
                      Edit. The register matcher skips the details the office
                      has not filled in yet. */}
                  <input required value={form.admissionNo ?? ""} onChange={(e) => set("admissionNo")(e.target.value)} className={input} placeholder="Admission number *" aria-label="Admission number" />
                  <input required value={form.fullName ?? ""} onChange={(e) => set("fullName")(e.target.value)} className={input} placeholder="Full name *" aria-label="Full name" />
                  {/* v2.8.59.0 — the owner: "selection list ekak demuda" — no
                      more free-typed classes; pick from the school's real
                      names so verification never fails on a typo. */}
                  {classNames.length > 0 ? (
                    <select
                      required
                      value={form.className ?? ""}
                      onChange={(e) => set("className")(e.target.value)}
                      className={input}
                      aria-label="Class"
                    >
                      <option value="" disabled>
                        Class * (pick from the school list)
                      </option>
                      {classNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input required value={form.className ?? ""} onChange={(e) => set("className")(e.target.value)} className={input} placeholder="Class (e.g. 10-A) *" aria-label="Class" />
                  )}
                  <input value={form.registerNo ?? ""} onChange={(e) => set("registerNo")(e.target.value)} className={input} placeholder="Register number (optional)" aria-label="Register number" />
                  <input value={form.fatherName ?? ""} onChange={(e) => set("fatherName")(e.target.value)} className={input} placeholder="Father's full name (optional)" aria-label="Father's full name" />
                  <input value={form.motherName ?? ""} onChange={(e) => set("motherName")(e.target.value)} className={input} placeholder="Mother's full name (optional)" aria-label="Mother's full name" />
                  <input value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone (optional)" aria-label="Phone" />
                  <input type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email (optional)" aria-label="Email" />
                  <p className="text-[11.5px] leading-relaxed text-[var(--la-faint)]">
                    Only the admission number, name and class are needed to add
                    a student — the rest can be filled in later with the Edit
                    button. Blank details are simply skipped when checking
                    registrations, never held against them.
                  </p>
                </>
              ) : (
                <>
                  <input required value={form.teacherId ?? ""} onChange={(e) => set("teacherId")(e.target.value)} className={input} placeholder="Teacher ID (e.g. T-012) *" aria-label="Teacher ID" />
                  <input required value={form.fullName ?? ""} onChange={(e) => set("fullName")(e.target.value)} className={input} placeholder="Full name *" aria-label="Full name" />
                  <input type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email (optional)" aria-label="Email" />
                  <input value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone (optional)" aria-label="Phone" />
                  <input value={form.designation ?? ""} onChange={(e) => set("designation")(e.target.value)} className={input} placeholder="Designation (optional)" aria-label="Designation" />
                </>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAddOpen(false)} className={btnGhost} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className={btnGold} disabled={busy}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* EDIT dialog (v2.8.48.0) — same fields, identity locked */}
      {editOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setEditOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${tab} record`}
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Edit {tab === "student" ? "student" : "staff"} record
            </h3>
            <p className="mt-1 text-[12.5px] text-[var(--la-muted)]">
              {tab === "student"
                ? "Fix typos and life events here. Changing the class moves the student's enrollment so attendance, homework and marks follow."
                : "Fix contact details and designation. The teacher ID is the identity used for verification."}
            </p>
            <form
              className="mt-5 space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void saveEdit();
              }}
            >
              {tab === "student" ? (
                <>
                  <input
                    disabled
                    value={form.admissionNo ?? ""}
                    className={`${input} cursor-not-allowed opacity-60`}
                    placeholder="Admission number"
                    aria-label="Admission number (locked)"
                  />
                  <p className="-mt-2 text-[11px] text-[var(--la-faint)]">
                    Admission number is locked — it identifies this student everywhere.
                  </p>
                  <input required value={form.fullName ?? ""} onChange={(e) => set("fullName")(e.target.value)} className={input} placeholder="Full name *" aria-label="Full name" />
                  <input value={form.registerNo ?? ""} onChange={(e) => set("registerNo")(e.target.value)} className={input} placeholder="Register number (optional)" aria-label="Register number" />
                  {/* v2.8.59.0 — dropdown here too (the row's own class is
                      included as an option even if the master list moved on). */}
                  {(() => {
                    const options = [
                      ...new Set([form.className ?? "", ...classNames].filter(Boolean)),
                    ];
                    return options.length > 1 || classNames.length > 0 ? (
                      <select
                        required
                        value={form.className ?? ""}
                        onChange={(e) => set("className")(e.target.value)}
                        className={input}
                        aria-label="Class"
                      >
                        {options.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input required value={form.className ?? ""} onChange={(e) => set("className")(e.target.value)} className={input} placeholder="Class (e.g. 10-A) *" aria-label="Class" />
                    );
                  })()}
                  <input value={form.fatherName ?? ""} onChange={(e) => set("fatherName")(e.target.value)} className={input} placeholder="Father's full name (optional)" aria-label="Father's full name" />
                  <input value={form.motherName ?? ""} onChange={(e) => set("motherName")(e.target.value)} className={input} placeholder="Mother's full name (optional)" aria-label="Mother's full name" />
                  <input value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone (optional)" aria-label="Phone" />
                  <input type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email (optional)" aria-label="Email" />
                </>
              ) : (
                <>
                  <input
                    disabled
                    value={form.teacherId ?? ""}
                    className={`${input} cursor-not-allowed opacity-60`}
                    placeholder="Teacher ID"
                    aria-label="Teacher ID (locked)"
                  />
                  <p className="-mt-2 text-[11px] text-[var(--la-faint)]">
                    Teacher ID is locked — it identifies this teacher for verification.
                  </p>
                  <input required value={form.fullName ?? ""} onChange={(e) => set("fullName")(e.target.value)} className={input} placeholder="Full name *" aria-label="Full name" />
                  <input type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email (optional)" aria-label="Email" />
                  <input value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone (optional)" aria-label="Phone" />
                  <input value={form.designation ?? ""} onChange={(e) => set("designation")(e.target.value)} className={input} placeholder="Designation (optional)" aria-label="Designation" />
                </>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditOpen(false)} className={btnGhost} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className={btnGold} disabled={busy}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* v2.8.67.2 — IMPORT dialog: pick a sheet → auto-detected columns →
          row verdicts → confirm. Same modal pattern as the ADD dialog. */}
      {importOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={closeImport}
          role="dialog"
          aria-modal="true"
          aria-label="Import records from Excel"
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Import {tab === "student" ? "students" : "teachers"} from Excel
            </h3>
            <p className="mt-1 text-[12.5px] text-[var(--la-muted)]">
              Drop the register sheet in — the columns are detected
              automatically (any reasonable header naming works) and nothing
              is saved until you confirm the preview.
            </p>

            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runImportPreview(file);
                e.target.value = "";
              }}
            />

            {!importFile && !importError && (
              <button
                type="button"
                onClick={() => {
                  if (importInputRef.current) importInputRef.current.value = "";
                  importInputRef.current?.click();
                }}
                className="mt-5 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[var(--la-border)] px-4 py-10 text-center transition-colors hover:border-[#ffd444]"
              >
                <FileSpreadsheet size={26} className="text-[var(--la-faint)]" />
                <span className="text-[13px] font-semibold text-[var(--la-heading)]">
                  Choose a spreadsheet
                </span>
                <span className="text-[11.5px] text-[var(--la-faint)]">
                  .xlsx · .xls · .csv — up to 2000 rows
                </span>
              </button>
            )}

            {importError && (
              <div className="mt-5 rounded-xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-4 py-3 text-[13px] leading-relaxed text-[var(--la-danger-text)]">
                {importError}
              </div>
            )}

            {importBusy && (
              <div className="mt-5 rounded-xl border border-[var(--la-border)] bg-[var(--la-accent-soft)] px-4 py-4">
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span className="flex items-center gap-2 font-semibold text-[var(--la-heading)]">
                    <Loader2 size={14} className="animate-spin" /> Reading the sheet…
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--la-muted)]">
                    {importProg ? importProg.pct : 0}%
                    {importProg && speedLabel(importProg.bps)
                      ? ` · ${speedLabel(importProg.bps)}`
                      : ""}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--la-border)]">
                  <div
                    className="h-full rounded-full bg-[var(--la-accent)] transition-[width] duration-300"
                    style={{ width: `${importProg ? Math.max(3, importProg.pct) : 3}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => importAbortRef.current?.()}
                  className="mt-2 inline-flex items-center gap-1 rounded-full text-[10.5px] font-semibold text-[var(--la-muted)] transition-colors hover:text-[var(--la-danger-text)]"
                >
                  <X size={11} aria-hidden="true" /> Cancel
                </button>
              </div>
            )}

            {importPreview && !importBusy && (
              <div className="mt-5 space-y-4">
                {/* v2.8.70.4 — the COLUMN MAPPER: every target field picks
                    which sheet column feeds it (or "- not imported -").
                    Pre-filled with the auto-detected suggestion; "Apply &
                    re-check" re-validates the rows under the edited map. */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--la-faint)]">
                    Map the sheet columns
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--la-muted)]">
                    Auto-detected for you — change any pairing, then re-check. Required fields
                    must be mapped before the rows validate.
                  </p>
                  <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                    {IMPORT_FIELDS[tab].map((field) => {
                      const required =
                        (tab === "student"
                          ? ["admissionNo", "fullName", "className"]
                          : ["teacherId", "fullName"]
                        ).includes(field);
                      const value = importMapping?.[field] ?? -1;
                      return (
                        <label key={field} className="block">
                          <span className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-[var(--la-heading)]">
                            {IMPORT_FIELD_LABELS[field] ?? field}
                            {required && <span className="text-[var(--la-danger-text)]">*</span>}
                          </span>
                          <select
                            value={value}
                            onChange={(e) => {
                              const next = { ...(importMapping ?? {}) };
                              next[field] = Number(e.target.value);
                              setImportMapping(next);
                              setImportMappingDirty(true);
                            }}
                            className="h-9 w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-2.5 text-[12.5px] text-[var(--la-heading)] outline-none focus:border-[#ffd444]"
                          >
                            <option value={-1}>— not imported —</option>
                            {importPreview.headers.map((header, idx) =>
                              header ? (
                                <option key={idx} value={idx}>
                                  Column {idx + 1}: {header}
                                </option>
                              ) : null,
                            )}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void recheckImport()}
                      disabled={!importMappingDirty || importBusy}
                      className={btnGhost}
                    >
                      <RefreshCw size={14} />
                      Apply &amp; re-check rows
                    </button>
                    {importMappingDirty && (
                      <span className="text-[11.5px] font-medium text-[var(--la-warn-text,#b45309)]">
                        Mapping changed — re-check to refresh the preview.
                      </span>
                    )}
                  </div>
                </div>

                {/* Columns mapped to no field are NOT thrown away — they
                    ride along as extra details on every record. */}
                {importPreview.unmapped.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--la-faint)]">
                      Extra details (saved with each record)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {importPreview.unmapped.map((header) => (
                        <span
                          key={header}
                          className="rounded-full border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-2.5 py-1 text-[11.5px] text-[var(--la-heading)]"
                        >
                          “{header}”
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[12.5px] text-[var(--la-body)]">
                  <span className="font-semibold text-[var(--la-good-text)]">
                    {importPreview.validCount} ready
                  </span>
                  {" · "}
                  <span className="font-semibold text-[var(--la-danger-text)]">
                    {importPreview.invalidCount} invalid
                  </span>
                </p>

                {/* Preview list */}
                <div className="la-scrollbar max-h-64 divide-y divide-[var(--la-divider)] overflow-y-auto rounded-xl border border-[var(--la-border)]">
                  {importPreview.rows.length === 0 && (
                    <p className="px-3.5 py-6 text-center text-[12.5px] text-[var(--la-muted)]">
                      No data rows were found under the header.
                    </p>
                  )}
                  {importPreview.rows.map((row) => (
                    <div key={row.rowNumber} className="flex items-start gap-3 px-3.5 py-2.5">
                      <span className="mt-0.5 w-9 shrink-0 text-right text-[11px] text-[var(--la-faint)]">
                        #{row.rowNumber}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-[var(--la-heading)]">
                          {row.values.fullName || "—"}
                        </p>
                        <p className="truncate text-[11.5px] text-[var(--la-muted)]">
                          {importRowSummary(row)}
                        </p>
                      </div>
                      {row.status === "valid" ? (
                        <span className="shrink-0 rounded-full bg-[var(--la-good-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--la-good-text)]">
                          ready
                        </span>
                      ) : (
                        <span
                          className="max-w-[55%] shrink-0 truncate rounded-full bg-[var(--la-danger-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--la-danger-text)]"
                          title={row.error}
                        >
                          invalid — {row.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeImport}
                    className={btnGhost}
                    disabled={importBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void commitImport()}
                    className={btnGold}
                    disabled={importBusy || importPreview.validCount === 0}
                  >
                    {importBusy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FileSpreadsheet size={14} />
                    )}
                    Import {importPreview.validCount} record
                    {importPreview.validCount === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            )}

            {importError && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    resetImport();
                    if (importInputRef.current) importInputRef.current.value = "";
                    importInputRef.current?.click();
                  }}
                >
                  Try another file
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* v2.8.59.0 — the shared photo input (opened by each row's camera
          button; the upload target rides in state). */}
      <input
        ref={photoInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadPhoto(file);
        }}
      />
    </div>
  );
}
