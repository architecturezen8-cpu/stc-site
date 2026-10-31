"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Eye,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { portalRoleHeaders } from "@/lib/portal-client";
import type {
  ReportCardEditData,
  ReportCardStatus,
  ReportCardView,
  TeacherClassStudents,
} from "@/lib/portal-report-card";
import { ReportCardSheet } from "@/components/portal/report-card-sheet";

/* ────────────────────────────────────────────────────────────────────────
   v2.8.62.0 — the class teacher's report card editor.

   One class roster, one student at a time, the exact paper fields: the
   Subjects × (First Test / Mid Year Test / Year End Test) grid, the three
   term remark blocks (Studies / General Conduct / attendance) and the
   publish lifecycle. Every mutation goes through the portal API with the
   `x-portal-role: teacher` hint; the roster + sheet are re-fetched from
   the server after every action so the screen never lies. Toasts follow
   the portal islands' inline Flash convention.
   ──────────────────────────────────────────────────────────────────────── */

type EditorRow = { subject: string; m1: string; m2: string; m3: string };
type EditorTerm = { studies: string; conduct: string; attendance: string };

function Flash({ flash }: { flash: { ok: boolean; text: string } | null }) {
  if (!flash) return null;
  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-2.5 text-[12px] ${
        flash.ok
          ? "border-transparent bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
          : "border-transparent bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)]"
      }`}
    >
      {flash.text}
    </div>
  );
}

function blankTemplate(subjects: string[]): EditorRow[] {
  return subjects.map((subject) => ({ subject, m1: "", m2: "", m3: "" }));
}

function blankTerms(): EditorTerm[] {
  return [1, 2, 3].map(() => ({ studies: "", conduct: "", attendance: "" }));
}

function seedFromEdit(data: ReportCardEditData): {
  cardId: number | null;
  status: ReportCardStatus;
  rows: EditorRow[];
  terms: EditorTerm[];
  principalNote: string;
  returnedAtLabel: string;
  submittedAtLabel: string;
  certifiedByName: string;
  certifiedAtLabel: string;
} {
  return {
    cardId: data.cardId,
    status: data.status,
    rows: data.rows.map((r) => ({
      subject: r.subject,
      m1: r.m1 == null ? "" : String(r.m1),
      m2: r.m2 == null ? "" : String(r.m2),
      m3: r.m3 == null ? "" : String(r.m3),
    })),
    terms: data.terms.map((t) => ({
      studies: t.studies,
      conduct: t.conduct,
      attendance: t.attendance,
    })),
    principalNote: data.principalNote,
    returnedAtLabel: data.returnedAtLabel,
    submittedAtLabel: data.submittedAtLabel,
    certifiedByName: data.certifiedByName,
    certifiedAtLabel: data.certifiedAtLabel,
  };
}

function seedFromView(view: ReportCardView) {
  return {
    cardId: view.cardId,
    status: view.status,
    rows: view.rows.map((r) => ({
      subject: r.subject,
      m1: r.m1 == null ? "" : String(r.m1),
      m2: r.m2 == null ? "" : String(r.m2),
      m3: r.m3 == null ? "" : String(r.m3),
    })),
    terms: view.terms.map((t) => ({
      studies: t.studies,
      conduct: t.conduct,
      attendance: t.attendance,
    })),
    certifiedByName: view.certifiedByName,
    certifiedAtLabel: view.certifiedAtLabel,
  };
}

function markOrNull(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 0 || num > 999) return "invalid";
  return num;
}

export function ReportCardEditor({
  classDetail,
  initialEdit,
}: {
  classDetail: TeacherClassStudents;
  initialEdit: ReportCardEditData;
}) {
  const classInfo = classDetail.class;
  const [students, setStudents] = useState(classDetail.students);

  const seeded = seedFromEdit(initialEdit);
  const [selectedId, setSelectedId] = useState(initialEdit.student.studentId);
  const [cardId, setCardId] = useState<number | null>(seeded.cardId);
  const [status, setStatus] = useState<ReportCardStatus>(seeded.status);
  const [rows, setRows] = useState<EditorRow[]>(seeded.rows);
  const [terms, setTerms] = useState<EditorTerm[]>(seeded.terms);
  const [classSubjects, setClassSubjects] = useState<string[]>(initialEdit.classSubjects);
  const [studentMeta, setStudentMeta] = useState(initialEdit.student);
  const [signatures, setSignatures] = useState(initialEdit.signatures);
  const [year, setYear] = useState(initialEdit.year);
  /* v2.8.63.0 — certification lifecycle details. */
  const [principalNote, setPrincipalNote] = useState(seeded.principalNote);
  const [returnedAtLabel, setReturnedAtLabel] = useState(seeded.returnedAtLabel);
  const [submittedAtLabel, setSubmittedAtLabel] = useState(seeded.submittedAtLabel);
  const [certifiedInfo, setCertifiedInfo] = useState({
    name: seeded.certifiedByName,
    at: seeded.certifiedAtLabel,
  });

  const [lastView, setLastView] = useState<ReportCardView | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  const selectedStudent = students.find((s) => s.studentId === selectedId) ?? null;
  const deleteArmed = confirmName.trim() === studentMeta.fullName && studentMeta.fullName !== "";

  /* Live per-column Total / Average under the grid. */
  const preview = useMemo(() => {
    const cols = [
      { total: 0, count: 0 },
      { total: 0, count: 0 },
      { total: 0, count: 0 },
    ];
    for (const row of rows) {
      [row.m1, row.m2, row.m3].forEach((value, i) => {
        const parsed = markOrNull(value);
        if (typeof parsed === "number") {
          cols[i].total += parsed;
          cols[i].count += 1;
        }
      });
    }
    return cols.map((c) => ({
      total: c.count > 0 ? c.total : null,
      average: c.count > 0 ? Math.round((c.total / c.count) * 10) / 10 : null,
    }));
  }, [rows]);

  /* Client-side mirror of the server's validation — friendlier errors
     before the round trip; the API re-validates everything anyway. */
  function validate(): string | null {
    const seen = new Set<string>();
    for (const row of rows) {
      const subject = row.subject.trim();
      if (!subject) return "Every subject line needs a name (or remove the empty line).";
      const key = subject.toLowerCase();
      if (seen.has(key)) return `The subject “${subject}” appears twice.`;
      seen.add(key);
      for (const value of [row.m1, row.m2, row.m3]) {
        if (markOrNull(value) === "invalid") {
          return "Marks must be whole numbers between 0 and 999.";
        }
      }
    }
    return null;
  }

  async function refetchRoster() {
    const res = await fetch(`/api/portal/report-cards?classId=${classInfo.id}`, {
      headers: portalRoleHeaders("teacher"),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; students?: typeof students }
      | null;
    if (res.ok && json?.ok && Array.isArray(json.students)) {
      setStudents(json.students);
    }
  }

  async function refetchSheet(id: number) {
    const res = await fetch(`/api/portal/report-cards/${id}`, {
      headers: portalRoleHeaders("teacher"),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; card?: ReportCardView }
      | null;
    if (res.ok && json?.ok && json.card) {
      const view = json.card;
      setLastView(view);
      const seed = seedFromView(view);
      setCardId(seed.cardId);
      setStatus(seed.status);
      setRows(seed.rows);
      setTerms(seed.terms);
      setSignatures(view.signatures);
      setYear(view.year);
      setPrincipalNote("");
      setReturnedAtLabel("");
      setSubmittedAtLabel("");
      setCertifiedInfo({ name: seed.certifiedByName, at: seed.certifiedAtLabel });
    }
  }

  async function pickStudent(id: number) {
    if (id === selectedId || switching) return;
    setSwitching(true);
    setFlash(null);
    setConfirmName("");
    setShowPreview(false);
    try {
      const target = students.find((s) => s.studentId === id);
      if (target?.cardId) {
        const res = await fetch(`/api/portal/report-cards/${target.cardId}`, {
          headers: portalRoleHeaders("teacher"),
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; card?: ReportCardView }
          | null;
        if (res.ok && json?.ok && json.card) {
          const view = json.card;
          setLastView(view);
          const seed = seedFromView(view);
          setCardId(seed.cardId);
          setStatus(seed.status);
          setRows(seed.rows);
          setTerms(seed.terms);
          setSignatures(view.signatures);
          setYear(view.year);
          setPrincipalNote("");
          setReturnedAtLabel("");
          setSubmittedAtLabel("");
          setCertifiedInfo({ name: seed.certifiedByName, at: seed.certifiedAtLabel });
        } else {
          setFlash({ ok: false, text: "Could not load that student's sheet." });
        }
      } else {
        /* No sheet yet — start from the class's blank template. */
        setLastView(null);
        setCardId(null);
        setStatus("draft");
        setRows(blankTemplate(classSubjects));
        setTerms(blankTerms());
        setYear(classInfo.academicYear);
        setPrincipalNote("");
        setReturnedAtLabel("");
        setSubmittedAtLabel("");
        setCertifiedInfo({ name: "", at: "" });
      }
      setSelectedId(id);
      setStudentMeta({
        studentId: id,
        fullName: target?.fullName ?? "",
        admissionNo: target?.admissionNo ?? "",
      });
    } finally {
      setSwitching(false);
    }
  }

  function setRow(index: number, patch: Partial<EditorRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => [...prev, { subject: "", m1: "", m2: "", m3: "" }]);
  }

  function setTerm(index: number, patch: Partial<EditorTerm>) {
    setTerms((prev) => prev.map((term, i) => (i === index ? { ...term, ...patch } : term)));
  }

  async function save(submit: boolean) {
    if (busy) return;
    if (status !== "draft") {
      setFlash({ ok: false, text: "This sheet is locked — recall it (or ask the Principal to return it) before editing." });
      return;
    }
    const problem = validate();
    if (problem) {
      setFlash({ ok: false, text: problem });
      return;
    }
    if (submit) {
      const ok = window.confirm(
        `Submit ${studentMeta.fullName}'s ${year} report card to the Principal?\nThe sheet will lock until it is certified or returned.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch("/api/portal/report-cards", {
        method: "POST",
        headers: { "content-type": "application/json", ...portalRoleHeaders("teacher") },
        body: JSON.stringify({
          classId: classInfo.id,
          studentId: selectedId,
          rows: rows.map((r) => ({
            subject: r.subject,
            m1: markOrNull(r.m1) === "invalid" ? null : markOrNull(r.m1),
            m2: markOrNull(r.m2) === "invalid" ? null : markOrNull(r.m2),
            m3: markOrNull(r.m3) === "invalid" ? null : markOrNull(r.m3),
          })),
          terms: terms.map((t, i) => ({ term: i + 1, ...t })),
          submit,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; cardId?: number; status?: string; error?: string }
        | null;
      if (res.ok && json?.ok && json.cardId) {
        setStatus(json.status === "submitted" ? "submitted" : "draft");
        if (submit) setSubmittedAtLabel("just now");
        setFlash({
          ok: true,
          text: submit
            ? "Sent to the Principal — it will reach the student and parents once certified."
            : "Draft saved — only you can see it.",
        });
        await Promise.all([refetchRoster(), refetchSheet(json.cardId)]);
      } else {
        const errorText =
          json?.error === "not_class_teacher"
            ? "Only the class teacher of this class can edit its report cards."
            : json?.error === "not_enrolled"
              ? "That student is not actively enrolled in this class."
              : json?.error === "locked"
                ? "This sheet is locked — recall it (or ask the Principal to return it) first."
                : "The sheet could not be saved — check the marks and try again.";
        setFlash({ ok: false, text: errorText });
      }
    } catch {
      setFlash({ ok: false, text: "Network problem — the sheet was not saved." });
    } finally {
      setBusy(false);
    }
  }

  /* v2.8.63.0 — hand an already-saved DRAFT to the Principal. */
  async function submitSaved() {
    if (busy || !cardId || status !== "draft") return;
    const problem = validate();
    if (problem) {
      setFlash({ ok: false, text: problem });
      return;
    }
    const ok = window.confirm(
      `Submit ${studentMeta.fullName}'s ${year} report card to the Principal?\nUnsaved changes are checked first; the sheet will lock until it is certified or returned.`,
    );
    if (!ok) return;
    setBusy(true);
    setFlash(null);
    try {
      /* Push any unsaved edits first, then the state transition. */
      const saved = await fetch("/api/portal/report-cards", {
        method: "POST",
        headers: { "content-type": "application/json", ...portalRoleHeaders("teacher") },
        body: JSON.stringify({
          classId: classInfo.id,
          studentId: selectedId,
          rows: rows.map((r) => ({
            subject: r.subject,
            m1: markOrNull(r.m1) === "invalid" ? null : markOrNull(r.m1),
            m2: markOrNull(r.m2) === "invalid" ? null : markOrNull(r.m2),
            m3: markOrNull(r.m3) === "invalid" ? null : markOrNull(r.m3),
          })),
          terms: terms.map((t, i) => ({ term: i + 1, ...t })),
          submit: true,
        }),
      });
      const savedJson = (await saved.json().catch(() => null)) as
        | { ok?: boolean; cardId?: number; error?: string }
        | null;
      if (!saved.ok || !savedJson?.ok || !savedJson.cardId) {
        setFlash({
          ok: false,
          text: savedJson?.error === "locked"
            ? "This sheet is locked — recall it first."
            : "The sheet could not be saved — check the marks and try again.",
        });
        return;
      }
      setStatus("submitted");
      setSubmittedAtLabel("just now");
      setFlash({ ok: true, text: "Sent to the Principal — it will reach the student and parents once certified." });
      await Promise.all([refetchRoster(), refetchSheet(savedJson.cardId)]);
    } catch {
      setFlash({ ok: false, text: "Network problem — nothing was sent." });
    } finally {
      setBusy(false);
    }
  }

  /* v2.8.63.0 — pull a SUBMITTED sheet back to draft. */
  async function recall() {
    if (busy || !cardId || status !== "submitted") return;
    const ok = window.confirm(
      "Recall this sheet from the Principal's queue?\nIt returns to your drafts so you can keep editing.",
    );
    if (!ok) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/report-cards/${cardId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...portalRoleHeaders("teacher") },
        body: JSON.stringify({ action: "recall" }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; status?: string; error?: string }
        | null;
      if (res.ok && json?.ok) {
        setStatus("draft");
        setSubmittedAtLabel("");
        setFlash({ ok: true, text: "Sheet recalled — it is your draft again." });
        await Promise.all([refetchRoster(), refetchSheet(cardId)]);
      } else {
        setFlash({
          ok: false,
          text: json?.error === "wrong_state"
            ? "The Principal has already acted on this sheet — reload and check its state."
            : "Could not recall the sheet.",
        });
      }
    } catch {
      setFlash({ ok: false, text: "Network problem — nothing changed." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !cardId || !deleteArmed) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/report-cards/${cardId}`, {
        method: "DELETE",
        headers: portalRoleHeaders("teacher"),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setFlash({ ok: true, text: `${studentMeta.fullName}'s sheet was deleted.` });
        setCardId(null);
        setStatus("draft");
        setRows(blankTemplate(classSubjects));
        setTerms(blankTerms());
        setLastView(null);
        setShowPreview(false);
        setConfirmName("");
        setPrincipalNote("");
        setReturnedAtLabel("");
        setSubmittedAtLabel("");
        setCertifiedInfo({ name: "", at: "" });
        await refetchRoster();
      } else {
        setFlash({
          ok: false,
          text: json?.error === "locked"
            ? "This sheet is with the Principal or certified — recall/return it before deleting."
            : "Could not delete the sheet.",
        });
      }
    } catch {
      setFlash({ ok: false, text: "Network problem — nothing was deleted." });
    } finally {
      setBusy(false);
    }
  }

  const statusChip =
    status === "certified"
      ? "bg-[var(--pt-good-bg)] text-[var(--pt-good-text)]"
      : status === "submitted"
        ? "bg-[var(--pt-info-bg, var(--pt-chip))] text-[var(--pt-info-text, var(--pt-chip-text))]"
        : "bg-[var(--pt-warn-bg)] text-[var(--pt-warn-text)]";
  const statusLabel =
    selectedStudent?.cardId == null
      ? "No sheet yet"
      : status === "certified"
        ? "Certified"
        : status === "submitted"
          ? "With the Principal"
          : "Draft";

  return (
    <div className="space-y-5">
      {/* ── Class + student picker ── */}
      <div className="pt-rise rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-muted)]">
              Terminal report · {classInfo.name} · {classInfo.academicYear}
            </p>
            <p className="mt-1 truncate font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              {studentMeta.fullName || "Pick a student"}
            </p>
            <p className="text-[11.5px] text-[var(--pt-muted)]">
              Admission {studentMeta.admissionNo || "—"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[10.5px] font-bold ${
              selectedStudent?.cardId == null
                ? "bg-[var(--pt-chip)] text-[var(--pt-chip-text)]"
                : statusChip
            }`}
          >
            {statusLabel}
          </span>
        </div>

        <div className="mt-4">
          <label htmlFor="rcs-student-picker" className="sr-only">
            Choose a student
          </label>
          <select
            id="rcs-student-picker"
            value={selectedId || ""}
            onChange={(e) => pickStudent(Number(e.target.value))}
            disabled={switching || students.length === 0}
            className="w-full max-w-md rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-2.5 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
          >
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.fullName} ({s.admissionNo})
                {s.cardStatus === "certified"
                  ? " · Certified"
                  : s.cardStatus === "submitted"
                    ? " · With the Principal"
                    : s.cardStatus === "draft"
                      ? " · Draft"
                      : ""}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-[var(--pt-muted)]">
            {students.length} student{students.length === 1 ? "" : "s"} on the roll · sheet year {year}
          </p>
        </div>

        {/* v2.8.63.0 — the Principal's return note: the teacher sees WHY
            the sheet came back, right above the fields. */}
        {status === "draft" && principalNote ? (
          <div className="mt-4 rounded-xl border border-[var(--pt-warn-border, var(--pt-border))] bg-[var(--pt-warn-bg)] p-3.5">
            <p className="text-[12px] font-semibold text-[var(--pt-warn-text)]">
              Returned by the Principal{returnedAtLabel ? ` · ${returnedAtLabel}` : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-[var(--pt-body)]">
              {principalNote}
            </p>
            <p className="mt-1.5 text-[11px] text-[var(--pt-muted)]">
              Fix what the note asks for, then send the sheet back (“Save &amp; submit”).
            </p>
          </div>
        ) : null}
        {status === "submitted" ? (
          <div className="mt-4 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] p-3.5">
            <p className="text-[12px] font-semibold text-[var(--pt-heading)]">
              With the Principal{submittedAtLabel ? ` · sent ${submittedAtLabel}` : ""}
            </p>
            <p className="mt-1 text-[12px] text-[var(--pt-body)]">
              The sheet is locked while the Principal reviews it. Recall it if you
              still need to change something before certification.
            </p>
          </div>
        ) : null}
        {status === "certified" ? (
          <div className="mt-4 rounded-xl border border-[var(--pt-good-border, var(--pt-border))] bg-[var(--pt-good-bg)] p-3.5">
            <p className="text-[12px] font-semibold text-[var(--pt-good-text)]">
              Certified{certifiedInfo.name ? ` by ${certifiedInfo.name}` : ""}
              {certifiedInfo.at ? ` · ${certifiedInfo.at}` : ""}
            </p>
            <p className="mt-1 text-[12px] text-[var(--pt-body)]">
              The student and parents can read it now. If something must change,
              ask the Principal to return the sheet.
            </p>
          </div>
        ) : null}

        <Flash flash={flash} />
      </div>

      {/* ── Marks grid ── */}
      <div className="pt-rise pt-d1 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-[14px] font-semibold text-[var(--pt-heading)]">
            Marks
          </h2>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)]"
          >
            <Plus size={13} aria-hidden="true" />
            Add subject line
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.1em] text-[var(--pt-muted)]">
                <th className="w-8 pb-2 pr-2 font-semibold">#</th>
                <th className="pb-2 pr-2 font-semibold">Subject</th>
                <th className="w-[88px] pb-2 px-2 text-center font-semibold">First Test</th>
                <th className="w-[88px] pb-2 px-2 text-center font-semibold">Mid Year Test</th>
                <th className="w-[88px] pb-2 px-2 text-center font-semibold">Year End Test</th>
                <th className="w-10 pb-2 pl-2">
                  <span className="sr-only">Remove line</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-[12px] text-[var(--pt-muted)]">
                    No subject lines — add the first one.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--pt-divider)]">
                    <td className="py-1.5 pr-2 text-[var(--pt-muted)]">{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <label htmlFor={`rcs-subject-${i}`} className="sr-only">
                        Subject {i + 1}
                      </label>
                      <input
                        id={`rcs-subject-${i}`}
                        value={row.subject}
                        maxLength={120}
                        onChange={(e) => setRow(i, { subject: e.target.value })}
                        placeholder="Subject name"
                        className="w-full min-w-[140px] rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-2.5 py-1.5 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                      />
                    </td>
                    {(["m1", "m2", "m3"] as const).map((key) => (
                      <td key={key} className="py-1.5 px-2">
                        <label htmlFor={`rcs-${key}-${i}`} className="sr-only">
                          {key === "m1" ? "First Test" : key === "m2" ? "Mid Year Test" : "Year End Test"} mark for {row.subject || `line ${i + 1}`}
                        </label>
                        <input
                          id={`rcs-${key}-${i}`}
                          value={row[key]}
                          inputMode="numeric"
                          onChange={(e) =>
                            setRow(
                              i,
                              key === "m1"
                                ? { m1: e.target.value }
                                : key === "m2"
                                  ? { m2: e.target.value }
                                  : { m3: e.target.value },
                            )
                          }
                          placeholder="—"
                          className="w-full rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-2 py-1.5 text-center text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                        />
                      </td>
                    ))}
                    <td className="py-1.5 pl-2">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        aria-label={`Remove ${row.subject || `line ${i + 1}`}`}
                        className="grid h-8 w-8 place-items-center rounded-full text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-danger-bg)] hover:text-[var(--pt-danger-text)]"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Live per-column totals */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:max-w-[420px] sm:ml-auto">
          {preview.map((col, i) => (
            <div key={i} className="rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-2 py-2">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--pt-muted)]">
                {["First Test", "Mid Year", "Year End"][i]}
              </p>
              <p className="mt-0.5 text-[12px] font-bold text-[var(--pt-heading)]">
                Total {col.total ?? "—"}
              </p>
              <p className="text-[11px] text-[var(--pt-accent-text)]">
                Avg {col.average != null ? col.average : "—"}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-[10.5px] text-[var(--pt-muted)]">
          First-in-class average and position are computed from the class&apos;s published sheets when the card is saved.
        </p>
      </div>

      {/* ── Term blocks ── */}
      <div className="pt-rise pt-d2 space-y-4">
        {["First Term", "Second Term", "Third Term"].map((label, i) => (
          <div key={label} className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
            <h2 className="text-center font-display text-[12px] font-bold uppercase tracking-[0.24em] text-[var(--pt-heading)] underline decoration-[var(--pt-accent)] decoration-2 underline-offset-4">
              {label}
            </h2>
            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor={`rcs-studies-${i}`}
                  className="mb-1 block text-[11.5px] font-semibold text-[var(--pt-body)]"
                >
                  Special Remarks — (a) Studies
                </label>
                <textarea
                  id={`rcs-studies-${i}`}
                  value={terms[i]?.studies ?? ""}
                  maxLength={600}
                  rows={2}
                  onChange={(e) => setTerm(i, { studies: e.target.value })}
                  placeholder="e.g. Steady progress; reads widely beyond the text."
                  className="w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-2 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                />
              </div>
              <div>
                <label
                  htmlFor={`rcs-conduct-${i}`}
                  className="mb-1 block text-[11.5px] font-semibold text-[var(--pt-body)]"
                >
                  (b) General Conduct
                </label>
                <textarea
                  id={`rcs-conduct-${i}`}
                  value={terms[i]?.conduct ?? ""}
                  maxLength={600}
                  rows={2}
                  onChange={(e) => setTerm(i, { conduct: e.target.value })}
                  placeholder="e.g. Courteous and well-disciplined."
                  className="w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-2 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="w-40">
                  <label
                    htmlFor={`rcs-attendance-${i}`}
                    className="mb-1 block text-[11.5px] font-semibold text-[var(--pt-body)]"
                  >
                    Attendance
                  </label>
                  <input
                    id={`rcs-attendance-${i}`}
                    value={terms[i]?.attendance ?? ""}
                    maxLength={30}
                    onChange={(e) => setTerm(i, { attendance: e.target.value })}
                    placeholder="e.g. 92% / 145 of 150"
                    className="w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 py-2 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Actions ── */}
      <div className="pt-rise pt-d3 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {status === "draft" ? (
            <>
              <button
                type="button"
                onClick={() => save(false)}
                disabled={busy || switching}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--pt-heading)] transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
                Save draft
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={busy || switching}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-4 py-2.5 text-[12.5px] font-bold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check size={14} aria-hidden="true" />
                Save &amp; submit to Principal
              </button>
              {cardId ? (
                <button
                  type="button"
                  onClick={submitSaved}
                  disabled={busy || switching}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)] disabled:opacity-50"
                >
                  <Send size={14} aria-hidden="true" />
                  Submit as saved
                </button>
              ) : null}
            </>
          ) : null}
          {status === "submitted" && cardId ? (
            <button
              type="button"
              onClick={recall}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)] disabled:opacity-50"
            >
              <RotateCcw size={14} aria-hidden="true" />
              Recall to draft
            </button>
          ) : null}
          {cardId ? (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)]"
            >
              {showPreview ? <Eye size={14} aria-hidden="true" /> : <Printer size={14} aria-hidden="true" />}
              {showPreview ? "Hide the sheet" : "Preview the sheet"}
            </button>
          ) : null}
        </div>

        {cardId && status === "draft" ? (
          <div className="mt-4 rounded-xl border border-[var(--pt-danger-border, var(--pt-border))] bg-[var(--pt-danger-bg)] p-3.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--pt-danger-text)]">
              <TriangleAlert size={13} aria-hidden="true" />
              Danger zone
            </p>
            <p className="mt-1 text-[11.5px] text-[var(--pt-body)]">
              Deleting removes the marks, remarks and attendance permanently. Type
              the student&apos;s full name to confirm.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <label htmlFor="rcs-delete-confirm" className="sr-only">
                Type the student&apos;s full name to confirm deletion
              </label>
              <input
                id="rcs-delete-confirm"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={studentMeta.fullName}
                className="w-56 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-panel)] px-3 py-2 text-[12.5px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-danger-text)]"
              />
              <button
                type="button"
                onClick={remove}
                disabled={busy || !deleteArmed}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-danger-text)] px-4 py-2 text-[12px] font-bold text-[var(--pt-panel)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={13} aria-hidden="true" />
                Delete sheet
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── The official sheet (server truth after the last save) ── */}
      {showPreview && lastView ? (
        <div className="pt-rise rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-6">
          <p className="mb-3 text-[11.5px] text-[var(--pt-muted)]">
            Previewing the sheet exactly as it was last saved · saved {lastView.updatedAtLabel}
          </p>
          <ReportCardSheet card={lastView} />
        </div>
      ) : null}

      <p className="text-[11.5px] text-[var(--pt-muted)]">
        Back to the{" "}
        <Link
          href={`/teacher/report-card?class=${classInfo.id}`}
          className="font-semibold text-[var(--pt-accent-text)] hover:underline"
        >
          class roster
        </Link>{" "}
        · report cards are editable only by the class teacher of {classInfo.name}.
      </p>
    </div>
  );
}
