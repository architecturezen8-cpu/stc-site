"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GraduationCap, Loader2, Plus, Search, Trash2 } from "lucide-react";
import {
  SearchablePicker,
  type PickerGroup,
} from "@/components/portal/searchable-picker";

/* ────────────────────────────────────────────────────────────────────────
   Admin → LMS Setup manager (client). Tabs: Classes · Subjects ·
   Teaching · Enrollment. Mutations go through /api/admin/lms/* and the
   whole payload re-loads after each change.
   ──────────────────────────────────────────────────────────────────────── */

type ClassRow = {
  id: number;
  name: string;
  grade: string;
  section: string | null;
  academicYear: string;
  classTeacherId: number | null;
  classTeacherName: string | null;
  /* v2.8.83.0 — assistant class teacher + the per-class report-card option. */
  assistantClassTeacherId: number | null;
  assistantClassTeacherName: string | null;
  assistantReportCardAccess: boolean;
  students: number;
};
type SubjectRow = { id: number; name: string; code: string | null; usage: number };
type StaffRow = {
  recordId: number;
  teacherId: string;
  fullName: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  lmsTeacherId: number | null;
  hasAccount: boolean;
  /* v2.9.14.0 — class NAMES the teacher already holds a seat for, sorted:
     leads = class-teacher seat(s), assists = assistant seat(s). Marks the
     seat pickers (owner: "mark wela pennana ona, koi class ekatada add
     wela inne ehema kiyala"). */
  leads: string[];
  assists: string[];
};
type StudentRow = {
  recordId: number;
  admissionNo: string;
  fullName: string;
  registerClassName: string;
  personId: number | null;
  hasAccount: boolean;
  enrollmentId: number | null;
  classId: number | null;
  className: string | null;
};
type AssignmentRow = { id: number; classId: number; subjectId: number; teacherId: number | null };

type Bootstrap = {
  classes: ClassRow[];
  subjects: SubjectRow[];
  staff: StaffRow[];
  students: StudentRow[];
  assignments: AssignmentRow[];
};

const GRADES = ["6", "7", "8", "9", "10", "11", "12", "13"];

const inputCls =
  "h-10 rounded-lg border border-stone-300 bg-white px-3 text-[13.5px] text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-500";
const btnPrimary =
  "inline-flex h-10 items-center gap-1.5 rounded-lg bg-stone-900 px-4 text-[13px] font-semibold text-white transition hover:bg-stone-700 disabled:opacity-50";
const btnGhost =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40";
const th = "px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-stone-500";
const td = "px-3 py-2.5 text-[13.5px] text-stone-700";

