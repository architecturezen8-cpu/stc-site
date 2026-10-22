"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Loader2,
  Monitor,
  MousePointerClick,
  PanelLeft,
  PanelRight,
  Pencil,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from "lucide-react";
import type { CmsPageView, CmsSectionView } from "@/lib/cms";
import type { CmsPageDefinition, CmsSectionDefinition } from "@/lib/cms-defaults";
import { MediaLibraryButton } from "@/components/admin/media-picker";

type Device = "desktop" | "tablet" | "mobile";
type Sheet = "sections" | "inspector" | "revisions" | null;
type Revision = { id: number; action: string; createdAt: string };

const deviceWidth: Record<Device, string> = {
  desktop: "100%",
  tablet: "834px",
  mobile: "390px",
};

export function VisualEditor({
  initialPage,
  definition,
}: {
  initialPage: CmsPageView;
  definition: CmsPageDefinition;
}) {
  const [page, setPage] = useState(initialPage);
  const [editMode, setEditMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState(initialPage.sections[0]?.key ?? "");
  const [draft, setDraft] = useState<Record<string, string>>(initialPage.sections[0]?.data ?? {});
  const [hidden, setHidden] = useState(initialPage.sections[0]?.hidden ?? false);
  const [device, setDevice] = useState<Device>("desktop");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const dirtyRef = useRef(false);

  const selected = page.sections.find((s) => s.key === selectedKey) ?? page.sections[0];
  const selectedDef = definition.sections.find((s) => s.key === selectedKey);
  const dirty = selected
    ? JSON.stringify(draft) !== JSON.stringify(selected.data) || hidden !== selected.hidden
    : false;

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const previewSrc = `${definition.path}${definition.path.includes("?") ? "&" : "?"}cmsPreview=1${
    editMode ? "&edit=1" : ""
  }&v=${nonce}`;

  const pick = (key: string, open = false) => {
    const item = page.sections.find((s) => s.key === key);
    if (!item) return;
    if (dirtyRef.current && !window.confirm("Discard unsaved changes in this section?")) return;
    setSelectedKey(key);
    setDraft(item.data);
    setHidden(item.hidden);
    if (open && window.innerWidth < 1280) setSheet("inspector");
  };

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "stc-cms-select" && typeof event.data.sectionKey === "string") {
        pick(event.data.sectionKey, true);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  });

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const toggleEdit = () => {
    const next = !editMode;
    setEditMode(next);
    setNonce((n) => n + 1);
    if (!next) setSheet(null);
    setToast(next ? "Edit mode on — tap a section" : "Edit mode off — viewing live layout");
  };

  const refresh = async () => {
    const res = await fetch(`/api/admin/pages/${page.slug}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok) {
      setPage(json.page);
      const item =
        json.page.sections.find((s: CmsSectionView) => s.key === selectedKey) ?? json.page.sections[0];
      setSelectedKey(item.key);
      setDraft(item.data);
      setHidden(item.hidden);
      setNonce((n) => n + 1);
    }
  };

  const save = async () => {
    if (!selected) return;
    setBusy("save");
    try {
      const res = await fetch(`/api/admin/pages/${page.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey: selected.key, data: draft, hidden }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      await refresh();
      setToast("Draft saved");
      setSheet(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (dirty) await save();
    if (!window.confirm("Publish all draft changes to the live website?")) return;
    setBusy("publish");
    try {
      const res = await fetch(`/api/admin/pages/${page.slug}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Publish failed");
      await refresh();
      setToast("Published to the live website");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!window.confirm("Discard every draft change on this page?")) return;
    setBusy("discard");
    await fetch(`/api/admin/pages/${page.slug}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discard" }),
    });
    await refresh();
    setToast("Draft discarded");
    setBusy(null);
  };

  const move = async (direction: -1 | 1) => {
    const index = page.sections.findIndex((s) => s.key === selectedKey);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= page.sections.length) return;
    const reordered = [...page.sections];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    setPage((p) => ({ ...p, sections: reordered.map((s, i) => ({ ...s, order: i })), hasDraftChanges: true }));
    await fetch(`/api/admin/pages/${page.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reorder", keys: reordered.map((s) => s.key) }),
    });
    setNonce((n) => n + 1);
    setToast("Section order saved");
  };

  const openRevisions = async () => {
    setSheet("revisions");
    const res = await fetch(`/api/admin/pages/${page.slug}/revisions`, { cache: "no-store" });
    if (res.ok) setRevisions((await res.json()).revisions);
  };

  const restore = async (revisionId: number) => {
    if (!window.confirm("Restore this version as a new draft?")) return;
    setBusy("restore");
    const res = await fetch(`/api/admin/pages/${page.slug}/revisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId }),
    });
    if (res.ok) {
      await refresh();
      setSheet(null);
      setToast("Revision restored as draft");
    }
    setBusy(null);
  };

  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-[600px] overflow-hidden bg-[#0a0a09]">
      {/* Sections rail — only in edit mode */}
      {editMode && (
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-white/10 bg-[#0d0d0b] p-4 xl:block">
          <p className="text-[9px] uppercase tracking-[0.22em] text-white/30">Page structure</p>
          <h2 className="mt-1 font-display text-lg font-semibold">Sections</h2>
          <SectionList page={page} selectedKey={selectedKey} onSelect={pick} />
          <button
            onClick={openRevisions}
            className="mt-5 flex w-full items-center gap-2 rounded-xl border border-white/12 px-3 py-2.5 text-[11px] font-medium text-white/50 hover:border-white/30 hover:text-white"
          >
            <History size={14} /> Version history
          </button>
        </aside>
      )}

      {/* Canvas */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0d0d0b] px-3 sm:px-4">
          <button
            onClick={toggleEdit}
            className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-[11px] font-semibold transition-colors ${
              editMode
                ? "bg-[#ffd444] text-[#0b0b0a]"
                : "border border-white/15 text-white/60 hover:border-white/35 hover:text-white"
            }`}
          >
            {editMode ? <MousePointerClick size={14} /> : <Pencil size={14} />}
            {editMode ? "Edit Mode: On" : "Enable Edit Mode"}
          </button>

          {/* Device switcher — edit mode only */}
          {editMode && (
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.06] p-1">
              {([
                ["desktop", Monitor],
                ["tablet", Tablet],
                ["mobile", Smartphone],
              ] as const).map(([value, Icon]) => (
                <button
                  key={value}
                  onClick={() => setDevice(value)}
                  className={`grid h-7 w-9 place-items-center rounded-lg transition-colors ${
                    device === value ? "bg-[#ffd444] text-[#0b0b0a]" : "text-white/40 hover:text-white"
                  }`}
                  aria-label={`${value} preview`}
                >
                  <Icon size={13} />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setNonce((n) => n + 1)}
              className="grid h-9 w-9 place-items-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white"
              aria-label="Refresh preview"
            >
              <RefreshCw size={14} />
            </button>
            <Link
              href={definition.path}
              target="_blank"
              className="grid h-9 w-9 place-items-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white"
              aria-label="Open live page"
            >
              <ExternalLink size={14} />
            </Link>
            <span
              className={`hidden rounded-full px-3 py-1.5 text-[8px] uppercase tracking-[0.16em] sm:inline ${
                page.hasDraftChanges ? "bg-amber-400/15 text-amber-300" : "bg-emerald-400/15 text-emerald-300"
              }`}
            >
              {page.hasDraftChanges ? "Draft changes" : "Published"}
            </span>
            <button
              onClick={publish}
              disabled={busy === "publish"}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[#ffd444] px-4 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-60"
            >
              {busy === "publish" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Publish
            </button>
          </div>
        </div>

        {/* Live site frame */}
        <div className={`flex flex-1 items-start justify-center overflow-auto ${editMode ? "bg-[#151513] p-2 sm:p-5" : "bg-white"}`}>
          <div
            className="h-full max-w-full overflow-hidden bg-white transition-[width] duration-500"
            style={{
              width: editMode ? deviceWidth[device] : "100%",
              minWidth: editMode && device === "desktop" ? "900px" : undefined,
              borderRadius: editMode && device !== "desktop" ? 22 : 0,
              boxShadow: editMode ? "0 25px 50px -12px rgb(0 0 0 / 0.5)" : "none",
            }}
          >
            <iframe
              key={nonce}
              src={previewSrc}
              title={`${page.title} preview`}
              className="h-full w-full border-0 bg-white"
            />
          </div>
        </div>

        {/* Mobile edit actions */}
        {editMode && (
          <div className="grid shrink-0 grid-cols-3 gap-1 border-t border-white/10 bg-[#0d0d0b] p-2 xl:hidden">
            <button onClick={() => setSheet("sections")} className="flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-[10px] font-medium text-white/55 hover:bg-white/5">
              <PanelLeft size={14} /> Sections
            </button>
            <button onClick={() => setSheet("inspector")} className="flex items-center justify-center gap-2 rounded-xl bg-[#ffd444] px-2 py-2.5 text-[10px] font-semibold text-[#0b0b0a]">
              <PanelRight size={14} /> Edit
            </button>
            <button onClick={openRevisions} className="flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-[10px] font-medium text-white/55 hover:bg-white/5">
              <Clock3 size={14} /> Versions
            </button>
          </div>
        )}
      </div>

      {/* Inspector — edit mode only */}
      {editMode && (
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-[#0d0d0b] xl:block">
          <Inspector {...{ section: selected, definition: selectedDef, draft, hidden, setDraft, setHidden, dirty, save, busy, move, discard }} />
        </aside>
      )}

      {/* Sheets */}
      {sheet && (
        <div onClick={() => setSheet(null)} className="fixed inset-0 z-[100] flex items-end bg-black/70 xl:hidden">
          <div onClick={(e) => e.stopPropagation()} className="g-panel max-h-[88svh] w-full overflow-y-auto rounded-t-2xl bg-[#111110] pb-[env(safe-area-inset-bottom)] text-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#111110]/95 px-5 py-4 backdrop-blur">
              <p className="font-display text-lg font-semibold">
                {sheet === "sections" ? "Page sections" : sheet === "revisions" ? "Version history" : `Edit ${selected?.label ?? ""}`}
              </p>
              <button onClick={() => setSheet(null)} className="grid h-9 w-9 place-items-center rounded-full border border-white/15">
                <X size={16} />
              </button>
            </div>
            {sheet === "sections" && <div className="p-4"><SectionList page={page} selectedKey={selectedKey} onSelect={pick} /></div>}
            {sheet === "inspector" && <Inspector {...{ section: selected, definition: selectedDef, draft, hidden, setDraft, setHidden, dirty, save, busy, move, discard }} />}
            {sheet === "revisions" && <RevisionList revisions={revisions} restore={restore} busy={busy} />}
          </div>
        </div>
      )}

      {toast && (
        <div className="g-fade fixed bottom-24 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-7">
          <Check size={14} />
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionList({ page, selectedKey, onSelect }: { page: CmsPageView; selectedKey: string; onSelect: (key: string, open?: boolean) => void }) {
  return (
    <div className="mt-4 space-y-2">
      {page.sections.map((section, i) => (
        <button
          key={section.key}
          onClick={() => onSelect(section.key, true)}
          className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
            selectedKey === section.key ? "border-[#ffd444] bg-[#ffd444]/10" : "border-white/10 hover:border-white/25"
          }`}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-[9px] font-semibold text-white/40">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-semibold text-white">{section.label}</span>
            <span className="mt-0.5 block text-[9px] uppercase tracking-[0.14em] text-white/30">{section.type}</span>
          </span>
          {section.hidden ? <EyeOff size={13} className="shrink-0 text-white/25" /> : <ChevronRight size={13} className="shrink-0 text-white/25" />}
        </button>
      ))}
    </div>
  );
}

