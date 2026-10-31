"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { storageBarGradient, storageBarInnerWidth } from "@/lib/storage-bar";
import {
  AlertTriangle,
  BookOpen,
  Database,
  FileText,
  FolderOpen,
  GraduationCap,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  FILE_KIND_OPTIONS,
  fileKindMatches,
  type FileKind,
} from "@/lib/file-type-filter";

/* ────────────────────────────────────────────────────────────────────────
   LMS Admin Studio → Storage & Quotas (v2.8.67.3, D.3).

   One fetch to GET /api/admin/storage feeds four tabs:
     Students  — per-student usage vs their cap (500 MB default / custom)
     Teachers  — assignment + material + notice + chat bytes per teacher
     Parents   — informational (parents upload nothing yet; caps settable
                 ahead of the day they do)
     Cleanup   — the 3-month marks, purged ONLY by a confirmed click

   Per person: [Files] opens an inline drawer (GET /api/admin/storage/person)
   with every live + trashed file grouped by source, each purge two-step;
   [Set cap] opens a small MB dialog (POST /api/admin/storage/cap).
   Everything reads the studio's --la-* token set, so it follows the theme.
   ──────────────────────────────────────────────────────────────────── */

const input =
  "h-11 w-full rounded-xl border border-[var(--la-input-border)] bg-[var(--la-input-bg)] px-3.5 text-[13.5px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444]";
const btnGold =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-4 text-[12.5px] font-semibold text-[#141400] shadow-[0_10px_22px_-12px_rgba(255,212,68,0.8)] transition-colors hover:bg-[#e8c13a] disabled:opacity-50";
const btnGhost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--la-border)] px-4 text-[12.5px] font-medium text-[var(--la-body)] transition-colors hover:border-[var(--la-border-strong)] hover:text-[var(--la-heading)] disabled:opacity-50";
const btnMini =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[var(--la-border)] px-3 text-[11.5px] font-medium text-[var(--la-body)] transition-colors hover:border-[#ffd444] hover:text-[var(--la-heading)] disabled:opacity-50";
const btnPurge =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[var(--la-danger-text)]/40 px-3 text-[11.5px] font-semibold text-[var(--la-danger-text)] transition-colors hover:bg-[var(--la-danger-bg)] disabled:opacity-50";
const searchInput =
  "h-10 w-full rounded-full border border-[var(--la-input-border)] bg-[var(--la-input-bg)] pl-9 pr-3.5 text-[13px] text-[var(--la-heading)] outline-none transition-colors placeholder:text-[var(--la-placeholder)] focus:border-[#ffd444] sm:w-64";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type Overview = {
  prefixes: { label: string; hint: string; bytes: number; files: number }[];
  studentBytes: number;
  studentQuotaBytes: number;
};

type StudentRow = {
  studentId: number;
  admissionNo: string;
  fullName: string;
  className: string | null;
  submissionBytes: number;
  chatBytes: number;
  totalBytes: number;
  quotaPct: number;
  capBytes: number;
  capCustom: boolean;
  capPct: number;
};

type TeacherRow = {
  teacherId: number;
  accountId: number | null;
  fullName: string;
  assignmentBytes: number;
  materialBytes: number;
  noticeBytes: number;
  chatBytes: number;
  totalBytes: number;
  capBytes: number | null;
  capPct: number;
};

type ParentRow = {
  parentId: number;
  accountId: number;
  fullName: string;
  totalBytes: number;
  capBytes: number | null;
  capPct: number;
};

type Candidate = {
  kind: "submission" | "chat";
  id: number;
  admissionNo: string;
  fullName: string;
  className: string | null;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type PersonFile = {
  kind: "submission" | "assignment" | "material" | "notice" | "chat";
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  trashed: boolean;
  context?: string | null;
};

type PersonPayload = {
  ok: boolean;
  error?: string;
  role: "student" | "teacher" | "parent";
  person: { fullName: string; label: string };
  used: number;
  capBytes: number | null;
  files: Record<string, PersonFile[]>;
};

type Payload = {
  ok: boolean;
  error?: string;
  overview: Overview;
  students: StudentRow[];
  teachers: TeacherRow[];
  parents: ParentRow[];
  cleanup: { days: number; candidates: Candidate[]; totalCount: number; totalBytes: number };
};

type Tab = "students" | "teachers" | "parents" | "cleanup";

type DrawerTarget = { role: "student" | "teacher" | "parent"; id: number; fullName: string };

type CapTarget = {
  role: "student" | "teacher" | "parent";
  id: number;
  fullName: string;
  current: number | null;
  isDefault: boolean;
};

const PREFIX_ICONS = [Paperclip, FolderOpen, MessageSquare, ImageIcon, ImageIcon, Database];

const FILE_KIND_LABEL: Record<string, string> = {
  submission: "Submission files",
  chat: "Chat attachments",
  assignment: "Assignment attachments",
  material: "Material files",
  notice: "Notice attachments",
};

/* v2.8.83.0 — gradient bar (shared src/lib/storage-bar.ts): blends toward
   amber near 60% and red near 90% instead of snapping between flat colors. */
function UsageBar({ pct }: { pct: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--la-divider)]">
      <div
        className="h-full overflow-hidden rounded-full transition-all"
        style={{ width: `${Math.max(1.5, Math.min(100, pct))}%` }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: storageBarInnerWidth(pct),
            background: storageBarGradient("admin"),
          }}
        />
      </div>
    </div>
  );
}

