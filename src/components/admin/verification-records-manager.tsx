"use client";

import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Camera,
} from "lucide-react";

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
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoTarget, setPhotoTarget] = useState<{
    type: "student" | "teacher";
    id: number;
  } | null>(null);

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
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("id", String(id));
      form.append("file", file);
      const res = await fetch("/api/admin/verification-records/photo", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
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
      flash("err", err instanceof Error ? err.message : "Unable to upload the photo.");
    } finally {
      setPhotoBusyId(null);
      setPhotoTarget(null);
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

      <p className="text-[12.5px] leading-relaxed text-[var(--la-body)]">
        These registers are the source of truth for portal self-registration.
        A registration only opens automatically when every checked detail
        matches; anything else waits in{" "}
        <span className="font-semibold text-[var(--la-heading)]">Registration Approvals</span>.
      </p>

      {/* Tabs + search + add */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTab("student")}
          className={tab === "student" ? btnGold : btnGhost}
        >
          <GraduationCap size={14} /> Students ({students.length})
        </button>
        <button
          onClick={() => setTab("teacher")}
          className={tab === "teacher" ? btnGold : btnGhost}
        >
          <BookOpen size={14} /> Teachers ({teachers.length})
        </button>
        <span className="flex-1" />
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
