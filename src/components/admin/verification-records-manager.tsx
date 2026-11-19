"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
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
import { matchImportRowForEdit } from "@/lib/verification-import-client";
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

/* v2.9.16.0 (task 3-b) — TWO owner fixes:
   · PROPER DELETE FLOW (owner: "delete karanna hariyata flow ekak na.
     thibbath eka hariyata work karanne na") — the bare window.confirm is
     replaced by an in-page modal that spells out what is removed (the
     roster enrollment goes; the school record, attendance history and any
     portal account stay), offers to ALSO trash the row's linked portal
     login account (checkbox, only when the API reports a live account),
     and surfaces failures as a visible error line instead of silence.
     Same modal for BATCH deletes ("N records will be deleted").
   · EDIT MODE UPGRADES (owner: "edit mode ekedi excel sheet ekak import
     karala auto fill option ekak na ... aluth field add karannath ba") —
     the Edit dialog grows an Extra details key/value editor (add / edit /
     remove fields; saved as the record's extra_data JSON) and an Import
     row from Excel action: the sheet is parsed IN THE BROWSER, the row
     matching the record's admission no / teacher ID is auto-found with
     the SAME synonym mapping as the bulk import, a preview lists what
     was matched, and Apply fills the form + merges the unmapped columns
     into the extra-details editor. Nothing saves until Save changes. */

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
  /* v2.9.16.0 — the Excel-import extras ({header: value}) and the row's
     live portal login email. Both OPTIONAL: the page's initial payload
     does not carry them (undefined = unknown → the manager fetches the
     one record on demand), the GET refresh always does. */
  extraData?: Record<string, string> | null;
  portalAccountEmail?: string | null;
};