function CapPill({ row }: { row: { capBytes: number | null; custom: boolean } }) {
  if (row.capBytes == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--la-chip)] px-2.5 py-1 text-[10.5px] font-medium text-[var(--la-chip-text)]">
        <ShieldCheck size={11} /> No cap · unlimited
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-medium ${
        row.custom
          ? "bg-[var(--la-accent-soft)] text-[var(--la-accent-text)]"
          : "bg-[var(--la-chip)] text-[var(--la-chip-text)]"
      }`}
    >
      <ShieldCheck size={11} />
      {row.custom ? `Custom cap · ${formatBytes(row.capBytes)}` : "500 MB default"}
    </span>
  );
}

export function StoragePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("students");
  const [query, setQuery] = useState("");

  /* per-person Files drawer */
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [person, setPerson] = useState<PersonPayload | null>(null);
  const [personLoading, setPersonLoading] = useState(false);

  /* cap dialog */
  const [capTarget, setCapTarget] = useState<CapTarget | null>(null);
  const [capMb, setCapMb] = useState("");
  const [capBusy, setCapBusy] = useState(false);

  /* two-step purge */
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [purgingKey, setPurgingKey] = useState<string | null>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/storage", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Payload | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load storage data.");
      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load storage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const loadPerson = useCallback(async (target: DrawerTarget) => {
    setPersonLoading(true);
    setPerson(null);
    try {
      const res = await fetch(
        `/api/admin/storage/person?role=${target.role}&personId=${target.id}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as PersonPayload | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not load the files.");
      setPerson(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the files.");
      setDrawer(null);
    } finally {
      setPersonLoading(false);
    }
  }, []);

  async function purge(kind: string, id: number, after?: () => void) {
    const key = `${kind}-${id}`;
    setPurgingKey(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/storage/purge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            reclaimed?: number;
            needsConsent?: boolean;
            status?: string;
          }
        | null;
      if (json?.needsConsent) {
        /* v2.8.70.3 — the owner's rule: the first click SENDS the approval
           request to the file's owner; the delete unlocks once they accept
           it in their portal. Shown as a notice, not an error. */
        flash(json.error || "Approval request sent to the owner.");
        await load();
        after?.();
        return;
      }
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not purge the file.");
      flash(`Purged — ${formatBytes(json.reclaimed ?? 0)} reclaimed.`);
      await load();
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not purge the file.");
    } finally {
      setPurgingKey(null);
      setConfirmKey(null);
    }
  }

  function openCap(
    role: CapTarget["role"],
    id: number,
    fullName: string,
    capBytes: number | null,
    isDefault: boolean,
  ) {
    setCapTarget({ role, id, fullName, current: capBytes, isDefault });
    setCapMb(capBytes != null ? String(Math.round(capBytes / (1024 * 1024))) : "");
  }

  async function saveCap(quotaBytes: number | null) {
    if (!capTarget || capBusy) return;
    setCapBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/storage/cap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: capTarget.role, personId: capTarget.id, quotaBytes }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Could not save the cap.");
      flash(
        quotaBytes == null
          ? `Cap removed — ${capTarget.fullName} is back on the default.`
          : `Cap saved — ${capTarget.fullName} now has ${formatBytes(quotaBytes)}.`,
      );
      setCapTarget(null);
      await load();
      if (drawer) await loadPerson(drawer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the cap.");
    } finally {
      setCapBusy(false);
    }
  }

  const students = useMemo(() => data?.students ?? [], [data]);
  const teachers = useMemo(() => data?.teachers ?? [], [data]);
  const parents = useMemo(() => data?.parents ?? [], [data]);
  const candidates = useMemo(() => data?.cleanup.candidates ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const match = (name: string, label: string, extra?: string | null) =>
      name.toLowerCase().includes(q) ||
      label.toLowerCase().includes(q) ||
      (extra ?? "").toLowerCase().includes(q);
    return {
      students: students.filter((s) => match(s.fullName, s.admissionNo, s.className)),
      teachers: teachers.filter((t) => match(t.fullName, "", null)),
      parents: parents.filter((p) => match(p.fullName, "", null)),
      candidates: candidates.filter((c) =>
        match(c.fullName, c.admissionNo, `${c.fileName} ${c.className ?? ""}`),
      ),
    };
  }, [query, students, teachers, parents, candidates]);

  const studentRows = filtered ? filtered.students : students;
  const teacherRows = filtered ? filtered.teachers : teachers;
  const parentRows = filtered ? filtered.parents : parents;
  const cleanupRows = filtered ? filtered.candidates : candidates;

  if (loading && !data) {
    return (
      <div className="flex min-h-48 items-center justify-center text-[var(--la-muted)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading storage data…
      </div>
    );
  }

  const groups: { key: string; items: PersonFile[] }[] = person
    ? Object.entries(person.files)
        .filter(([, items]) => items.length > 0)
        .map(([key, items]) => ({ key, items }))
    : [];

  return (
    <div className="space-y-5">
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--la-danger-bg)] bg-[var(--la-danger-bg)] px-4 py-3 text-[13px] text-[var(--la-danger-text)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-[var(--la-good-bg)] bg-[var(--la-good-bg)] px-4 py-3 text-[13px] text-[var(--la-good-text)]">
          {notice}
        </div>
      ) : null}

      {/* 1 — bucket overview */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(data?.overview.prefixes ?? []).map((p, i) => {
          const Icon = PREFIX_ICONS[i] ?? HardDrive;
          return (
            <div
              key={p.label}
              className="la-panel-shadow rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)] p-4"
            >
              <Icon size={16} className="text-[#ffd444]" />
              <p className="mt-2 font-display text-lg font-semibold text-[var(--la-heading)]">
                {formatBytes(p.bytes)}
              </p>
              <p className="text-xs font-medium text-[var(--la-heading)]">{p.label}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--la-muted)]">
                {p.files > 0 ? `${p.files} files · ` : ""}
                {p.hint}
              </p>
            </div>
          );
        })}
      </section>

      {/* 2 — tabs + search */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["students", "Students", GraduationCap, students.length],
            ["teachers", "Teachers", BookOpen, teachers.length],
            ["parents", "Parents", UsersRound, parents.length],
            ["cleanup", "Cleanup", Trash2, data?.cleanup.totalCount ?? 0],
          ] as const
        ).map(([key, label, Icon, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setQuery("");
              setDrawer(null);
              setPerson(null);
              setConfirmKey(null);
            }}
            className={tab === key ? btnGold : btnGhost}
          >
            <Icon size={14} /> {label} ({count})
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => void load()} className={btnGhost}>
          <RefreshCcw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {tab !== "cleanup" ? (
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
            placeholder={`Search ${tab}…`}
            aria-label={`Search ${tab}`}
          />
        </div>
      ) : null}

      {/* 3 — STUDENTS */}
      {tab === "students" ? (
        <div className="la-panel-shadow overflow-hidden rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)]">
          <div className="la-scrollbar max-h-96 divide-y divide-[var(--la-divider)] overflow-y-auto">
            {studentRows.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[var(--la-muted)]">
                No student files yet — the table fills as students submit work.
              </p>
            ) : (
              studentRows.map((s) => (
                <div key={s.studentId} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-[var(--la-heading)]">
                        {s.fullName}
                        <span className="ml-2 text-[11px] font-normal text-[var(--la-muted)]">
                          {s.admissionNo}
                          {s.className ? ` · ${s.className}` : ""}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--la-body)]">
                        work files {formatBytes(s.submissionBytes)} · chat{" "}
                        {formatBytes(s.chatBytes)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <CapPill row={{ capBytes: s.capBytes, custom: s.capCustom }} />
                      <span className="text-xs text-[var(--la-body)]">
                        <span className={s.capPct >= 90 ? "font-semibold text-[var(--la-danger-text)]" : ""}>
                          {formatBytes(s.totalBytes)}
                        </span>{" "}
                        / {formatBytes(s.capBytes)}
                      </span>
                    </div>
                  </div>
                  <UsageBar pct={s.capPct} />
                  <p className="mt-1 text-[10.5px] text-[var(--la-muted)]">{s.capPct}% of cap</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btnMini}
                      onClick={() => {
                        const target = { role: "student" as const, id: s.studentId, fullName: s.fullName };
                        setDrawer(drawer?.id === target.id ? null : target);
                        if (drawer?.id !== target.id) void loadPerson(target);
                      }}
                    >
                      <FolderOpen size={13} /> Files
                    </button>
                    <button
                      type="button"
                      className={btnMini}
                      onClick={() => openCap("student", s.studentId, s.fullName, s.capBytes, s.capCustom)}
                    >
                      <ShieldCheck size={13} /> Set cap
                    </button>
                  </div>

                  {drawer?.role === "student" && drawer.id === s.studentId ? (
                    <PersonDrawer
                      person={person}
                      loading={personLoading}
                      groups={groups}
                      confirmKey={confirmKey}
                      purgingKey={purgingKey}
                      onConfirm={(key) => setConfirmKey(key)}
                      onCancel={() => setConfirmKey(null)}
                      onPurge={(kind, id) =>
                        void purge(kind, id, () =>
                          drawer ? void loadPerson(drawer) : undefined,
                        )
                      }
                      onClose={() => {
                        setDrawer(null);
                        setPerson(null);
                      }}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* 4 — TEACHERS */}
      {tab === "teachers" ? (
        <div className="la-panel-shadow overflow-hidden rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)]">
          <div className="la-scrollbar max-h-96 divide-y divide-[var(--la-divider)] overflow-y-auto">
            {teacherRows.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[var(--la-muted)]">
                No teacher files yet — attachments on assignments, materials and notices land here.
              </p>
            ) : (
              teacherRows.map((t) => (
                <div key={t.teacherId} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-[var(--la-heading)]">
                        {t.fullName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--la-body)]">
                        assignments {formatBytes(t.assignmentBytes)} · materials{" "}
                        {formatBytes(t.materialBytes)} · notices {formatBytes(t.noticeBytes)} · chat{" "}
                        {formatBytes(t.chatBytes)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <CapPill row={{ capBytes: t.capBytes, custom: t.capBytes != null }} />
                      <span className="text-xs text-[var(--la-body)]">
                        {formatBytes(t.totalBytes)}
                        {t.capBytes != null ? ` / ${formatBytes(t.capBytes)}` : ""}
                      </span>
                    </div>
                  </div>
                  {t.capBytes != null ? <UsageBar pct={t.capPct} /> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={btnMini}
                      onClick={() => {
                        const target = { role: "teacher" as const, id: t.teacherId, fullName: t.fullName };
                        setDrawer(drawer?.id === target.id ? null : target);
                        if (drawer?.id !== target.id) void loadPerson(target);
                      }}
                    >
                      <FolderOpen size={13} /> Files
                    </button>
                    <button
                      type="button"
                      className={btnMini}
                      onClick={() => openCap("teacher", t.teacherId, t.fullName, t.capBytes, t.capBytes != null)}
                    >
                      <ShieldCheck size={13} /> Set cap
                    </button>
                  </div>

                  {drawer?.role === "teacher" && drawer.id === t.teacherId ? (
                    <PersonDrawer
                      person={person}
                      loading={personLoading}
                      groups={groups}
                      confirmKey={confirmKey}
                      purgingKey={purgingKey}
                      onConfirm={(key) => setConfirmKey(key)}
                      onCancel={() => setConfirmKey(null)}
                      onPurge={(kind, id) =>
                        void purge(kind, id, () =>
                          drawer ? void loadPerson(drawer) : undefined,
                        )
                      }
                      onClose={() => {
                        setDrawer(null);
                        setPerson(null);
                      }}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* 5 — PARENTS */}
      {tab === "parents" ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--la-body)]">
            Parents don&apos;t upload files yet — they appear here so caps can be set ahead of
            the day they do. Their usage stays at zero until then.
          </p>
          <div className="la-panel-shadow overflow-hidden rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)]">
            <div className="la-scrollbar max-h-96 divide-y divide-[var(--la-divider)] overflow-y-auto">
              {parentRows.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-[var(--la-muted)]">
                  No parent accounts yet.
                </p>
              ) : (
                parentRows.map((p) => (
                  <div
                    key={p.parentId}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--la-chip)] text-[var(--la-chip-text)]">
                        <UserRound size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-[var(--la-heading)]">
                          {p.fullName}
                        </p>
                        <p className="text-[11px] text-[var(--la-muted)]">
                          no files yet · 0 B used
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CapPill row={{ capBytes: p.capBytes, custom: p.capBytes != null }} />
                      <button
                        type="button"
                        className={btnMini}
                        onClick={() => openCap("parent", p.parentId, p.fullName, p.capBytes, p.capBytes != null)}
                      >
                        <ShieldCheck size={13} /> Set cap
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 6 — CLEANUP marks */}
      {tab === "cleanup" ? (
        <div className="la-panel-shadow overflow-hidden rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--la-divider)] px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-[var(--la-heading)]">
                3-month cleanup marks
              </h2>
              <p className="mt-0.5 text-[11.5px] text-[var(--la-muted)]">
                Student files older than {data?.cleanup.days ?? 90} days — a manual list,{" "}
                <span className="font-semibold text-[var(--la-warn-text)]">
                  nothing is deleted automatically.
                </span>
              </p>
            </div>
            <p className="text-xs text-[var(--la-body)]">
              {data?.cleanup.totalCount ?? 0} marked ·{" "}
              <span className="font-semibold text-[var(--la-heading)]">
                {formatBytes(data?.cleanup.totalBytes ?? 0)}
              </span>{" "}
              reclaimable
            </p>
          </div>
          <div className="la-scrollbar max-h-96 divide-y divide-[var(--la-divider)] overflow-y-auto">
            {cleanupRows.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[var(--la-muted)]">
                Nothing marked yet — files appear here 90 days after upload.
              </p>
            ) : (
              cleanupRows.map((c) => {
                const key = `cleanup-${c.kind}-${c.id}`;
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-[var(--la-heading)]" title={c.fileName}>
                        {c.fileName}
                      </p>
                      <p className="text-[10.5px] text-[var(--la-muted)]">
                        {c.fullName} · {c.admissionNo}
                        {c.className ? ` · ${c.className}` : ""} ·{" "}
                        {c.kind === "submission" ? "submission file" : "chat attachment"} ·{" "}
                        {new Date(c.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="text-xs text-[var(--la-body)]">
                        {formatBytes(c.sizeBytes)}
                      </span>
                      {confirmKey === key ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={purgingKey === key}
                            onClick={() => void purge(c.kind, c.id)}
                            className="inline-flex h-8 items-center rounded-full bg-[var(--la-danger-text)] px-3 text-[11.5px] font-semibold text-white disabled:opacity-60"
                          >
                            {purgingKey === key ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              "Confirm purge"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmKey(null)}
                            className={btnMini}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmKey(key)}
                          className={btnPurge}
                        >
                          <Trash2 size={12} /> Purge
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {/* 7 — cap dialog */}
      {capTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Set storage cap"
          onClick={() => (capBusy ? undefined : setCapTarget(null))}
        >
          <div
            className="la-panel-shadow w-full max-w-sm rounded-3xl border border-[var(--la-border)] bg-[var(--la-panel)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-[15px] font-semibold text-[var(--la-heading)]">
              Storage cap — {capTarget.fullName}
            </h3>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--la-muted)]">
              {capTarget.role === "student"
                ? "Leave empty to fall back to the 500 MB default."
                : capTarget.role === "teacher"
                  ? "Teachers have no cap by default — set one to bound their uploads."
                  : "Parents upload nothing yet — the cap waits for them."}
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--la-body)]">
                Cap in MB
              </span>
              <input
                type="number"
                min={1}
                value={capMb}
                onChange={(e) => setCapMb(e.target.value)}
                className={input}
                placeholder="e.g. 250"
                autoFocus
              />
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={btnGold}
                disabled={capBusy}
                onClick={() => {
                  const raw = Number(capMb);
                  if (!Number.isFinite(raw) || raw <= 0) {
                    setError("Enter a positive size in MB, or remove the cap.");
                    return;
                  }
                  void saveCap(Math.round(raw * 1024 * 1024));
                }}
              >
                {capBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Save cap
              </button>
              {capTarget.current != null ? (
                <button
                  type="button"
                  className={btnGhost}
                  disabled={capBusy}
                  onClick={() => void saveCap(null)}
                >
                  Remove cap (use default)
                </button>
              ) : null}
              <button
                type="button"
                className={btnGhost}
                disabled={capBusy}
                onClick={() => setCapTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── the inline per-person files drawer ────────────────────────────────── */

function PersonDrawer({
  person,
  loading,
  groups,
  confirmKey,
  purgingKey,
  onConfirm,
  onCancel,
  onPurge,
  onClose,
}: {
  person: PersonPayload | null;
  loading: boolean;
  groups: { key: string; items: PersonFile[] }[];
  confirmKey: string | null;
  purgingKey: string | null;
  onConfirm: (key: string) => void;
  onCancel: () => void;
  onPurge: (kind: string, id: number) => void;
  onClose: () => void;
}) {
  /* v2.8.69.0 — owner ask: filter the drawer by file type. The filter lives
     INSIDE the drawer so both desktop and mobile render sites share it. */
  const [kindFilter, setKindFilter] = useState<FileKind>("all");
  const visible = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((f) => fileKindMatches(kindFilter, f.fileName, f.mimeType)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-3 rounded-2xl border border-[var(--la-border)] bg-[var(--la-panel-soft)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-[var(--la-heading)]">
          {person
            ? `${person.person.fullName}${person.person.label ? ` · ${person.person.label}` : ""} — ${formatBytes(person.used)} live · cap ${person.capBytes != null ? formatBytes(person.capBytes) : "none"}`
            : "Files"}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as FileKind)}
            className="h-8 rounded-full border border-[var(--la-border)] bg-[var(--la-input-bg)] px-2.5 text-[11.5px] text-[var(--la-heading)] outline-none focus:border-[#ffd444]"
            aria-label="Filter by file type"
          >
            {FILE_KIND_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={onClose} className={btnMini}>
            Close
          </button>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-6 text-[12.5px] text-[var(--la-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading files…
        </p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-[var(--la-muted)]">
          {kindFilter === "all" ? "No files yet for this person." : "No files of that type."}
        </p>
      ) : (
        <div className="la-scrollbar mt-3 max-h-72 space-y-4 overflow-y-auto">
          {visible.map((g) => (
            <div key={g.key}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--la-body)]">
                <FileText size={11} /> {FILE_KIND_LABEL[g.key] ?? g.key} ({g.items.length})
              </p>
              <ul className="space-y-1.5">
                {g.items.map((f) => {
                  const key = `person-${f.kind}-${f.id}`;
                  return (
                    <li
                      key={key}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--la-border)] bg-[var(--la-panel)] px-3 py-2 ${
                        f.trashed ? "opacity-55" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] text-[var(--la-heading)]" title={f.fileName}>
                          {f.fileName}
                          {f.trashed ? (
                            <span className="ml-2 rounded-full bg-[var(--la-chip)] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--la-chip-text)]">
                              trashed
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-[10.5px] text-[var(--la-muted)]">
                          {f.context ? `${f.context} · ` : ""}
                          {formatBytes(f.sizeBytes)} ·{" "}
                          {new Date(f.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      {confirmKey === key ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={purgingKey === key}
                            onClick={() => onPurge(f.kind, f.id)}
                            className="inline-flex h-7 items-center rounded-full bg-[var(--la-danger-text)] px-2.5 text-[11px] font-semibold text-white disabled:opacity-60"
                          >
                            {purgingKey === key ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              "Confirm purge"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={onCancel}
                            className="h-7 rounded-full border border-[var(--la-border)] px-2.5 text-[11px] text-[var(--la-body)]"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onConfirm(key)}
                          className={btnPurge}
                        >
                          <Trash2 size={12} /> Purge
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