export function LmsSetupManager() {
  const [tab, setTab] = useState<"classes" | "subjects" | "teaching" | "enrollment">("classes");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");

  /* initial + after-mutation load (mutation bumps reloadKey) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/lms/bootstrap", { cache: "no-store" });
      if (cancelled) return;
      if (res.ok) {
        const payload = (await res.json()) as Bootstrap;
        if (!cancelled) setData(payload);
      } else {
        setNotice({ kind: "error", text: "Could not load LMS data." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(t);
  }, [notice]);

  const mutate = useCallback(
    async (
      url: string,
      init: RequestInit,
      okText: string | ((body: Record<string, unknown>) => string),
    ) => {
      setBusy(true);
      try {
        const res = await fetch(url, {
          headers: { "content-type": "application/json" },
          ...init,
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
          error?: string;
        };
        if (res.ok) {
          setNotice({
            kind: "ok",
            text: typeof okText === "function" ? okText(body) : okText,
          });
          setReloadKey((k) => k + 1);
          return true;
        }
        setNotice({ kind: "error", text: body.error ?? "Request failed." });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  if (!data) {
    return (
      <div className="flex h-56 items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white text-[13.5px] text-stone-500">
        <Loader2 className="animate-spin" size={16} /> Loading LMS master data…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-stone-200 bg-white p-1.5">
        {(
          [
            ["classes", "Classes", data.classes.length],
            ["subjects", "Subjects", data.subjects.length],
            ["teaching", "Teaching", data.assignments.length],
            ["enrollment", "Enrollment", data.students.filter((s) => s.enrollmentId).length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition ${
              tab === key ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 text-[11px] ${
                tab === key ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-[13px] ${
            notice.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Search — filters whichever tab is open (v2.8.39.0) */}
      <div className="relative max-w-md">
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputCls} h-10 w-full rounded-full pl-9`}
          placeholder={`Search ${
            tab === "classes"
              ? "classes"
              : tab === "subjects"
                ? "subjects"
                : tab === "teaching"
                  ? "assignments"
                  : "students"
          }…`}
          aria-label="Search LMS setup"
        />
      </div>

      {tab === "classes" && <ClassesTab data={data} busy={busy} mutate={mutate} query={query} />}
      {tab === "subjects" && <SubjectsTab data={data} busy={busy} mutate={mutate} query={query} />}
      {tab === "teaching" && <TeachingTab data={data} busy={busy} mutate={mutate} query={query} />}
      {tab === "enrollment" && <EnrollmentTab data={data} busy={busy} mutate={mutate} query={query} />}
    </div>
  );
}

type MutateFn = (
  url: string,
  init: RequestInit,
  /* v2.9.13.0 — a string, or a builder over the API response body so the
     Teaching tab can report "N timetable period(s) updated". */
  okText: string | ((body: Record<string, unknown>) => string),
) => Promise<boolean>;

/* ── v2.9.13.0 — picker data builders (shared by both tabs) ─────────────
   NO MORE DROPDOWNS (owner: "lms setup eketh teacherslai, subjectsui
   select karaddi kalin wage popup ekak widiyata enna danawada screen eke
   center wenna"): every teacher/subject select becomes the same
   SearchablePicker the timetable editor uses — teacher + subject (and the
   class-teacher/assistant seats) open as CENTERED modal popups; the class
   selector keeps the anchored popover. The --la-* studio palette already
   aliases the --pt-* tokens (v2.9.12.5), so the popups render in the
   studio look in both themes. */

/* v2.9.14.0 — the staff picker now SHOWS WHO ALREADY HOLDS A SEAT and
   WHERE (owner: "class teachers, assistant class teachers ehema mark wela
   pennana ona, koi class ekatada add wela inne ehema kiyala"):
   · the sub-line carries "T-021 · Class teacher of 10-C · Assistant, 8-A"
     (multi-class seats join with ", "; the portal-account note stays last;
     teachers with no seat keep just the T-number) — so searching a class
     name like "10-C" also finds its teacher;
   · the label stays the plain fullName (no star/emoji marks — the sub
     carries the seat info instead);
   · designation groups sort alphabetically ("DEPUTY PRINCIPAL" … no more
     random order — owner: "okkoma ekagode thiyenne balana userta epa
     wenawa hoyanna"), and within a group teachers who already hold a seat
     ANYWHERE float to the top, name-sorted — the owner spots them without
     reading every row. */
function staffPickerGroups(staff: StaffRow[], noneLabel: string): PickerGroup[] {
  const byDesignation = new Map<string, StaffRow[]>();
  for (const s of staff) {
    if (!s.lmsTeacherId) continue;
    const heading = s.designation?.trim() || "Staff";
    const arr = byDesignation.get(heading) ?? [];
    arr.push(s);
    byDesignation.set(heading, arr);
  }
  const staffSub = (s: StaffRow) => {
    const parts = [s.teacherId];
    if (s.leads.length > 0) parts.push(`Class teacher of ${s.leads.join(", ")}`);
    if (s.assists.length > 0) parts.push(`Assistant, ${s.assists.join(", ")}`);
    if (s.hasAccount) parts.push("portal account");
    return parts.join(" · ");
  };
  const holdsSeat = (s: StaffRow) => (s.leads.length > 0 || s.assists.length > 0 ? 0 : 1);
  const groups: PickerGroup[] = [
    {
      heading: "Quick pick",
      options: [{ value: "", label: noneLabel, sub: "leave the seat empty" }],
    },
  ];
  const headings = [...byDesignation.keys()].sort((a, b) => a.localeCompare(b));
  for (const heading of headings) {
    const rows = (byDesignation.get(heading) ?? []).sort(
      (a, b) => holdsSeat(a) - holdsSeat(b) || a.fullName.localeCompare(b.fullName),
    );
    groups.push({
      heading,
      options: rows.map((s) => ({
        value: String(s.lmsTeacherId),
        label: s.fullName,
        sub: staffSub(s),
      })),
    });
  }
  return groups;
}

function subjectPickerGroups(subjects: SubjectRow[]): PickerGroup[] {
  return [
    {
      heading: "Subjects",
      options: subjects.map((s) => ({
        value: String(s.id),
        label: s.name,
        sub: s.code ?? undefined,
      })),
    },
  ];
}

function classPickerGroups(classes: ClassRow[]): PickerGroup[] {
  /* classes arrive name-sorted from the server — grouping in encounter
     order keeps the headings in the right class order. */
  const gradeNum = (g: string) => {
    const n = parseInt(g, 10);
    return Number.isFinite(n) ? n : 999;
  };
  const byGrade = new Map<string, PickerGroup["options"]>();
  for (const c of classes) {
    const n = gradeNum(c.grade);
    const heading = n === 999 ? "Other" : `Grade ${n}`;
    const arr = byGrade.get(heading) ?? [];
    arr.push({
      value: String(c.id),
      label: c.name,
      sub: c.section ? `Section ${c.section}` : `Year ${c.academicYear}`,
    });
    byGrade.set(heading, arr);
  }
  return [...byGrade.entries()].map(([heading, options]) => ({ heading, options }));
}

/* ── Classes ─────────────────────────────────────────────────────────── */

function ClassesTab({ data, busy, mutate, query }: { data: Bootstrap; busy: boolean; mutate: MutateFn; query: string }) {
  const [grade, setGrade] = useState("6");
  const [section, setSection] = useState("");

  const staffById = useMemo(
    () => new Map(data.staff.filter((s) => s.lmsTeacherId).map((s) => [s.lmsTeacherId, s])),
    [data.staff],
  );
  const staffGroups = useMemo(
    () => staffPickerGroups(data.staff, "— No class teacher —"),
    [data.staff],
  );
  /* v2.9.14.0 — the assistant seat gets its own group set (different "none"
     label); memoized like staffGroups now that the builder sorts. */
  const assistantGroups = useMemo(
    () => staffPickerGroups(data.staff, "— No assistant —"),
    [data.staff],
  );

  const staffDisplay = (lmsTeacherId: number | null) => {
    if (!lmsTeacherId) return null;
    const s = staffById.get(lmsTeacherId);
    return s ? `${s.fullName} (${s.teacherId})` : `#${lmsTeacherId}`;
  };

  const q = query.trim().toLowerCase();
  const classes = q
    ? data.classes.filter((c) =>
        [c.name, c.grade, c.academicYear, c.classTeacherName ?? "", c.assistantClassTeacherName ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : data.classes;

  const add = async () => {
    if (!section.trim()) return;
    const ok = await mutate(
      "/api/admin/lms/classes",
      { method: "POST", body: JSON.stringify({ grade, section }) },
      `Class ${grade}-${section.trim()} created.`,
    );
    if (ok) setSection("");
  };

  const setTeacher = async (classId: number, value: string) => {
    await mutate(
      "/api/admin/lms/classes",
      {
        method: "PATCH",
        body: JSON.stringify({ id: classId, classTeacherId: value === "" ? null : Number(value) }),
      },
      "Class teacher updated.",
    );
  };

  /* v2.8.83.0 — assistant class teacher + the per-class report-card option. */
  const setAssistant = async (classId: number, value: string) => {
    await mutate(
      "/api/admin/lms/classes",
      {
        method: "PATCH",
        body: JSON.stringify({
          id: classId,
          assistantClassTeacherId: value === "" ? null : Number(value),
        }),
      },
      value === "" ? "Assistant removed." : "Assistant class teacher updated.",
    );
  };

  const setAssistantReportAccess = async (classId: number, allow: boolean) => {
    await mutate(
      "/api/admin/lms/classes",
      {
        method: "PATCH",
        body: JSON.stringify({ id: classId, assistantReportCardAccess: allow }),
      },
      allow
        ? "Assistant can now generate report cards."
        : "Report-card generation is back to the class teacher only.",
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-3 text-[13px] font-semibold text-stone-700">Add a class</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inputCls}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
          <input
            value={section}
            onChange={(e) => setSection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Section — A, B, S-1 …"
            className={`${inputCls} w-44`}
          />
          <button onClick={add} disabled={busy || !section.trim()} className={btnPrimary}>
            <Plus size={15} /> Add class
          </button>
          <span className="text-[12.5px] text-stone-500">
            e.g. Grade 6 + A → <b>6-A</b> · Grade 12 + S-1 → <b>12-S-1</b>
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-stone-50">
              <tr>
                <th className={th}>Class</th>
                <th className={th}>Grade</th>
                <th className={th}>Year</th>
                <th className={th}>Class teacher</th>
                <th className={th}>Assistant teacher</th>
                <th className={th}>Students</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id} className="border-t border-stone-100">
                  <td className={`${td} font-semibold text-stone-800`}>
                    <span className="inline-flex items-center gap-2">
                      <GraduationCap size={14} className="text-stone-400" />
                      {c.name}
                    </span>
                  </td>
                  <td className={td}>{c.grade}</td>
                  <td className={td}>{c.academicYear}</td>
                  <td className={td}>
                    {/* v2.9.13.0 — searchable CENTERED picker, no dropdown. */}
                    <div className="w-44 min-w-44">
                      <SearchablePicker
                        ariaLabel={`Class teacher for ${c.name}`}
                        value={c.classTeacherId ? String(c.classTeacherId) : ""}
                        display={staffDisplay(c.classTeacherId) ?? "— No class teacher —"}
                        groups={staffGroups}
                        centered
                        searchPlaceholder="Search name or T-number…"
                        emptyText="No staff match."
                        onChange={(v) => void setTeacher(c.id, v)}
                      />
                    </div>
                  </td>
                  {/* v2.8.83.0 — assistant seat + report-card option. */}
                  <td className={td}>
                    {/* v2.9.13.0 — searchable CENTERED picker, no dropdown. */}
                    <div className="w-44 min-w-44">
                      <SearchablePicker
                        ariaLabel={`Assistant class teacher for ${c.name}`}
                        value={c.assistantClassTeacherId ? String(c.assistantClassTeacherId) : ""}
                        display={staffDisplay(c.assistantClassTeacherId) ?? "— No assistant —"}
                        groups={assistantGroups}
                        centered
                        searchPlaceholder="Search name or T-number…"
                        emptyText="No staff match."
                        onChange={(v) => void setAssistant(c.id, v)}
                      />
                    </div>
                    {c.assistantClassTeacherId ? (
                      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11.5px] text-stone-600">
                        <input
                          type="checkbox"
                          checked={c.assistantReportCardAccess}
                          onChange={(e) => setAssistantReportAccess(c.id, e.target.checked)}
                          className="h-3.5 w-3.5 accent-stone-900"
                        />
                        Can generate report cards
                      </label>
                    ) : null}
                  </td>
                  <td className={td}>{c.students}</td>
                  <td className={td}>
                    <button
                      title={c.students > 0 ? "Remove enrollments first" : "Delete class"}
                      disabled={busy || c.students > 0}
                      onClick={() => mutate(`/api/admin/lms/classes?id=${c.id}`, { method: "DELETE" }, "Class deleted.")}
                      className={btnGhost}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {classes.length === 0 && (
                <tr>
                  <td className={`${td} text-stone-400`} colSpan={7}>
                    {q
                      ? `No classes match “${query.trim()}”.`
                      : "No classes yet — add the first one above."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Subjects ────────────────────────────────────────────────────────── */

function SubjectsTab({ data, busy, mutate, query }: { data: Bootstrap; busy: boolean; mutate: MutateFn; query: string }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const q = query.trim().toLowerCase();
  const subjects = q
    ? data.subjects.filter((s) =>
        [s.name, s.code ?? ""].join(" ").toLowerCase().includes(q),
      )
    : data.subjects;

  const add = async () => {
    if (!name.trim()) return;
    const ok = await mutate(
      "/api/admin/lms/subjects",
      { method: "POST", body: JSON.stringify({ name, code }) },
      `Subject "${name.trim()}" created.`,
    );
    if (ok) {
      setName("");
      setCode("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-3 text-[13px] font-semibold text-stone-700">Add a subject</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Subject name — Mathematics …"
            className={`${inputCls} w-56`}
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Code (optional) — MAT"
            className={`${inputCls} w-32`}
          />
          <button onClick={add} disabled={busy || !name.trim()} className={btnPrimary}>
            <Plus size={15} /> Add subject
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[540px]">
            <thead className="sticky top-0 z-10 bg-stone-50">
              <tr>
                <th className={th}>Subject</th>
                <th className={th}>Code</th>
                <th className={th}>Assigned to</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id} className="border-t border-stone-100">
                  <td className={`${td} font-semibold text-stone-800`}>{s.name}</td>
                  <td className={td}>{s.code ?? "—"}</td>
                  <td className={td}>
                    {s.usage > 0 ? `${s.usage} class assignment(s)` : "—"}
                  </td>
                  <td className={td}>
                    <button
                      title={s.usage > 0 ? "Remove class assignments first" : "Delete subject"}
                      disabled={busy || s.usage > 0}
                      onClick={() => mutate(`/api/admin/lms/subjects?id=${s.id}`, { method: "DELETE" }, "Subject deleted.")}
                      className={btnGhost}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr>
                  <td className={`${td} text-stone-400`} colSpan={4}>
                    {q
                      ? `No subjects match “${query.trim()}”.`
                      : "No subjects yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Teaching assignments ────────────────────────────────────────────── */

function TeachingTab({ data, busy, mutate, query }: { data: Bootstrap; busy: boolean; mutate: MutateFn; query: string }) {
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [filterClassId, setFilterClassId] = useState("");

  const classById = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes]);
  const subjectById = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects]);
  const staffById = useMemo(
    () => new Map(data.staff.filter((s) => s.lmsTeacherId).map((s) => [s.lmsTeacherId, s])),
    [data.staff],
  );

  const q = query.trim().toLowerCase();
  const rows = data.assignments
    .filter((a) => (filterClassId ? a.classId === Number(filterClassId) : true))
    .filter((a) => {
      if (!q) return true;
      const teacher = a.teacherId ? staffById.get(a.teacherId) : undefined;
      return [
        classById.get(a.classId)?.name ?? "",
        subjectById.get(a.subjectId)?.name ?? "",
        teacher ? `${teacher.fullName} ${teacher.teacherId}` : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const ca = classById.get(a.classId)?.name ?? "";
      const cb = classById.get(b.classId)?.name ?? "";
      return ca.localeCompare(cb, undefined, { numeric: true });
    });

  const add = async () => {
    if (!classId || !subjectId) return;
    const ok = await mutate(
      "/api/admin/lms/assignments",
      {
        method: "POST",
        body: JSON.stringify({
          classId: Number(classId),
          subjectId: Number(subjectId),
          teacherId: teacherId ? Number(teacherId) : null,
        }),
      },
      /* v2.9.13.0 — the API auto-syncs every timetabled period of this
         class+subject to the teacher; the notice says how many moved. */
      (body) => {
        const n = typeof body.syncedPeriods === "number" ? body.syncedPeriods : 0;
        return n > 0
          ? `Teaching assignment saved — ${n} timetable period${n === 1 ? "" : "s"} updated on the class grid and the teacher's personal week.`
          : "Teaching assignment saved. Timetable periods you build for this subject will default to this teacher.";
      },
    );
    if (ok) setTeacherId("");
  };

  const classGroups = useMemo(() => classPickerGroups(data.classes), [data.classes]);
  const subjectGroups = useMemo(() => subjectPickerGroups(data.subjects), [data.subjects]);
  const teacherGroups = useMemo(
    () => staffPickerGroups(data.staff, "No teacher"),
    [data.staff],
  );
  const filterGroups = useMemo(
    () => [
      {
        heading: "Quick pick",
        options: [{ value: "", label: "All classes", sub: "show every assignment" }],
      },
      ...classPickerGroups(data.classes),
    ],
    [data.classes],
  );
  const classDisplay = (id: string, fallback: string) => {
    if (!id) return fallback;
    return classById.get(Number(id))?.name ?? `#${id}`;
  };
  const staffLabel = (lmsTeacherId: number | null) => {
    if (!lmsTeacherId) return null;
    const s = staffById.get(lmsTeacherId);
    return s ? `${s.fullName} (${s.teacherId})` : `#${lmsTeacherId}`;
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-3 text-[13px] font-semibold text-stone-700">
          Assign a subject (and teacher) to a class
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* v2.9.13.0 — class = anchored popover; subject + teacher =
              CENTERED modal popups (owner request, no dropdowns). */}
          <div className="w-44 min-w-44">
            <SearchablePicker
              ariaLabel="Class"
              value={classId}
              display={classDisplay(classId, "Class…")}
              groups={classGroups}
              searchPlaceholder="Search class — e.g. 6-A"
              emptyText="No class matches."
              onChange={setClassId}
            />
          </div>
          <div className="w-52 min-w-52">
            <SearchablePicker
              ariaLabel="Subject"
              value={subjectId}
              display={subjectId ? (subjectById.get(Number(subjectId))?.name ?? `#${subjectId}`) : "Subject…"}
              groups={subjectGroups}
              centered
              searchPlaceholder="Search subject or code…"
              emptyText="No subject matches."
              onChange={setSubjectId}
            />
          </div>
          <div className="w-60 min-w-60">
            <SearchablePicker
              ariaLabel="Teacher"
              value={teacherId}
              display={teacherId ? (staffLabel(Number(teacherId)) ?? `#${teacherId}`) : "Teacher (optional)…"}
              groups={teacherGroups}
              centered
              searchPlaceholder="Search name, T-number or post…"
              emptyText="No teacher matches."
              onChange={setTeacherId}
            />
          </div>
          <button onClick={add} disabled={busy || !classId || !subjectId} className={btnPrimary}>
            <Plus size={15} /> Assign
          </button>
          <span className="text-[12.5px] text-stone-500">
            Same class+subject again = re-assign the teacher.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* v2.9.13.0 — the filter is a picker too (popover, quick "All"). */}
        <div className="w-48">
          <SearchablePicker
            ariaLabel="Filter assignments by class"
            value={filterClassId}
            display={classDisplay(filterClassId, "All classes")}
            groups={filterGroups}
            searchPlaceholder="Search class — e.g. 6-A"
            emptyText="No class matches."
            onChange={setFilterClassId}
          />
        </div>
        <span className="text-[12.5px] text-stone-500">{rows.length} assignment(s)</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full min-w-[560px]">
            <thead className="sticky top-0 z-10 bg-stone-50">
              <tr>
                <th className={th}>Class</th>
                <th className={th}>Subject</th>
                <th className={th}>Teacher</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-stone-100">
                  <td className={`${td} font-semibold text-stone-800`}>
                    {classById.get(a.classId)?.name ?? `#${a.classId}`}
                  </td>
                  <td className={td}>{subjectById.get(a.subjectId)?.name ?? `#${a.subjectId}`}</td>
                  <td className={td}>
                    {a.teacherId
                      ? staffById.get(a.teacherId)
                        ? `${staffById.get(a.teacherId)!.fullName} (${staffById.get(a.teacherId)!.teacherId})`
                        : `#${a.teacherId}`
                      : "—"}
                  </td>
                  <td className={td}>
                    <button
                      disabled={busy}
                      onClick={() => mutate(`/api/admin/lms/assignments?id=${a.id}`, { method: "DELETE" }, "Assignment removed.")}
                      className={btnGhost}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className={`${td} text-stone-400`} colSpan={4}>
                    No teaching assignments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Enrollment ──────────────────────────────────────────────────────── */

function EnrollmentTab({ data, busy, mutate, query }: { data: Bootstrap; busy: boolean; mutate: MutateFn; query: string }) {
  const [classId, setClassId] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");

  const classById = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes]);
  const q = query.trim().toLowerCase();
  const matchesQuery = (s: StudentRow) =>
    !q ||
    [s.fullName, s.admissionNo, s.className ?? "", s.registerClassName]
      .join(" ")
      .toLowerCase()
      .includes(q);
  const enrolled = data.students
    .filter((s) => s.enrollmentId && (filterOrAll(classId, s)) && matchesQuery(s))
    .sort(sortByName);
  const pending = data.students
    .filter((s) => !s.enrollmentId && matchesQuery(s))
    .sort(sortByName);

  const enroll = async (admission: string, targetClassId: number) => {
    const ok = await mutate(
      "/api/admin/lms/enrollments",
      { method: "POST", body: JSON.stringify({ classId: targetClassId, admissionNo: admission }) },
      `${admission} enrolled.`,
    );
    if (ok) setAdmissionNo("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-3 text-[13px] font-semibold text-stone-700">Enroll by admission number</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputCls}>
            <option value="">Class…</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.students})
              </option>
            ))}
          </select>
          <input
            value={admissionNo}
            onChange={(e) => setAdmissionNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && classId && admissionNo.trim()) void enroll(admissionNo.trim(), Number(classId));
            }}
            placeholder="Admission No — 1923"
            className={`${inputCls} w-40`}
          />
          <button
            onClick={() => classId && admissionNo.trim() && enroll(admissionNo.trim(), Number(classId))}
            disabled={busy || !classId || !admissionNo.trim()}
            className={btnPrimary}
          >
            <Plus size={15} /> Enroll
          </button>
          <span className="text-[12.5px] text-stone-500">
            Student must be on the register (Verification Records). Re-enrolling to another class moves them.
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Enrolled in the selected class (or all) */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-3 text-[13px] font-semibold text-stone-700">
            {classId ? `Enrolled in ${classById.get(Number(classId))?.name ?? ""}` : "Enrolled (all classes)"} —{" "}
            {enrolled.length}
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[460px]">
              <thead className="sticky top-0 z-10 bg-stone-50">
                <tr>
                  <th className={th}>Student</th>
                  <th className={th}>Class</th>
                  <th className={th}>Account</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {enrolled.map((s) => (
                  <tr key={s.recordId} className="border-t border-stone-100">
                    <td className={td}>
                      <span className="font-semibold text-stone-800">{s.fullName}</span>
                      <span className="block text-[12px] text-stone-400">{s.admissionNo}</span>
                    </td>
                    <td className={td}>{s.className ?? "—"}</td>
                    <td className={td}>
                      {s.hasAccount ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">
                          linked
                        </span>
                      ) : (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11.5px] text-stone-500">
                          not registered
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <button
                        disabled={busy}
                        title="Remove enrollment"
                        onClick={() => mutate(`/api/admin/lms/enrollments?id=${s.enrollmentId}`, { method: "DELETE" }, "Enrollment removed.")}
                        className={btnGhost}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {enrolled.length === 0 && (
                  <tr>
                    <td className={`${td} text-stone-400`} colSpan={4}>
                      {classId ? "No students enrolled in this class yet." : "No enrollments yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Register students without a class */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-3 text-[13px] font-semibold text-stone-700">
            On the register, not yet in a class — {pending.length}
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[460px]">
              <thead className="sticky top-0 z-10 bg-stone-50">
                <tr>
                  <th className={th}>Student</th>
                  <th className={th}>Register class</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((s) => (
                  <tr key={s.recordId} className="border-t border-stone-100">
                    <td className={td}>
                      <span className="font-semibold text-stone-800">{s.fullName}</span>
                      <span className="block text-[12px] text-stone-400">{s.admissionNo}</span>
                    </td>
                    <td className={td}>{s.registerClassName}</td>
                    <td className={td}>
                      <select
                        value=""
                        onChange={(e) => e.target.value && enroll(s.admissionNo, Number(e.target.value))}
                        disabled={busy}
                        className={`${inputCls} h-8 py-0 text-[12.5px]`}
                      >
                        <option value="">Enroll into…</option>
                        {data.classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td className={`${td} text-stone-400`} colSpan={3}>
                      Every register student has a class 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function filterOrAll(classId: string, s: StudentRow): boolean {
  return classId ? s.classId === Number(classId) : true;
}
function sortByName(a: StudentRow, b: StudentRow): number {
  return a.fullName.localeCompare(b.fullName);
}
