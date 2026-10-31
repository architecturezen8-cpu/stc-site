"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  FileText,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  AttachmentUploader,
  FileChipList,
  FileCountBadge,
  LinkField,
  LinkRow,
  type AssignmentFileRef,
} from "@/components/portal/assignment-file-ui";

/* ── types shared with the server page ─────────────────────────────────── */

export type TeacherClassSubjectOption = {
  csId: number;
  classId: number;
  className: string;
  subjectName: string;
  students: number;
};

export type TeacherMaterialItem = {
  id: number;
  classSubjectId: number;
  className: string;
  subjectName: string;
  title: string;
  linkUrl: string | null;
  fileCount: number;
  postedLabel: string;
  /* v2.8.77.0 — the actual file refs (mirrors portal-classroom.ts's
     TeacherMaterialItem; the local mirror was missing it so tsc failed). */
  files: AssignmentFileRef[];
};

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

export function TeacherMaterials({
  options,
  initialMaterials,
}: {
  options: TeacherClassSubjectOption[];
  initialMaterials: TeacherMaterialItem[];
}) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [csId, setCsId] = useState<number | "">(options[0]?.csId ?? "");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<AssignmentFileRef[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  /* v2.8.77.0 — Phase 3.3 polish: the shared list gains a class×subject
     filter and a title search (pure client state over initialMaterials,
     the same pattern as the roster's search box). */
  const [filterCs, setFilterCs] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const filtered =
    filterCs === "all" && query.trim() === ""
      ? materials
      : materials.filter((m) => {
          if (filterCs !== "all" && m.classSubjectId !== filterCs) return false;
          const q = query.trim().toLowerCase();
          if (
            q &&
            !m.title.toLowerCase().includes(q) &&
            !`${m.className} ${m.subjectName}`.toLowerCase().includes(q)
          ) {
            return false;
          }
          return true;
        });

  /* v2.8.49.0 — Phase 1.2: edit-in-place state (the card is replaced by an
     edit form seeded from GET /api/portal/materials/[id]). */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editCsId, setEditCsId] = useState<number | "">("");
  const [editTitle, setEditTitle] = useState("");
  const [editFiles, setEditFiles] = useState<AssignmentFileRef[]>([]);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  async function refreshList() {
    try {
      const res = await fetch("/api/portal/materials", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        materials?: TeacherMaterialItem[];
      };
      if (res.ok && json.ok && Array.isArray(json.materials)) {
        setMaterials(json.materials);
      }
    } catch {
      /* the list is refreshable — a silent miss is fine */
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFlash(null);
    try {
      const res = await fetch("/api/portal/materials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classSubjectId: csId === "" ? undefined : csId,
          title,
          linkUrl: linkUrl.trim() || undefined,
          files: files.length > 0 ? files : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the material.");
      }
      setTitle("");
      setFiles([]);
      setLinkUrl("");
      setFlash({ ok: true, text: "Material shared — the class can see it now." });
      await refreshList();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the material.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: number) {
    if (deletingId != null) return;
    if (!window.confirm("Delete this material? Students lose access to its files too.")) {
      return;
    }
    setDeletingId(id);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/materials/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not delete the material.");
      }
      setFlash({ ok: true, text: "Material deleted." });
      await refreshList();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not delete the material.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  /* v2.8.49.0 — Phase 1.2: open the edit form, seeded from the server. */
  async function startEdit(id: number) {
    if (editLoading || savingEdit) return;
    setEditLoading(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/materials/${id}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: {
          id: number;
          classSubjectId: number;
          title: string;
          linkUrl: string;
          files: AssignmentFileRef[];
        };
        error?: string;
      };
      if (!res.ok || !json.ok || !json.detail) {
        throw new Error("Could not load the material for editing.");
      }
      setEditCsId(json.detail.classSubjectId);
      setEditTitle(json.detail.title);
      setEditFiles(json.detail.files);
      setEditLinkUrl(json.detail.linkUrl);
      setEditingId(id);
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not load the material for editing.",
      });
    } finally {
      setEditLoading(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditFiles([]);
    setEditTitle("");
    setEditLinkUrl("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (savingEdit || editingId == null) return;
    setSavingEdit(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/materials/${editingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classSubjectId: editCsId === "" ? undefined : editCsId,
          title: editTitle,
          linkUrl: editLinkUrl.trim(),
          files: editFiles,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the material.");
      }
      setFlash({ ok: true, text: "Material updated — the class sees the change now." });
      cancelEdit();
      await refreshList();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the material.",
      });
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-5">
      <Flash flash={flash} />

      {/* Composer */}
      <section
        id="share"
        className="scroll-mt-24 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <BookOpen size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              Share a material
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              Notes, worksheets, videos — anything the class should keep.
            </p>
          </div>
        </div>

        {options.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--pt-border)] px-4 py-3 text-[12.5px] text-[var(--pt-body)]">
            Your teaching subjects are not set up yet — ask the school office
            to assign you classes, then share materials here.
          </p>
        ) : (
          <form onSubmit={create} className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                  Class · Subject
                </span>
                <select
                  value={csId}
                  onChange={(e) => setCsId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                >
                  {options.map((o) => (
                    <option key={o.csId} value={o.csId}>
                      {o.className} · {o.subjectName} ({o.students})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  placeholder="e.g. Chapter 4 summary notes (PDF)"
                  className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 text-[13px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
                />
              </label>
            </div>

            <div className="rounded-xl border border-dashed border-[var(--pt-border-strong,var(--pt-border))] p-3">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Files (PDF, Word, PowerPoint, Excel, images, video…)
              </p>
              <AttachmentUploader files={files} onChange={setFiles} disabled={creating} />
              <div className="mt-2.5">
                <LinkField value={linkUrl} onChange={setLinkUrl} disabled={creating} />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={
                  creating ||
                  csId === "" ||
                  title.trim().length < 3 ||
                  (files.length === 0 && linkUrl.trim() === "")
                }
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                Share with the class
              </button>
            </div>
          </form>
        )}
      </section>

      {/* List */}
      <section className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <FileText size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              Shared materials
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              {filtered.length > 0
                ? `${filtered.length} of ${materials.length} item${materials.length === 1 ? "" : "s"} shown — your classes can open everything listed.`
                : materials.length > 0
                  ? "Nothing matches the filter."
                  : "Nothing shared yet."}
            </p>
          </div>
        </div>

        {/* v2.8.77.0 — Phase 3.3 polish: filter by class × subject + search. */}
        {materials.length > 0 ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] pl-3 pr-1.5 text-[11.5px] font-semibold text-[var(--pt-body)]">
              <Filter size={12} className="shrink-0 text-[var(--pt-accent-text)]" />
              <select
                value={filterCs === "all" ? "" : String(filterCs)}
                onChange={(e) =>
                  setFilterCs(e.target.value === "" ? "all" : Number(e.target.value))
                }
                aria-label="Filter by class and subject"
                className="h-7 max-w-[210px] bg-transparent text-[11.5px] font-semibold text-[var(--pt-heading)] outline-none"
              >
                <option value="">All classes</option>
                {options.map((o) => (
                  <option key={o.csId} value={o.csId}>
                    {o.className} · {o.subjectName}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-3 sm:max-w-[280px]">
              <Search size={12} className="shrink-0 text-[var(--pt-body)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title or class…"
                aria-label="Search materials"
                className="h-full w-full min-w-0 bg-transparent text-[12px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="shrink-0 text-[var(--pt-body)] hover:text-[var(--pt-heading)]"
                >
                  <X size={12} />
                </button>
              ) : null}
            </label>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--pt-border-strong,var(--pt-border))] px-4 py-6 text-center text-[12.5px] text-[var(--pt-body)]">
            Share your first notes or worksheet above — it lands on the
            class&apos;s dashboard right away.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {materials.map((m) =>
              editingId === m.id ? (
                /* v2.8.49.0 — Phase 1.2: edit form replaces the card */
                <form
                  key={m.id}
                  onSubmit={saveEdit}
                  className="grid gap-3 rounded-xl border border-[var(--pt-accent)] bg-[var(--pt-panel-soft)] p-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                        Class · Subject
                      </span>
                      <select
                        value={editCsId}
                        onChange={(e) =>
                          setEditCsId(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                      >
                        {options.some((o) => o.csId === editCsId) ? null : (
                          <option value={editCsId}>
                            {m.className} · {m.subjectName}
                          </option>
                        )}
                        {options.map((o) => (
                          <option key={o.csId} value={o.csId}>
                            {o.className} · {o.subjectName} ({o.students})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                        Title
                      </span>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={160}
                        className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                      />
                    </label>
                  </div>
                  <div className="rounded-xl border border-dashed border-[var(--pt-border-strong,var(--pt-border))] p-3">
                    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                      Files (removing one also removes the stored copy)
                    </p>
                    <AttachmentUploader
                      files={editFiles}
                      onChange={setEditFiles}
                      disabled={savingEdit}
                    />
                    <div className="mt-2.5">
                      <LinkField
                        value={editLinkUrl}
                        onChange={setEditLinkUrl}
                        disabled={savingEdit}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--pt-border)] px-4 text-[12.5px] font-semibold text-[var(--pt-heading)] transition-colors hover:border-[var(--pt-accent)]"
                    >
                      <X size={13} /> Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit || editTitle.trim().length < 3}
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save changes
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={m.id}
                  className="rounded-xl border border-[var(--pt-border)] px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                        {m.title}
                      </p>
                      <p className="truncate text-[11px] text-[var(--pt-body)]">
                        {m.className} · {m.subjectName} · {m.postedLabel}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <FileCountBadge count={m.fileCount} hasLink={Boolean(m.linkUrl)} />
                      <button
                        type="button"
                        onClick={() => void startEdit(m.id)}
                        disabled={editLoading || editingId != null}
                        aria-label={`Edit ${m.title}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-chip)] text-[var(--pt-chip-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {editLoading ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Pencil size={13} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(m.id)}
                        disabled={deletingId === m.id}
                        aria-label={`Delete ${m.title}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {deletingId === m.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                  {m.linkUrl ? (
                    <div className="mt-2">
                      <LinkRow url={m.linkUrl} />
                    </div>
                  ) : null}
                  {m.files.length > 0 ? (
                    <div className="mt-2">
                      <FileChipList files={m.files} />
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}
