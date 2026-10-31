"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { storageBarGradient, storageBarInnerWidth } from "@/lib/storage-bar";
import {
  AlertTriangle,
  BookOpen,
  Cloud,
  Database,
  Eye,
  HardDrive,
  HeartHandshake,
  Image,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  FILE_KIND_OPTIONS,
  fileKindMatches,
  type FileKind,
} from "@/lib/file-type-filter";

/**
 * v2.8.67.1 — D.2: the Storage & Quotas panel.
 *
 * v2.8.69.0 — OWNER REBRIEF, main-admin edition:
 *   - a NEW Backblaze B2 bucket tracker card ("kochchara fill welada?")
 *     backed by a real ListObjectsV2 walk (15-minute cache, refresh button);
 *   - role tabs Students / Teachers / Parents — every row READ-ONLY here,
 *     because the LMS Admin Studio owns the editable purges and caps;
 *   - each row can open a read-only FILES drawer (per-person inventory with
 *     the shared file-type filter);
 *   - the 3-month cleanup marks became read-only too — purging happens in
 *     the LMS Admin Studio → Storage → Cleanup.
 */

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
};

type TeacherRow = {
  teacherId: number;
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
  mimeType?: string;
  sizeBytes: number;
  createdAt: string;
};

type BucketUsage = {
  ok: true;
  provider: string;
  bucket: string;
  bytes: number;
  files: number;
  softQuotaBytes: number | null;
  cachedAt: string;
  cached: boolean;
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

type PersonFile = {
  kind: string;
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  trashed?: boolean;
  context?: string | null;
};

type PersonPayload = {
  ok: boolean;
  person: { fullName: string; label?: string | null };
  used: number;
  capBytes: number | null;
  files: Partial<Record<string, PersonFile[]>>;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PREFIX_ICONS = [Paperclip, Paperclip, MessageSquare, Image, Image, Database];
const tabBtn = (active: boolean) =>
  `inline-flex min-h-[38px] items-center gap-2 rounded-full px-4 text-[12.5px] font-semibold transition-colors ${
    active ? "bg-[#ffd444] text-[#0b0b0a]" : "border border-white/10 text-white/60 hover:text-white"
  }`;
const filterSelect =
  "h-9 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-xs text-white outline-none focus:border-[#ffd444]/50";

/* ── the read-only per-person files drawer (shared by all three tabs) ──── */
function PersonFilesDrawer({
  role,
  personId,
  onClose,
}: {
  role: "student" | "teacher" | "parent";
  personId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<PersonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<FileKind>("all");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/admin/storage/person?role=${role}&personId=${personId}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as PersonPayload | null;
        if (!alive) return;
        if (!res.ok || !json?.ok) throw new Error("Could not load this person's files.");
        setData(json);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load files.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [role, personId]);

  const groups = useMemo(() => {
    const all = Object.values(data?.files ?? {}).flat().filter((f): f is PersonFile => f != null);
    const order = ["submission", "assignment", "material", "notice", "chat"];
    const labels: Record<string, string> = {
      submission: "Submission files",
      assignment: "Assignment attachments",
      material: "Material files",
      notice: "Notice attachments",
      chat: "Chat attachments",
    };
    return order
      .map((kind) => ({
        kind,
        label: labels[kind] ?? kind,
        items: all
          .filter((f) => f.kind === kind)
          .filter((f) => fileKindMatches(kindFilter, f.fileName, f.mimeType))
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
      }))
      .filter((g) => g.items.length > 0);
  }, [data, kindFilter]);

  return (
    <div className="mt-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] font-semibold text-white">
          {data
            ? `${data.person.fullName}${data.person.label ? ` · ${data.person.label}` : ""} — ${formatBytes(data.used)} live · cap ${data.capBytes != null ? formatBytes(data.capBytes) : "none"}`
            : "Files"}
          <span className="ml-2 text-[10.5px] font-normal text-white/35">read-only</span>
        </p>
        <div className="flex items-center gap-2">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as FileKind)}
            className={filterSelect}
            aria-label="Filter by file type"
          >
            {FILE_KIND_OPTIONS.map((o) => (
              <option key={o.key} value={o.key} className="bg-[#141412]">
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/12 px-3 text-xs text-white/70 hover:text-white">
            <X size={13} /> Close
          </button>
        </div>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 py-6 text-[12.5px] text-white/50">
          <Loader2 size={14} className="animate-spin" /> Loading files…
        </p>
      ) : error ? (
        <p className="py-6 text-center text-[12.5px] text-rose-300">{error}</p>
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-white/45">
          {kindFilter === "all" ? "No files yet for this person." : "No files of that type."}
        </p>
      ) : (
        <div className="mt-3 max-h-72 space-y-4 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.kind}>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">
                {g.label} ({g.items.length})
              </p>
              <ul className="space-y-1.5">
                {g.items.map((f) => (
                  <li
                    key={`${f.kind}-${f.id}`}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 ${
                      f.trashed ? "opacity-55" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-white" title={f.fileName}>
                        {f.fileName}
                        {f.trashed ? (
                          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white/50">
                            trashed
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[10.5px] text-white/40">
                        {f.context ? `${f.context} · ` : ""}
                        {formatBytes(f.sizeBytes)} ·{" "}
                        {new Date(f.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="text-[10.5px] text-white/30">Read-only</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StoragePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  /* v2.8.69.0 — role tabs + read-only drawer */
  const [tab, setTab] = useState<"students" | "teachers" | "parents">("students");
  const [drawer, setDrawer] = useState<{ role: "student" | "teacher" | "parent"; personId: number } | null>(null);
  /* v2.8.69.0 — the Backblaze bucket tracker */
  const [bucket, setBucket] = useState<BucketUsage | null>(null);
  const [bucketError, setBucketError] = useState<string | null>(null);
  const [bucketLoading, setBucketLoading] = useState(true);
  /* v2.8.69.0 — cleanup marks are read-only here; a type filter helps scan them */
  const [cleanupFilter, setCleanupFilter] = useState<FileKind>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/storage", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as Payload | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Could not load storage data.");
      }
      setData(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load storage data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBucket = useCallback(async (force = false) => {
    setBucketLoading(true);
    setBucketError(null);
    try {
      const res = await fetch(`/api/admin/storage/bucket${force ? "?force=1" : ""}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as BucketUsage | { ok: false; error: string } | null;
      if (!json) throw new Error("Could not read the bucket usage.");
      if (!json.ok) throw new Error(json.error);
      setBucket(json);
    } catch (cause) {
      setBucket(null);
      setBucketError(cause instanceof Error ? cause.message : "Could not read the bucket usage.");
    } finally {
      setBucketLoading(false);
    }
  }, []);

  useEffect(() => {
    /* v2.8.67.1 — setState only from the async continuation (never sync in
       the effect body), per the project's react-hooks lint contract. */
    void Promise.resolve().then(load);
    void Promise.resolve().then(() => loadBucket(false));
  }, [load, loadBucket]);

  const students = useMemo(() => data?.students ?? [], [data]);
  const teachers = useMemo(() => data?.teachers ?? [], [data]);
  const parents = useMemo(() => data?.parents ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base =
      tab === "students"
        ? students
        : tab === "teachers"
          ? teachers
          : parents;
    if (!q) return base;
    return base.filter((row: { fullName: string }) => row.fullName.toLowerCase().includes(q));
  }, [tab, students, teachers, parents, query]);

  if (loading && !data) {
    return (
      <div className="flex min-h-48 items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading storage data…
      </div>
    );
  }

  const cleanup = data?.cleanup;
  const bucketPct =
    bucket?.ok && bucket.softQuotaBytes
      ? Math.min(100, Math.round((bucket.bytes / bucket.softQuotaBytes) * 100))
      : 0;
  const cleanupFiltered = (cleanup?.candidates ?? []).filter((c) =>
    fileKindMatches(cleanupFilter, c.fileName, c.mimeType),
  );

  return (
    <div className="space-y-6">
      {error ? (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : null}

      {/* 0 — Backblaze B2 bucket tracker (v2.8.69.0) */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ffd444]/15 text-[#ffd444]">
              <Cloud size={20} />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Backblaze B2 bucket
                {bucket ? (
                  <span className="ml-2 text-[11px] font-normal text-white/35">
                    {bucket.bucket} · {bucket.provider.toUpperCase()}
                    {bucket.cached ? " · cached" : ""}
                  </span>
                ) : null}
              </h2>
              <p className="text-xs text-white/50">
                Every image, variant and portal file stored for the website — the truthful number,
                straight from the bucket.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadBucket(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-medium text-white/80 transition-colors hover:border-[#ffd444]/40"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${bucketLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {bucketLoading && !bucket ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Walking the bucket…
          </p>
        ) : bucketError ? (
          <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/90">
            {bucketError}
          </p>
        ) : bucket ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-2xl font-semibold text-white">
                {formatBytes(bucket.bytes)}
                {bucket.softQuotaBytes ? (
                  <span className="text-[13px] font-normal text-white/45">
                    {" "}· {bucketPct}% of the {formatBytes(bucket.softQuotaBytes)} reference line
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-white/55">
                {bucket.files.toLocaleString()} object{bucket.files === 1 ? "" : "s"}
              </p>
            </div>
            {bucket.softQuotaBytes ? (
              /* v2.8.83.0 — gradient fill (shared src/lib/storage-bar.ts). */
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full overflow-hidden rounded-full transition-all"
                  style={{ width: `${Math.max(1.5, bucketPct)}%` }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      width: storageBarInnerWidth(bucketPct),
                      background: storageBarGradient("admin"),
                    }}
                  />
                </div>
              </div>
            ) : null}
            <p className="mt-2 text-[10.5px] text-white/35">
              Reference line = B2&apos;s 10 GB free tier (set MEDIA_BUCKET_SOFT_QUOTA_GB to change
              it). It is a guide, not a hard limit.
            </p>
          </div>
        ) : null}
      </section>

      {/* 1 — bucket prefix overview */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {(data?.overview.prefixes ?? []).map((p, i) => {
          const Icon = PREFIX_ICONS[i] ?? HardDrive;
          return (
            <div key={p.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <Icon className="h-4 w-4 text-[#ffd444]" />
              <p className="mt-2 font-display text-lg font-semibold text-white">
                {formatBytes(p.bytes)}
              </p>
              <p className="text-xs font-medium text-white/80">{p.label}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-white/45">
                {p.files > 0 ? `${p.files} files · ` : ""}
                {p.hint}
              </p>
            </div>
          );
        })}
      </section>

      {/* 2 — per-role usage, READ-ONLY (v2.8.69.0) */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Portal storage</h2>
            <p className="text-xs text-white/50">
              Read-only here — caps and purges live in the LMS Admin Studio → Storage.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name…"
                className="h-9 w-44 rounded-xl border border-white/10 bg-white/[0.04] pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/35 focus:border-[#ffd444]/50 sm:w-56"
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-medium text-white/80 transition-colors hover:border-[#ffd444]/40"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <button type="button" className={tabBtn(tab === "students")} onClick={() => setTab("students")}>
            <HardDrive size={14} /> Students
            <span className="text-[10.5px] font-normal opacity-70">{students.length}</span>
          </button>
          <button type="button" className={tabBtn(tab === "teachers")} onClick={() => setTab("teachers")}>
            <BookOpen size={14} /> Teachers
            <span className="text-[10.5px] font-normal opacity-70">{teachers.length}</span>
          </button>
          <button type="button" className={tabBtn(tab === "parents")} onClick={() => setTab("parents")}>
            <HeartHandshake size={14} /> Parents
            <span className="text-[10.5px] font-normal opacity-70">{parents.length}</span>
          </button>
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">
            {query ? "No one matches that search." : "No files in this group yet."}
          </p>
        ) : tab === "students" ? (
          <ul className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
            {(filtered as StudentRow[]).map((s) => (
              <li key={s.studentId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-white">
                    {s.fullName}
                    <span className="ml-2 text-[11px] text-white/45">
                      {s.admissionNo}
                      {s.className ? ` · ${s.className}` : ""}
                    </span>
                  </p>
                  <p className="text-xs text-white/70">
                    <span className={s.quotaPct >= 90 ? "font-semibold text-rose-300" : ""}>
                      {formatBytes(s.totalBytes)}
                    </span>{" "}
                    / {formatBytes(data?.overview.studentQuotaBytes ?? 0)}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  {/* v2.8.83.0 — gradient fill (shared src/lib/storage-bar.ts). */}
                  <div
                    className="h-full overflow-hidden rounded-full transition-all"
                    style={{ width: `${Math.max(1.5, s.quotaPct)}%` }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: storageBarInnerWidth(s.quotaPct),
                        background: storageBarGradient("admin"),
                      }}
                    />
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10.5px] text-white/40">
                    work files {formatBytes(s.submissionBytes)} · chat {formatBytes(s.chatBytes)} ·{" "}
                    {s.quotaPct}% of quota
                  </p>
                  <button
                    type="button"
                    onClick={() => setDrawer({ role: "student", personId: s.studentId })}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/12 px-2.5 text-[11px] font-medium text-white/70 transition-colors hover:border-[#ffd444]/40 hover:text-white"
                  >
                    <Eye size={12} /> View files
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : tab === "teachers" ? (
          <ul className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
            {(filtered as TeacherRow[]).map((t) => (
              <li key={t.teacherId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-white">{t.fullName}</p>
                  <p className="text-xs text-white/70">
                    {formatBytes(t.totalBytes)}
                    {t.capBytes != null ? (
                      <>
                        {" "}· {t.capPct}% of {formatBytes(t.capBytes)} cap
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  {/* v2.8.83.0 — gradient fill (shared src/lib/storage-bar.ts). */}
                  <div
                    className="h-full overflow-hidden rounded-full transition-all"
                    style={{ width: `${Math.max(1.5, t.capPct)}%` }}
                  >
                    <div
                      className="h-full transition-all"
                      style={{
                        width: storageBarInnerWidth(t.capPct),
                        background: storageBarGradient("admin"),
                      }}
                    />
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10.5px] text-white/40">
                    assignments {formatBytes(t.assignmentBytes)} · materials {formatBytes(t.materialBytes)} ·
                    notices {formatBytes(t.noticeBytes)} · chat {formatBytes(t.chatBytes)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDrawer({ role: "teacher", personId: t.teacherId })}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/12 px-2.5 text-[11px] font-medium text-white/70 transition-colors hover:border-[#ffd444]/40 hover:text-white"
                  >
                    <Eye size={12} /> View files
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-4 max-h-96 space-y-2.5 overflow-y-auto pr-1">
            {(filtered as ParentRow[]).map((p) => (
              <li key={p.parentId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-white">{p.fullName}</p>
                  <p className="text-xs text-white/70">
                    {formatBytes(p.totalBytes)}
                    {p.capBytes != null ? ` · ${formatBytes(p.capBytes)} cap` : " · no cap set"}
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10.5px] text-white/40">
                    Parent uploads arrive with a future release — caps can be set in the LMS Admin
                    Studio.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDrawer({ role: "parent", personId: p.parentId })}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/12 px-2.5 text-[11px] font-medium text-white/70 transition-colors hover:border-[#ffd444]/40 hover:text-white"
                  >
                    <Eye size={12} /> View files
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {drawer ? <PersonFilesDrawer {...drawer} onClose={() => setDrawer(null)} /> : null}
      </section>

      {/* 3 — cleanup marks, READ-ONLY since v2.8.69.0 (purge lives in LMS Admin) */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
              <Trash2 className="h-4 w-4 text-[#ffd444]" /> 3-month cleanup marks
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-white/50">
              Student files older than {cleanup?.days ?? 90} days, listed read-only.{" "}
              <span className="text-amber-200/90">
                Purging happens in the LMS Admin Studio → Storage → Cleanup.
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={cleanupFilter}
              onChange={(e) => setCleanupFilter(e.target.value as FileKind)}
              className={filterSelect}
              aria-label="Filter cleanup marks by file type"
            >
              {FILE_KIND_OPTIONS.map((o) => (
                <option key={o.key} value={o.key} className="bg-[#141412]">
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-white/70">
              {cleanupFiltered.length} of {cleanup?.totalCount ?? 0} marked ·{" "}
              <span className="text-[#ffd444]">
                {formatBytes(
                  cleanupFiltered.reduce((sum, c) => sum + c.sizeBytes, 0),
                )}
              </span>
            </p>
          </div>
        </div>

        {cleanupFiltered.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/50">
            {cleanupFilter === "all"
              ? "Nothing marked yet — files appear here 90 days after upload."
              : "No cleanup marks of that type."}
          </p>
        ) : (
          <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
            {cleanupFiltered.map((c) => (
              <li
                key={`${c.kind}-${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white" title={c.fileName}>
                    {c.fileName}
                  </p>
                  <p className="text-[10.5px] text-white/45">
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
                  <span className="text-xs text-white/70">{formatBytes(c.sizeBytes)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