function Inspector({ section, definition, draft, hidden, setDraft, setHidden, dirty, save, busy, move, discard }: {
  section?: CmsSectionView;
  definition?: CmsSectionDefinition;
  draft: Record<string, string>;
  hidden: boolean;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setHidden: (v: boolean) => void;
  dirty: boolean;
  save: () => void;
  busy: string | null;
  move: (d: -1 | 1) => void;
  discard: () => void;
}) {
  if (!section || !definition) {
    return <p className="p-6 text-sm text-white/40">Tap a section in the preview to edit it.</p>;
  }
  const field = "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#ffd444]";
  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/30">Selected section</p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em]">{section.label}</h2>
        </div>
        <button
          onClick={() => setHidden(!hidden)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${hidden ? "border-amber-400/40 bg-amber-400/10 text-amber-300" : "border-white/12 text-white/40"}`}
          aria-label={hidden ? "Show section" : "Hide section"}
        >
          {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <div className="mt-5 flex gap-2">
        <button onClick={() => move(-1)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 py-2.5 text-[10px] font-medium text-white/50 hover:border-white/30 hover:text-white">
          <ArrowUp size={13} /> Move up
        </button>
        <button onClick={() => move(1)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 py-2.5 text-[10px] font-medium text-white/50 hover:border-white/30 hover:text-white">
          <ArrowDown size={13} /> Move down
        </button>
      </div>

      <div className="my-6 h-px bg-white/10" />

      <div className="space-y-5">
        {definition.fields.map((f) => (
          <label key={f.key} className="block min-w-0">
            <span className="mb-2 flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
              {f.label}
              {f.type === "image" && (
                <MediaLibraryButton
                  preferFolder="site-assets"
                  onSelect={(picked) => setDraft((d) => ({ ...d, [f.key]: picked.url }))}
                />
              )}
            </span>
            {f.type === "textarea" ? (
              <textarea rows={5} value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} className={`${field} resize-y py-3 leading-relaxed`} />
            ) : (
              <input value={draft[f.key] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} className={`${field} h-11`} />
            )}
            {f.help && <span className="mt-1.5 block text-[10px] leading-relaxed text-white/25">{f.help}</span>}
            {f.type === "image" && draft[f.key] && (
              <div className="mt-2 aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {/* Admin-only preview of whatever URL the CMS field holds —
                    arbitrary hosts stay possible, so next/image's
                    remotePatterns would block exactly the URLs an editor can
                    paste. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft[f.key]} alt="Asset preview" className="h-full w-full object-cover" />
              </div>
            )}
          </label>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-7 border-t border-white/10 bg-[#0d0d0b]/95 px-5 pb-2 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
        <button onClick={save} disabled={!dirty || busy === "save"} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-30">
          {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save draft
        </button>
        <button onClick={discard} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-full text-[10px] text-red-400 hover:bg-red-500/10">
          <Trash2 size={12} /> Discard all page drafts
        </button>
      </div>
    </div>
  );
}

function RevisionList({ revisions, restore, busy }: { revisions: Revision[]; restore: (id: number) => void; busy: string | null }) {
  return (
    <div className="p-5 sm:p-6">
      {revisions.length === 0 ? (
        <div className="py-12 text-center">
          <History className="mx-auto text-white/20" />
          <p className="mt-3 text-sm text-white/40">No published revisions yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {revisions.map((revision) => (
            <div key={revision.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.07]">
                <History size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold">Published snapshot</span>
                <span className="mt-0.5 block text-[10px] text-white/35">{new Date(revision.createdAt).toLocaleString()}</span>
              </span>
              <button disabled={busy === "restore"} onClick={() => restore(revision.id)} className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-medium hover:bg-[#ffd444] hover:text-[#0b0b0a]">
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
