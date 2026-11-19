"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Loader2, Megaphone, Pencil, Trash2, X } from "lucide-react";
import {
  AttachmentUploader,
  FileChipList,
  LinkField,
  LinkRow,
  type AssignmentFileRef,
} from "@/components/portal/assignment-file-ui";

/* ── types shared with the server page ─────────────────────────────────── */

export type TeacherNoticeClassOption = {
  classId: number;
  className: string;
  students: number;
};

export type TeacherNoticeItem = {
  id: number;
  classId: number;
  className: string;
  title: string;
  body: string;
  /* v2.8.59.0 — links, images, PDFs ride with the notice. */
  linkUrl: string | null;
  files: (AssignmentFileRef & { id: number })[];
  mine: boolean;
  postedLabel: string;
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

export function TeacherNotices({
  classOptions,
  initialNotices,
}: {
  classOptions: TeacherNoticeClassOption[];
  initialNotices: TeacherNoticeItem[];
}) {
  const [notices, setNotices] = useState(initialNotices);
  const [classId, setClassId] = useState<number | "">(classOptions[0]?.classId ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  /* v2.8.59.0 — attachments: one reference link + N files (images, PDFs…). */
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<AssignmentFileRef[]>([]);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  /* v2.8.49.0 — Phase 1.2: edit-in-place for the teacher's OWN notices
     (the card is replaced by an edit form seeded from the row in hand). */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editClassId, setEditClassId] = useState<number | "">("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  /* v2.8.59.0 — the edit form carries the attachments too. */
  const [editLink, setEditLink] = useState("");
  const [editFiles, setEditFiles] = useState<AssignmentFileRef[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  async function refreshList() {
    try {
      const res = await fetch("/api/portal/notices", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        notices?: TeacherNoticeItem[];
      };
      if (res.ok && json.ok && Array.isArray(json.notices)) {
        setNotices(json.notices);
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
      const res = await fetch("/api/portal/notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId: classId === "" ? undefined : classId,
          title,
          body,
          linkUrl: link.trim() || undefined,
          files: files.length > 0 ? files : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the notice.");
      }
      setTitle("");
      setBody("");
      setLink("");
      setFiles([]);
      setFlash({ ok: true, text: "Notice posted — the class sees it on their dashboard now." });
      await refreshList();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the notice.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: number) {
    if (deletingId != null) return;
    if (!window.confirm("Take this notice off the class board?")) return;
    setDeletingId(id);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/notices/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not delete the notice.");
      }
      setFlash({ ok: true, text: "Notice removed." });
      await refreshList();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not delete the notice.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  /* v2.8.49.0 — Phase 1.2: open the edit form (poster only — the UI only
     shows the pencil on `mine` rows, the server enforces it again). */
  function startEdit(n: TeacherNoticeItem) {
    setEditingId(n.id);
    setEditClassId(n.classId);
    setEditTitle(n.title);
    setEditBody(n.body);
    setEditLink(n.linkUrl ?? "");
    setEditFiles(n.files);
    setFlash(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditBody("");
    setEditLink("");
    setEditFiles([]);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (savingEdit || editingId == null) return;
    setSavingEdit(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/portal/notices/${editingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classId: editClassId === "" ? undefined : editClassId,
          title: editTitle,
          body: editBody,
          linkUrl: editLink.trim(),
          files: editFiles,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Could not save the notice.");
      }
      setFlash({ ok: true, text: "Notice updated — the class sees the change now." });
      cancelEdit();
      await refreshList();
    } catch (cause) {
      setFlash({
        ok: false,
        text: cause instanceof Error ? cause.message : "Could not save the notice.",
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
        id="post"
        className="scroll-mt-24 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <Megaphone size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              Post a class notice
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              Short announcements for one class — students, parents and you
              all see it on the dashboards.
            </p>
          </div>
        </div>

        {classOptions.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--pt-border)] px-4 py-3 text-[12.5px] text-[var(--pt-body)]">
            You are not teaching or leading any class yet — ask the school
            office to set that up, then post notices here.
          </p>
        ) : (
          <form onSubmit={create} className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                  Class
                </span>
                <select
                  value={classId}
                  onChange={(e) =>
                    setClassId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                >
                  {classOptions.map((o) => (
                    <option key={o.classId} value={o.classId}>
                      {o.className} ({o.students} students)
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
                  placeholder="e.g. Science fair projects — bring your drafts"
                  className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 text-[13px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                Notice
              </span>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                placeholder="What should the class know?"
                className="w-full resize-y rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 py-2.5 text-[13px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)] focus:border-[var(--pt-accent)]"
              />
            </label>
            {/* v2.8.59.0 — the owner: "notice daddi links, images, pdf danna
                option ekath danna wei ne" — one link + N files, the same
                pipeline the assignments use. */}
            <LinkField value={link} onChange={setLink} disabled={creating} />
            <AttachmentUploader
              files={files}
              onChange={setFiles}
              disabled={creating}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating || classId === "" || title.trim().length < 3 || body.trim().length < 1}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Megaphone size={13} />
                )}
                Post to the class board
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Board */}
      <section className="rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
            <Bell size={15} />
          </span>
          <div>
            <h2 className="font-display text-[16px] font-semibold text-[var(--pt-heading)]">
              Your class boards
            </h2>
            <p className="text-[11.5px] text-[var(--pt-body)]">
              {notices.length > 0
                ? "Every notice on the classes you teach or lead."
                : "No notices on your boards yet."}
            </p>
          </div>
        </div>

        {notices.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[var(--pt-border-strong,var(--pt-border))] px-4 py-6 text-center text-[12.5px] text-[var(--pt-body)]">
            Post your first notice above — it shows up instantly.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {notices.map((n) =>
              editingId === n.id ? (
                /* v2.8.49.0 — Phase 1.2: edit form replaces the card */
                <form
                  key={n.id}
                  onSubmit={saveEdit}
                  className="grid gap-3 rounded-xl border border-[var(--pt-accent)] bg-[var(--pt-panel-soft)] p-3.5"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                        Class
                      </span>
                      <select
                        value={editClassId}
                        onChange={(e) =>
                          setEditClassId(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        className="h-11 w-full rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                      >
                        {classOptions.some((o) => o.classId === editClassId) ? null : (
                          <option value={editClassId}>{n.className}</option>
                        )}
                        {classOptions.map((o) => (
                          <option key={o.classId} value={o.classId}>
                            {o.className} ({o.students} students)
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
                  <label className="block">
                    <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--pt-body)]">
                      Notice
                    </span>
                    <textarea
                      rows={4}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      maxLength={2000}
                      className="w-full resize-y rounded-xl border border-[var(--pt-border)] bg-[var(--pt-input-bg)] px-3.5 py-2.5 text-[13px] text-[var(--pt-heading)] outline-none focus:border-[var(--pt-accent)]"
                    />
                  </label>
                  {/* v2.8.59.0 — the edit form carries link + files too. */}
                  <LinkField value={editLink} onChange={setEditLink} disabled={savingEdit} />
                  <AttachmentUploader
                    files={editFiles}
                    onChange={setEditFiles}
                    disabled={savingEdit}
                  />
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
                      disabled={
                        savingEdit || editTitle.trim().length < 3 || editBody.trim().length < 1
                      }
                      className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--pt-accent)] px-5 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {savingEdit ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Save changes
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  key={n.id}
                  className="rounded-xl border border-[var(--pt-border)] px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--pt-heading)]">
                        {n.title}
                      </p>
                      <p className="text-[11px] text-[var(--pt-body)]">
                        {n.className} · {n.postedLabel}
                        {n.mine ? " · posted by you" : ""}
                      </p>
                    </div>
                    {n.mine ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(n)}
                          disabled={editingId != null}
                          aria-label={`Edit ${n.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-chip)] text-[var(--pt-chip-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(n.id)}
                          disabled={deletingId === n.id}
                          aria-label={`Delete ${n.title}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-danger-bg)] text-[var(--pt-danger-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {deletingId === n.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--pt-body)]">
                    {n.body}
                  </p>
                  {/* v2.8.59.0 — the board shows the attachments under each
                      notice; files open through the audience-checked route. */}
                  {n.linkUrl ? (
                    <div className="mt-2">
                      <LinkRow url={n.linkUrl} />
                    </div>
                  ) : null}
                  {n.files.length > 0 ? (
                    <div className="mt-2">
                      <FileChipList
                        files={n.files}
                        buildHref={(f) =>
                          f.id != null
                            ? `/api/portal/notices/${n.id}/file/${f.id}`
                            : `/api/portal/notices/${n.id}/file/0`
                        }
                      />
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