export type TeacherRecordRow = {
  id: number;
  teacherId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  photoUrl?: string | null;
  /* v2.9.16.0 — see StudentRecordRow. */
  extraData?: Record<string, string> | null;
  portalAccountEmail?: string | null;
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

/* ── v2.9.16.0 — API row normalisers ───────────────────────────────────
   The API returns raw DB rows (extraData as the stored JSON string, when
   it includes it at all). Every response is funnelled through these so
   the component state always holds the SAME shape, wherever the row came
   from (page payload, GET refresh, POST/PATCH response, one-record GET). */

const parseExtraData = (raw: unknown): Record<string, string> | null => {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const entries = Object.entries(obj as Record<string, unknown>)
    .filter(([k]) => k.trim().length > 0)
    .map(
      ([k, v]) =>
        [k.trim(), String(v ?? "").slice(0, 200)] as [string, string],
    )
    .slice(0, 30);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const extrasToPairs = (extraData: Record<string, string> | null | undefined) =>
  Object.entries(extraData ?? {}).map(([key, value]) => ({ key, value }));

const normalizeStudentRow = (raw: Record<string, unknown>): StudentRecordRow => ({
  id: Number(raw.id),
  admissionNo: String(raw.admissionNo ?? ""),
  registerNo: (raw.registerNo as string | null) ?? null,
  fullName: String(raw.fullName ?? ""),
  className: String(raw.className ?? ""),
  fatherName: String(raw.fatherName ?? ""),
  motherName: String(raw.motherName ?? ""),
  phone: (raw.phone as string | null) ?? null,
  email: (raw.email as string | null) ?? null,
  photoUrl: (raw.photoUrl as string | null) ?? null,
  extraData: parseExtraData(raw.extraData),
  portalAccountEmail:
    raw.portalAccountEmail === undefined
      ? undefined
      : ((raw.portalAccountEmail as string | null) ?? null),
});

const normalizeTeacherRow = (raw: Record<string, unknown>): TeacherRecordRow => ({
  id: Number(raw.id),
  teacherId: String(raw.teacherId ?? ""),
  fullName: String(raw.fullName ?? ""),
  email: (raw.email as string | null) ?? null,
  phone: (raw.phone as string | null) ?? null,
  designation: (raw.designation as string | null) ?? null,
  photoUrl: (raw.photoUrl as string | null) ?? null,
  extraData: parseExtraData(raw.extraData),
  portalAccountEmail:
    raw.portalAccountEmail === undefined
      ? undefined
      : ((raw.portalAccountEmail as string | null) ?? null),
});

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

  /* v2.9.16.0 (task 3-b) — the PROPER delete flow: in-page modals instead
     of window.confirm, with the account-trash option and visible errors. */
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "student" | "teacher";
    row: StudentRecordRow | TeacherRecordRow;
  } | null>(null);
  const [deleteWithAccount, setDeleteWithAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleteWithAccount, setBatchDeleteWithAccount] = useState(false);
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);

  /* v2.9.16.0 (task 3-b) — Edit dialog: extra-details editor + Excel
     auto-fill for the ONE record being edited. */
  const [editRow, setEditRow] = useState<StudentRecordRow | TeacherRecordRow | null>(null);
  const [editExtras, setEditExtras] = useState<{ key: string; value: string }[]>([]);
  const extrasTouchedRef = useRef(false);
  const editIdRef = useRef<number | null>(null);
  const [editImportBusy, setEditImportBusy] = useState(false);
  const [editImportError, setEditImportError] = useState<string | null>(null);
  const [editImportDone, setEditImportDone] = useState<string | null>(null);
  const [editImportPreview, setEditImportPreview] = useState<{
    rowNumber: number;
    matchedBy: string;
    values: Record<string, string>;
    extra: Record<string, string>;
  } | null>(null);
  const editImportInputRef = useRef<HTMLInputElement | null>(null);

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
        student?: Record<string, unknown>;
        teacher?: Record<string, unknown>;
        autoEnrolledInto?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Unable to save the record.");

      if (tab === "student" && data.student) {
        setStudents((list) => [normalizeStudentRow(data.student!), ...list]);
      } else if (data.teacher) {
        setTeachers((list) => [normalizeTeacherRow(data.teacher!), ...list]);
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

  /* v2.9.16.0 — ONE-record fetch: the page's initial payload omits
     extraData + portalAccountEmail; when a dialog opens on such a row we
     quietly fill them from the server (and refresh the list row) so the
     extra editor and the delete modal's account checkbox are accurate
     without forcing a full register refresh first. */
  const hydrateRecord = async (type: "student" | "teacher", id: number) => {
    try {
      const res = await fetch(`/api/admin/verification-records?type=${type}&id=${id}`);
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as {
        student?: Record<string, unknown>;
        teacher?: Record<string, unknown>;
      } | null;
      const raw = data ? (type === "student" ? data.student : data.teacher) : null;
      if (!raw) return null;
      if (type === "student") {
        const row = normalizeStudentRow(raw);
        setStudents((list) => list.map((r) => (r.id === id ? row : r)));
        return row;
      }
      const row = normalizeTeacherRow(raw);
      setTeachers((list) => list.map((r) => (r.id === id ? row : r)));
      return row;
    } catch {
      return null;
    }
  };

  /* v2.8.48.0 — open the dialog prefilled with the row's editable fields. */
  const openEdit = (row: StudentRecordRow | TeacherRecordRow) => {
    setEditId(row.id);
    editIdRef.current = row.id;
    setEditRow(row);
    extrasTouchedRef.current = false;
    setEditExtras(extrasToPairs(parseExtraData(row.extraData)));
    setEditImportBusy(false);
    setEditImportError(null);
    setEditImportDone(null);
    setEditImportPreview(null);
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
    /* Fresh page payload → the extras / account state are UNKNOWN (not
       "empty"). Fill them quietly while the dialog is open; hand-edits
       always win over the late fetch. */
    if (row.extraData === undefined || row.portalAccountEmail === undefined) {
      void hydrateRecord(tab, row.id).then((fresh) => {
        if (!fresh || editIdRef.current !== row.id) return;
        if (!extrasTouchedRef.current) {
          setEditExtras(extrasToPairs(fresh.extraData));
        } else {
          setEditExtras((prev) => {
            const have = new Set(prev.map((p) => p.key.trim().toLowerCase()));
            const additions = extrasToPairs(fresh.extraData).filter(
              (p) => !have.has(p.key.trim().toLowerCase()),
            );
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }
      });
    }
  };

  /* v2.9.16.0 — close the Edit dialog and drop every dialog-scoped state. */
  const closeEdit = () => {
    if (busy) return;
    setEditOpen(false);
    setEditId(null);
    editIdRef.current = null;
    setForm({});
    setEditRow(null);
    setEditExtras([]);
    setEditImportBusy(false);
    setEditImportError(null);
    setEditImportDone(null);
    setEditImportPreview(null);
  };

  const saveEdit = async () => {
    if (editId == null) return;
    setBusy(true);
    try {
      /* v2.9.16.0 — the extra-details editor is the source of truth for
         extraData: trimmed keys/values, empty pairs dropped, at most 30
         pairs — the server applies the same caps again. */
      const extraPairs = editExtras
        .map((p) => ({
          key: p.key.trim().slice(0, 60),
          value: p.value.trim().slice(0, 200),
        }))
        .filter((p) => p.key.length > 0 && p.value.length > 0)
        .slice(0, 30);
      const res = await fetch("/api/admin/verification-records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          id: editId,
          ...form,
          extraData: Object.fromEntries(extraPairs.map((p) => [p.key, p.value])),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        student?: Record<string, unknown>;
        teacher?: Record<string, unknown>;
        enrollmentMoved?: boolean;
        enrollmentNote?: string | null;
      };
      if (!res.ok) throw new Error(data.error || "Unable to update the record.");

      if (tab === "student" && data.student) {
        const saved = normalizeStudentRow(data.student);
        setStudents((list) => list.map((r) => (r.id === editId ? saved : r)));
      } else if (data.teacher) {
        const saved = normalizeTeacherRow(data.teacher);
        setTeachers((list) => list.map((r) => (r.id === editId ? saved : r)));
      }
      setEditOpen(false);
      setEditId(null);
      editIdRef.current = null;
      setForm({});
      setEditRow(null);
      setEditExtras([]);
      setEditImportPreview(null);
      setEditImportError(null);
      setEditImportDone(null);
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

  /* ── v2.9.16.0 (task 3-b) — PROPER DELETE FLOW ────────────────────
     The owner: "delete karanna hariyata flow ekak na. thibbath eka
     hariyata work karanne na" — the bare window.confirm is replaced by
     an in-page modal that says exactly what is removed, offers the
     linked portal account's trash (only when the API reports a live
     account) and shows failures as a visible error line. */
  const openDeleteModal = (row: StudentRecordRow | TeacherRecordRow) => {
    setDeleteTarget({ type: tab, row });
    setDeleteWithAccount(false);
    setDeleteError(null);
    if (row.portalAccountEmail === undefined) {
      /* Fresh page payload → the account state is UNKNOWN: fill quietly
         so the trash checkbox appears when a live account exists. */
      void hydrateRecord(tab, row.id).then((fresh) => {
        if (!fresh) return;
        setDeleteTarget((prev) =>
          prev && prev.type === tab && prev.row.id === row.id
            ? { type: tab, row: fresh }
            : prev,
        );
      });
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setBusy(true);
    setDeleteError(null);
    try {
      /* Only pass withAccount when the office ticked the box (and a live
         account was reported) — the API reports what actually happened. */
      const withAccount =
        deleteWithAccount && target.row.portalAccountEmail ? 1 : 0;
      const res = await fetch(
        `/api/admin/verification-records?type=${target.type}&id=${target.row.id}&withAccount=${withAccount}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        trashedAccount?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Unable to delete the record.");
      if (target.type === "student") {
        setStudents((list) => list.filter((r) => r.id !== target.row.id));
      } else {
        setTeachers((list) => list.filter((r) => r.id !== target.row.id));
      }
      setDeleteTarget(null);
      flash(
        "ok",
        data.trashedAccount
          ? "Record removed — the linked portal login account was moved to the trash."
          : "Record removed from the register.",
      );
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Unable to delete the record.",
      );
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
    /* v2.9.16.0 — the normalisers carry extraData + portalAccountEmail
       through, so every refreshed row is delete/edit-dialog ready. */
    if (Array.isArray(data.students)) {
      setStudents(data.students.map((r) => normalizeStudentRow(r)));
    }
    if (Array.isArray(data.teachers)) {
      setTeachers(data.teachers.map((r) => normalizeTeacherRow(r)));
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

  /* v2.9.16.0 (task 3-b) — BATCH delete rides the SAME modal pattern:
     "N records will be deleted" + the same account-trash checkbox, which
     applies to every selected row that has a live portal account. */
  const selectedRows = useMemo(
    () => (tab === "student" ? students : teachers).filter((r) => selectedIds.has(r.id)),
    [tab, students, teachers, selectedIds],
  );
  const anySelectedHasAccount = selectedRows.some((r) => !!r.portalAccountEmail);

  const openBatchDelete = () => {
    if (selectedIds.size === 0) return;
    setBatchDeleteWithAccount(false);
    setBatchDeleteError(null);
    setBatchDeleteOpen(true);
  };

  const confirmBatchDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBusy(true);
    setBatchDeleteError(null);
    try {
      const withAccount = batchDeleteWithAccount && anySelectedHasAccount ? 1 : 0;
      const res = await fetch(
        `/api/admin/verification-records?type=${tab}&ids=${ids.join(",")}&withAccount=${withAccount}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: number;
        missing?: number[];
        trashedAccounts?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Unable to delete the records.");
      const removed = data.deleted ?? ids.length;
      const trashed = data.trashedAccounts ?? 0;
      const gone = new Set(ids);
      if (tab === "student") setStudents((list) => list.filter((r) => !gone.has(r.id)));
      else setTeachers((list) => list.filter((r) => !gone.has(r.id)));
      setSelectedIds(new Set());
      setBatchDeleteOpen(false);
      flash(
        "ok",
        `${removed} record${removed === 1 ? "" : "s"} removed` +
          (trashed > 0
            ? ` · ${trashed} portal account${trashed === 1 ? "" : "s"} moved to the trash`
            : "") +
          ((data.missing?.length ?? 0) > 0
            ? ` · ${data.missing!.length} already gone`
            : ""),
      );
    } catch (err) {
      setBatchDeleteError(
        err instanceof Error ? err.message : "Unable to delete the records.",
      );
    } finally {
      setBusy(false);
    }
  };

  /* ── v2.9.16.0 (task 3-b) — EDIT-MODE EXCEL AUTO-FILL ─────────────
     The owner: "edit mode ekedi excel sheet ekak import karala auto fill
     option ekak na" — the Edit dialog picks a sheet, parses it IN THE
     BROWSER with SheetJS, matches the row that belongs to the record
     being edited (same synonym mapping as the bulk import) and fills the
     form + extra editor on Apply. Nothing saves until Save changes. */
  const openEditImportPicker = () => {
    setEditImportError(null);
    if (editImportInputRef.current) editImportInputRef.current.value = "";
    editImportInputRef.current?.click();
  };

  const runEditImport = async (file: File) => {
    if (editImportBusy) return;
    setEditImportBusy(true);
    setEditImportError(null);
    setEditImportDone(null);
    setEditImportPreview(null);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("The file holds no sheets to read.");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: "",
      });
      /* Match by the record's identity — the form value first (the office
         may have just corrected it), the stored row as the fallback. */
      const identity =
        tab === "student"
          ? {
              admissionNo:
                form.admissionNo ||
                (editRow && "className" in editRow ? editRow.admissionNo : ""),
            }
          : {
              teacherId:
                form.teacherId ||
                (editRow && !("className" in editRow) ? editRow.teacherId : ""),
            };
      const result = matchImportRowForEdit(matrix, tab, identity);
      if (!result.ok) throw new Error(result.error);
      setEditImportPreview({
        rowNumber: result.rowNumber,
        matchedBy: result.matchedBy,
        values: result.values,
        extra: result.extra,
      });
    } catch (err) {
      setEditImportError(
        err instanceof Error
          ? err.message
          : "That file could not be read as a spreadsheet.",
      );
    } finally {
      setEditImportBusy(false);
    }
  };

  const applyEditImportPreview = () => {
    const preview = editImportPreview;
    if (!preview) return;
    for (const field of IMPORT_FIELDS[tab]) {
      const value = preview.values[field];
      if (value) set(field)(value);
    }
    const extraEntries = Object.entries(preview.extra);
    if (extraEntries.length > 0) {
      setEditExtras((prev) => {
        const next = prev.map((p) => ({ ...p }));
        for (const [key, value] of extraEntries) {
          const existing = next.find(
            (p) => p.key.trim().toLowerCase() === key.trim().toLowerCase(),
          );
          if (existing) existing.value = value;
          else next.push({ key, value });
        }
        return next;
      });
      extrasTouchedRef.current = true;
    }
    setEditImportPreview(null);
    setEditImportDone(
      `Filled from sheet row #${preview.rowNumber} — review the details, then press Save changes.`,
    );
  };

  /* ── v2.9.16.0 — EXTRA DETAILS key/value editor helpers ─────────── */
  const updateExtraPair = (
    idx: number,
    patch: Partial<{ key: string; value: string }>,
  ) => {
    extrasTouchedRef.current = true;
    setEditExtras((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  };
  const addExtraPair = () => {
    extrasTouchedRef.current = true;
    setEditExtras((prev) => [...prev, { key: "", value: "" }]);
  };
  const removeExtraPair = (idx: number) => {
    extrasTouchedRef.current = true;
    setEditExtras((prev) => prev.filter((_, i) => i !== idx));
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

  /* v2.9.16.0 — the Edit dialog's "Matched row" preview lines: the mapped
     record fields first, then the unmapped columns that will ride along
     as extra details. */
  const editImportPreviewLines = (() => {
    if (!editImportPreview) return [];
    const lines = IMPORT_FIELDS[tab]
      .filter((field) => editImportPreview.values[field])
      .map((field) => ({
        label: IMPORT_FIELD_LABELS[field] ?? field,
        value: editImportPreview.values[field],
      }));
    const extraLines = Object.entries(editImportPreview.extra).map(
      ([label, value]) => ({ label, value }),
    );
    return [...lines, ...extraLines];
  })();

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
          <button onClick={openBatchDelete} disabled={busy} className={btnDanger}>
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
                    onClick={() => openDeleteModal(row)}
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
                    onClick={() => openDeleteModal(row)}
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
                  {/* v2.9.13.0 — phone + email are REQUIRED now (owner: "email
                      ekai, phone number ekai optional danna epa eka required
                      karanna"). */}
                  <input required value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone *" aria-label="Phone" />
                  <input required type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email *" aria-label="Email" />
                  <p className="text-[11.5px] leading-relaxed text-[var(--la-faint)]">
                    Admission number, name, class, phone and email are needed
                    to add a student — the other details can be filled in
                    later with the Edit button. Blank details are simply
                    skipped when checking registrations, never held against
                    them.
                  </p>
                </>
              ) : (
                <>
                  <input required value={form.teacherId ?? ""} onChange={(e) => set("teacherId")(e.target.value)} className={input} placeholder="Teacher ID (e.g. T-012) *" aria-label="Teacher ID" />
                  <input required value={form.fullName ?? ""} onChange={(e) => set("fullName")(e.target.value)} className={input} placeholder="Full name *" aria-label="Full name" />
                  {/* v2.9.13.0 — phone + email are REQUIRED now. */}
                  <input required type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email *" aria-label="Email" />
                  <input required value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone *" aria-label="Phone" />
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
          onClick={closeEdit}
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
                ? "Fix typos and life events here. The admission number is correctable too — the student's portal link and login follow the fix. Changing the class moves the enrollment so attendance, homework and marks follow."
                : "Fix contact details and designation. The teacher ID is correctable too — the teacher's portal link follows the fix."}
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
                  {/* v2.9.13.0 — the admission number is EDITABLE now (owner:
                      "student id eka change karanna ba"); duplicates are
                      refused server-side and the portal link follows. */}
                  <input
                    required
                    value={form.admissionNo ?? ""}
                    onChange={(e) => set("admissionNo")(e.target.value)}
                    className={input}
                    placeholder="Admission number *"
                    aria-label="Admission number"
                  />
                  <p className="-mt-2 text-[11px] text-[var(--la-faint)]">
                    Changing the admission number re-links the student&apos;s
                    portal account and login automatically.
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
                  {/* v2.9.13.0 — phone + email required on edit too (legacy
                      blanks get filled in this same save). */}
                  <input required value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone *" aria-label="Phone" />
                  <input required type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email *" aria-label="Email" />
                </>
              ) : (
                <>
                  {/* v2.9.13.0 — the teacher ID is EDITABLE now; duplicates
                      are refused server-side and the portal link follows. */}
                  <input
                    required
                    value={form.teacherId ?? ""}
                    onChange={(e) => set("teacherId")(e.target.value)}
                    className={input}
                    placeholder="Teacher ID (e.g. T-012) *"
                    aria-label="Teacher ID"
                  />
                  <p className="-mt-2 text-[11px] text-[var(--la-faint)]">
                    Changing the teacher ID re-links the teacher&apos;s portal
                    account automatically.
                  </p>
                  <input required value={form.fullName ?? ""} onChange={(e) => set("fullName")(e.target.value)} className={input} placeholder="Full name *" aria-label="Full name" />
                  <input required type="email" value={form.email ?? ""} onChange={(e) => set("email")(e.target.value)} className={input} placeholder="Email *" aria-label="Email" />
                  <input required value={form.phone ?? ""} onChange={(e) => set("phone")(e.target.value)} className={input} placeholder="Phone *" aria-label="Phone" />
                  <input value={form.designation ?? ""} onChange={(e) => set("designation")(e.target.value)} className={input} placeholder="Designation (optional)" aria-label="Designation" />
                </>
              )}

              {/* v2.9.16.0 (task 3-b) — EXTRA DETAILS: the key/value editor
                  for the record's extra_data fields (Excel-import columns
                  and hand-added pairs alike). */}
              <div className="rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--la-faint)]">
                      Extra details
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--la-muted)]">
                      Additional fields this record carries — Excel-import
                      columns and anything you add by hand.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addExtraPair}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] px-3 text-[12px] font-medium text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)]"
                  >
                    <Plus size={13} /> Add field
                  </button>
                </div>
                {editExtras.length === 0 ? (
                  <p className="mt-3 text-[11.5px] text-[var(--la-faint)]">
                    No extra details on this record yet.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {editExtras.map((pair, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={pair.key}
                          onChange={(e) => updateExtraPair(idx, { key: e.target.value })}
                          className="h-9 w-[38%] shrink-0 rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-2.5 text-[12px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]"
                          placeholder="Field name"
                          maxLength={60}
                          aria-label={`Extra field ${idx + 1} name`}
                        />
                        <input
                          value={pair.value}
                          onChange={(e) => updateExtraPair(idx, { value: e.target.value })}
                          className="h-9 min-w-0 flex-1 rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-2.5 text-[12px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]"
                          placeholder="Value"
                          maxLength={200}
                          aria-label={`Extra field ${idx + 1} value`}
                        />
                        <button
                          type="button"
                          onClick={() => removeExtraPair(idx)}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--la-border)] text-[var(--la-muted)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-danger-text)]"
                          title="Remove this field"
                          aria-label={`Remove extra field ${idx + 1}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                    <p className="text-[11px] text-[var(--la-faint)]">
                      Up to 30 fields · names up to 60 characters · values up to 200.
                    </p>
                  </div>
                )}
              </div>

              {/* v2.9.16.0 (task 3-b) — EDIT-MODE EXCEL AUTO-FILL: match the
                  row that belongs to THIS record, preview it, then fill the
                  form + extras on Apply. Nothing saves until Save changes. */}
              <div>
                <input
                  ref={editImportInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void runEditImport(file);
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openEditImportPicker}
                    disabled={editImportBusy}
                    className={btnGhost}
                  >
                    {editImportBusy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FileSpreadsheet size={14} />
                    )}
                    Import row from Excel
                  </button>
                  <span className="text-[11.5px] text-[var(--la-faint)]">
                    .xlsx · .xls · .csv — auto-matches this record&apos;s row
                  </span>
                </div>
                {editImportError && (
                  <div className="mt-2 rounded-xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--la-danger-text)]">
                    {editImportError}
                  </div>
                )}
                {editImportDone && (
                  <div className="mt-2 rounded-xl border border-[var(--la-good-bg)] bg-[var(--la-good-bg)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--la-good-text)]">
                    {editImportDone}
                  </div>
                )}
                {editImportPreview && (
                  <div className="mt-3 rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] p-3.5">
                    <p className="text-[12px] font-semibold text-[var(--la-heading)]">
                      Matched row #{editImportPreview.rowNumber}{" "}
                      <span className="font-medium text-[var(--la-muted)]">
                        (by {editImportPreview.matchedBy})
                      </span>
                    </p>
                    <div className="la-scrollbar mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                      {editImportPreviewLines.map((line) => (
                        <p
                          key={line.label}
                          className="truncate text-[12px] text-[var(--la-body)]"
                        >
                          <span className="font-semibold text-[var(--la-heading)]">
                            {line.label}:
                          </span>{" "}
                          {line.value}
                        </p>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditImportPreview(null)}
                        className={btnGhost}
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={applyEditImportPreview}
                        className={btnGold}
                      >
                        <Check size={14} /> Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeEdit} className={btnGhost} disabled={busy}>
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
      {/* v2.9.16.0 (task 3-b) — the DELETE modal (single). Says exactly what
          is removed, offers the linked portal account's trash (only when the
          API reports a live account) and surfaces failures — the
          window.confirm era is over. */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Delete verification record"
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Delete verification record
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--la-muted)]">
              {deleteTarget.type === "student"
                ? "The class enrollment (attendance roster) is removed too. The student's school record and attendance history are kept. Any linked portal account stays."
                : "The staff register row is removed. The staff person record and attendance history are kept. Any linked portal account stays."}
            </p>

            <div className="mt-4 rounded-xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--la-faint)]">
                {deleteTarget.type === "student" ? "Student record" : "Staff record"}
              </p>
              <p className="mt-1 text-[13.5px] font-semibold text-[var(--la-heading)]">
                {deleteTarget.row.fullName}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--la-muted)]">
                {"className" in deleteTarget.row
                  ? `Admission ${deleteTarget.row.admissionNo}${
                      deleteTarget.row.className ? ` · Class ${deleteTarget.row.className}` : ""
                    }`
                  : `Teacher ID ${deleteTarget.row.teacherId}`}
                {deleteTarget.row.portalAccountEmail
                  ? ` · Portal account ${deleteTarget.row.portalAccountEmail}`
                  : ""}
              </p>
            </div>

            {deleteTarget.row.portalAccountEmail ? (
              <label className="mt-3 flex cursor-pointer select-none items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#ffd444]"
                  checked={deleteWithAccount}
                  onChange={(e) => setDeleteWithAccount(e.target.checked)}
                />
                <span className="text-[12.5px] leading-relaxed text-[var(--la-body)]">
                  Also move the{" "}
                  {deleteTarget.type === "student" ? "student's" : "teacher's"}{" "}
                  portal login account to the trash
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--la-faint)]">
                    The account is soft-deleted (restorable from Portal Users) and
                    its sign-in sessions end now.
                  </span>
                </span>
              </label>
            ) : null}

            {deleteError && (
              <div className="mt-3 rounded-xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--la-danger-text)]">
                {deleteError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className={btnGhost}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className={btnDanger}
                disabled={busy}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete record
              </button>
            </div>
          </div>
        </div>
      )}
      {/* v2.9.16.0 (task 3-b) — the BATCH delete modal: same pattern, one
          checkbox covers every selected row that has a portal account. */}
      {batchDeleteOpen && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !busy && setBatchDeleteOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Delete selected records"
        >
          <div
            className="la-panel-shadow max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-[var(--la-heading)]">
              Delete selected records
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--la-muted)]">
              {selectedIds.size} record{selectedIds.size === 1 ? "" : "s"} will be
              deleted.{" "}
              {tab === "student"
                ? "The class enrollment (attendance roster) is removed too. The students' school records and attendance history are kept."
                : "The staff register rows are removed. The staff person records and attendance history are kept."}
            </p>

            <div className="mt-4 rounded-xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--la-faint)]">
                {tab === "student" ? "Student register" : "Staff register"}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[var(--la-heading)]">
                {selectedRows
                  .slice(0, 3)
                  .map((r) => r.fullName)
                  .join(", ")}
                {selectedRows.length > 3 ? ` + ${selectedRows.length - 3} more` : ""}
              </p>
            </div>

            {anySelectedHasAccount ? (
              <label className="mt-3 flex cursor-pointer select-none items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[#ffd444]"
                  checked={batchDeleteWithAccount}
                  onChange={(e) => setBatchDeleteWithAccount(e.target.checked)}
                />
                <span className="text-[12.5px] leading-relaxed text-[var(--la-body)]">
                  Also move each linked portal login account to the trash
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--la-faint)]">
                    Applies to every selected record that still has a live portal
                    account; they are soft-deleted (restorable) and their sessions
                    end now.
                  </span>
                </span>
              </label>
            ) : null}

            {batchDeleteError && (
              <div className="mt-3 rounded-xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--la-danger-text)]">
                {batchDeleteError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBatchDeleteOpen(false)}
                className={btnGhost}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmBatchDelete()}
                className={btnDanger}
                disabled={busy}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete {selectedIds.size} record{selectedIds.size === 1 ? "" : "s"}
              </button>
            </div>
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
                    {importPreview.validCount - importPreview.rows.filter((r) => r.existing).length} new
                  </span>
                  {" · "}
                  <span className="font-semibold text-[var(--la-warn-text,#b45309)]">
                    {importPreview.rows.filter((r) => r.existing).length} already on the register
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
                        row.existing ? (
                          /* v2.9.15.11 — this admission no / teacher ID is
                             already on the register; the commit skips it. */
                          <span
                            className="shrink-0 rounded-full bg-[var(--la-warn-bg,#fdf3dd)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--la-warn-text,#b45309)]"
                            title="This record is already on the register — importing skips it."
                          >
                            existing
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-[var(--la-good-bg)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--la-good-text)]">
                            ready
                          </span>
                        )
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
                    disabled={
                      importBusy ||
                      /* v2.9.15.11 — rows already on the register are skipped
                         at commit, so only NEW rows make the button usable. */
                      importPreview.validCount -
                        importPreview.rows.filter((r) => r.existing).length ===
                        0
                    }
                  >
                    {importBusy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FileSpreadsheet size={14} />
                    )}
                    Import{" "}
                    {Math.max(
                      0,
                      importPreview.validCount -
                        importPreview.rows.filter((r) => r.existing).length,
                    )}{" "}
                    new record
                    {importPreview.validCount -
                      importPreview.rows.filter((r) => r.existing).length ===
                    1
                      ? ""
                      : "s"}
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
