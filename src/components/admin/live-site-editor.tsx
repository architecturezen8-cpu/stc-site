"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  History,
  Laptop,
  Layers,
  Loader2,
  Monitor,
  MousePointerClick,
  Pencil,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { ListEditor, type ListKind } from "@/components/admin/list-editor";
import { useDraggableToolbar } from "@/components/cms/use-draggable-toolbar";
import type { CmsPageView, CmsSectionView } from "@/lib/cms";
import type {
  CmsPageDefinition,
  CmsSectionDefinition,
} from "@/lib/cms-defaults";

const EDITOR_PAGES = [
  { slug: "home", label: "Home Page", href: "/" },
  { slug: "history", label: "History Page", href: "/history" },
  { slug: "advanced-level-biological-science", label: "A/L · Biological Science", href: "/advanced-level/biological-science" },
  { slug: "advanced-level-physical-science", label: "A/L · Physical Science", href: "/advanced-level/physical-science" },
  { slug: "advanced-level-commerce", label: "A/L · Commerce", href: "/advanced-level/commerce" },
  { slug: "advanced-level-arts", label: "A/L · Arts", href: "/advanced-level/arts" },
];

type Drawer = "pages" | "sections" | "inspector" | "revisions" | null;
type Device = "tablet" | "mobile" | null;
type Revision = { id: number; action: string; createdAt: string };

export function LiveSiteEditor({
  initialPage,
  definition,
}: {
  initialPage: CmsPageView;
  definition: CmsPageDefinition;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const editMode = searchParams.get("edit") === "1";

  const [page, setPage] = useState(initialPage);
  const [selectedKey, setSelectedKey] = useState(initialPage.sections[0]?.key ?? "");
  const [draft, setDraft] = useState<Record<string, string>>(
    initialPage.sections[0]?.data ?? {},
  );
  const [hidden, setHidden] = useState(initialPage.sections[0]?.hidden ?? false);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [device, setDevice] = useState<Device>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const { ref: toolbarRef, pos: toolbarPos, dragging: toolbarDragging, handlers: toolbarHandlers } =
    useDraggableToolbar("stc:vtb:section");

  const selected = page.sections.find((s) => s.key === selectedKey) ?? page.sections[0];
  const selectedDef = definition.sections.find((s) => s.key === selectedKey);
  const dirty = selected
    ? JSON.stringify(draft) !== JSON.stringify(selected.data) ||
      hidden !== selected.hidden
    : false;

  const previewUrl = `${definition.path}${definition.path.includes("?") ? "&" : "?"}cmsPreview=1&edit=1&v=${nonce}`;

  const choose = (key: string, open = false) => {
    const item = page.sections.find((section) => section.key === key);
    if (!item) return;
    if (dirty && !window.confirm("Discard unsaved changes in this section?")) return;
    setSelectedKey(key);
    setDraft(item.data);
    setHidden(item.hidden);
    if (open) setDrawer("inspector");
  };

  useEffect(() => {
    const direct = (event: Event) => {
      const key = (event as CustomEvent<{ sectionKey?: string }>).detail?.sectionKey;
      if (key) choose(key, true);
    };
    const framed = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "stc-cms-select") choose(event.data.sectionKey, true);
    };
    window.addEventListener("stc-cms-select", direct);
    window.addEventListener("message", framed);
    return () => {
      window.removeEventListener("stc-cms-select", direct);
      window.removeEventListener("message", framed);
    };
  });

  useEffect(() => {
    if (!drawer && !device) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer, device]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const replaceEditorParams = (editing: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cmsEditor", "1");
    if (editing) params.set("edit", "1");
    else params.delete("edit");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const fetchPage = async () => {
    const response = await fetch(`/api/admin/pages/${page.slug}`, {
      cache: "no-store",
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Unable to refresh page.");
    const nextPage = json.page as CmsPageView;
    setPage(nextPage);
    const item =
      nextPage.sections.find((section) => section.key === selectedKey) ??
      nextPage.sections[0];
    setSelectedKey(item.key);
    setDraft(item.data);
    setHidden(item.hidden);
    setNonce((value) => value + 1);
    router.refresh();
  };

  const save = async () => {
    if (!selected) return false;
    setBusy("save");
    try {
      const response = await fetch(`/api/admin/pages/${page.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionKey: selected.key,
          data: draft,
          hidden,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to save draft.");
      await fetchPage();
      setToast("Draft saved");
      setDrawer(null);
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to save draft.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (dirty && !(await save())) return;
    if (!window.confirm("Publish every draft change on this page?")) return;
    setBusy("publish");
    try {
      const response = await fetch(`/api/admin/pages/${page.slug}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to publish.");
      await fetchPage();
      setToast("Published to the live website");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to publish.");
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
    await fetchPage();
    setDrawer(null);
    setToast("Draft discarded");
    setBusy(null);
  };

  const move = async (direction: -1 | 1) => {
    const index = page.sections.findIndex((section) => section.key === selectedKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= page.sections.length) return;
    const reordered = [...page.sections];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPage((current) => ({
      ...current,
      hasDraftChanges: true,
      sections: reordered.map((section, order) => ({ ...section, order })),
    }));
    await fetch(`/api/admin/pages/${page.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        keys: reordered.map((section) => section.key),
      }),
    });
    router.refresh();
    setNonce((value) => value + 1);
    setToast("Section order saved");
  };

  const openRevisions = async () => {
    setDrawer("revisions");
    const response = await fetch(`/api/admin/pages/${page.slug}/revisions`, {
      cache: "no-store",
    });
    if (response.ok) setRevisions((await response.json()).revisions);
  };

  const restore = async (revisionId: number) => {
    if (!window.confirm("Restore this version as a new draft?")) return;
    setBusy("restore");
    const response = await fetch(`/api/admin/pages/${page.slug}/revisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId }),
    });
    if (response.ok) {
      await fetchPage();
      setDrawer(null);
      setToast("Version restored as a draft");
    }
    setBusy(null);
  };

  return (
    <>
      {/* Floating toolbar over the original public website — defaults to the
          bottom centre and is draggable via the grip handle. flex-wrap breaks
          it into two tidy rows on narrow phones so nothing overflows. */}
      <div
        ref={toolbarRef}
        style={toolbarPos ? { left: toolbarPos.x, top: toolbarPos.y } : undefined}
        className={`fixed z-[120] flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0b0b0a]/95 p-2 text-white shadow-2xl backdrop-blur-xl sm:gap-2.5 ${
          toolbarPos
            ? ""
            : "inset-x-2 bottom-3 mx-auto sm:bottom-5"
        } ${toolbarDragging ? "transition-none" : "transition-[left,top] duration-150"}`}
      >
        <button
          type="button"
          onPointerDown={toolbarHandlers.onPointerDown}
          onPointerMove={toolbarHandlers.onPointerMove}
          onPointerUp={toolbarHandlers.onPointerUp}
          onPointerCancel={toolbarHandlers.onPointerCancel}
          onDoubleClick={toolbarHandlers.onDoubleClick}
          className="vtb-handle grid h-10 w-6 shrink-0 touch-none place-items-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white"
          aria-label="Move toolbar — drag to reposition, double-tap to reset"
          title="Drag to move · double-tap to reset"
        >
          <GripVertical size={14} />
        </button>
        <Link
          href="/admin/pages"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Back to Pages"
        >
          <ArrowLeft size={16} />
        </Link>

        <button
          onClick={() => setDrawer("pages")}
          className="flex h-10 min-w-0 shrink items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-semibold text-white/65 transition-colors hover:bg-white/10 hover:text-white sm:gap-2 sm:px-3 sm:text-[11px]"
        >
          <FileText size={14} className="shrink-0 text-[#ffd444]" />
          <span className="min-w-0 max-w-20 truncate sm:max-w-40">{definition.title}</span>
          <ChevronDown size={12} className="shrink-0" />
        </button>

        <span className="hidden h-6 w-px bg-white/10 sm:block" />

        <button
          onClick={() => replaceEditorParams(!editMode)}
          className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[10px] font-semibold transition-colors sm:px-4 sm:text-[11px] ${
            editMode
              ? "bg-[#ffd444] text-[#0b0b0a]"
              : "border border-white/12 text-white/65 hover:border-white/30 hover:text-white"
          }`}
        >
          {editMode ? <MousePointerClick size={14} /> : <Pencil size={14} />}
          <span className="hidden xs:inline sm:inline">
            {editMode ? "Edit On" : "Edit Mode"}
          </span>
        </button>

        {editMode && (
          <>
            <button
              onClick={() => setDrawer("sections")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/55 hover:bg-white/10 hover:text-white"
              aria-label="Page sections"
            >
              <Layers size={15} />
            </button>
            <button
              onClick={() => setDevice("tablet")}
              className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl text-white/55 hover:bg-white/10 hover:text-white sm:grid"
              aria-label="Tablet preview"
            >
              <Tablet size={15} />
            </button>
            <button
              onClick={() => setDevice("mobile")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/55 hover:bg-white/10 hover:text-white"
              aria-label="Mobile preview"
            >
              <Smartphone size={15} />
            </button>
          </>
        )}

        <button
          onClick={publish}
          disabled={busy === "publish"}
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#ffd444] px-3 text-[10px] font-semibold text-[#0b0b0a] disabled:opacity-50 sm:px-4 sm:text-[11px]"
        >
          {busy === "publish" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          <span className="hidden sm:inline">Publish</span>
        </button>
      </div>

      {/* Draft status */}
      <div
        className={`fixed right-3 top-24 z-[110] rounded-full px-3 py-2 font-sans text-[8px] font-semibold uppercase tracking-[0.16em] shadow-lg backdrop-blur sm:right-5 ${
          page.hasDraftChanges
            ? "bg-amber-400 text-amber-950"
            : "bg-emerald-500 text-white"
        }`}
      >
        {page.hasDraftChanges ? "Draft changes" : "Published"}
      </div>

      {/* Page / section / inspector drawers */}
      {drawer && (
        <div
          onClick={() => setDrawer(null)}
          className="fixed inset-0 z-[150] flex justify-end bg-black/65"
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            className="g-panel h-full w-full max-w-[420px] overflow-y-auto border-l border-white/10 bg-[#0d0d0b] text-white shadow-2xl"
          >
            <DrawerHeader
              title={
                drawer === "pages"
                  ? "Website Pages"
                  : drawer === "sections"
                    ? "Page Sections"
                    : drawer === "revisions"
                      ? "Version History"
                      : `Edit ${selected?.label ?? "Section"}`
              }
              close={() => setDrawer(null)}
            />

            {drawer === "pages" && <PagesDrawer activeSlug={page.slug} />}
            {drawer === "sections" && (
              <SectionsDrawer
                page={page}
                selectedKey={selectedKey}
                choose={choose}
                revisions={openRevisions}
              />
            )}
            {drawer === "inspector" && (
              <Inspector
                section={selected}
                definition={selectedDef}
                draft={draft}
                setDraft={setDraft}
                hidden={hidden}
                setHidden={setHidden}
                dirty={dirty}
                save={save}
                busy={busy}
                move={move}
                discard={discard}
                pagePath={definition.path}
                onSaved={() => {
                  setNonce((value) => value + 1);
                  router.refresh();
                }}
              />
            )}
            {drawer === "revisions" && (
              <Revisions revisions={revisions} busy={busy} restore={restore} />
            )}
          </aside>
        </div>
      )}

      {/* Responsive preview modal; desktop editing remains the full real page. */}
      {device && (
        <div className="fixed inset-0 z-[140] flex flex-col bg-[#090908] text-white">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#ffd444] text-[#0b0b0a]">
                {device === "tablet" ? <Tablet size={15} /> : <Smartphone size={15} />}
              </span>
              <div>
                <p className="text-[12px] font-semibold">
                  {device === "tablet" ? "Tablet Preview" : "Mobile Preview"}
                </p>
                <p className="text-[9px] text-white/35">Tap a section to edit</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setNonce((value) => value + 1)}
                className="grid h-9 w-9 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => setDevice(null)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/60 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="flex flex-1 items-start justify-center overflow-auto p-3 sm:p-6">
            <div
              className="h-full max-w-full overflow-hidden rounded-[22px] bg-white shadow-2xl"
              style={{ width: device === "tablet" ? 834 : 390 }}
            >
              <iframe
                key={nonce}
                src={previewUrl}
                title={`${device} preview`}
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="g-fade fixed left-1/2 top-5 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl">
          <Check size={14} /> {toast}
        </div>
      )}
    </>
  );
}

function DrawerHeader({ title, close }: { title: string; close: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#0d0d0b]/95 px-5 py-4 backdrop-blur">
      <h2 className="truncate font-display text-xl font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      <button
        onClick={close}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function PagesDrawer({ activeSlug }: { activeSlug: string }) {
  return (
    <div className="space-y-3 p-5">
      {EDITOR_PAGES.map((page) => (
        <Link
          key={page.slug}
          href={`${page.href}?cmsEditor=1`}
          className={`group flex items-center gap-4 rounded-xl border p-4 transition-colors ${
            activeSlug === page.slug
              ? "border-[#ffd444] bg-[#ffd444]/10"
              : "border-white/10 hover:border-white/25"
          }`}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ffd444] text-[#0b0b0a]">
            <FileText size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">
              {page.label}
            </span>
            <span className="mt-0.5 block text-[10px] text-white/35">{page.href}</span>
          </span>
          <ChevronRight size={14} className="text-white/25 transition-transform group-hover:translate-x-1" />
        </Link>
      ))}
    </div>
  );
}

function SectionsDrawer({
  page,
  selectedKey,
  choose,
  revisions,
}: {
  page: CmsPageView;
  selectedKey: string;
  choose: (key: string, open?: boolean) => void;
  revisions: () => void;
}) {
  return (
    <div className="p-5">
      <p className="mb-4 text-[10px] leading-relaxed text-white/40">
        Select a section here or tap it directly on the page.
      </p>
      <div className="space-y-2">
        {page.sections.map((section, index) => (
          <button
            key={section.key}
            onClick={() => choose(section.key, true)}
            className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
              selectedKey === section.key
                ? "border-[#ffd444] bg-[#ffd444]/10"
                : "border-white/10 hover:border-white/25"
            }`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-[9px] text-white/40">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-semibold">
                {section.label}
              </span>
              <span className="text-[9px] uppercase tracking-[0.14em] text-white/30">
                {section.type}
              </span>
            </span>
            {section.hidden ? (
              <EyeOff size={13} className="text-white/30" />
            ) : (
              <ChevronRight size={13} className="text-white/25" />
            )}
          </button>
        ))}
      </div>
      <button
        onClick={revisions}
        className="mt-5 flex w-full items-center gap-2 rounded-xl border border-white/12 px-4 py-3 text-[11px] text-white/55 hover:border-white/30 hover:text-white"
      >
        <History size={14} /> Version history
      </button>
    </div>
  );
}

function Inspector({
  section,
  definition,
  draft,
  setDraft,
  hidden,
  setHidden,
  dirty,
  save,
  busy,
  move,
  discard,
  pagePath,
  onSaved,
}: {
  section?: CmsSectionView;
  definition?: CmsSectionDefinition;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  hidden: boolean;
  setHidden: (value: boolean) => void;
  dirty: boolean;
  save: () => void;
  busy: string | null;
  move: (direction: -1 | 1) => void;
  discard: () => void;
  pagePath: string;
  onSaved: () => void;
}) {
  if (!section || !definition) return null;

  const isList = (definition.type ?? "").startsWith("list_");
  const input =
    "w-full rounded-xl border border-white/12 bg-white/[0.055] px-3.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/30">
            Selected section
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold">{section.label}</h3>
        </div>
        <button
          onClick={() => setHidden(!hidden)}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
            hidden
              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
              : "border-white/12 text-white/45"
          }`}
        >
          {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      {!isList && (
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => move(-1)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 py-2.5 text-[10px] text-white/55 hover:border-white/30 hover:text-white"
          >
            <ArrowUp size={13} /> Move up
          </button>
          <button
            onClick={() => move(1)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 py-2.5 text-[10px] text-white/55 hover:border-white/30 hover:text-white"
          >
            <ArrowDown size={13} /> Move down
          </button>
        </div>
      )}

      <div className="my-6 h-px bg-white/10" />

      {isList && (
        <>
          <p className="mb-3 text-[10.5px] leading-relaxed text-white/35">
            Tap <span className="font-semibold text-[#ffd444]">Add</span> at the end
            of the list to insert a new entry — stream teachers stay in sync with
            the Staff directory.
          </p>
          <ListEditor
            kind={definition.type as ListKind}
            pagePath={pagePath}
            onSaved={onSaved}
          />
          <div className="my-6 h-px bg-white/10" />
          <p className="mb-4 font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
            Section heading
          </p>
        </>
      )}

      <div className="space-y-5">
        {definition.fields.map((field) => (
          <label key={field.key} className="block min-w-0">
            <span className="mb-2 flex items-center justify-between gap-2 font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
              {field.label}
              {field.type === "image" && (
                <MediaLibraryButton
                  preferFolder="site-assets"
                  onSelect={(picked) =>
                    setDraft((current) => ({ ...current, [field.key]: picked.url }))
                  }
                />
              )}
            </span>
            {field.type === "textarea" ? (
              <textarea
                rows={5}
                value={draft[field.key] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                className={`${input} resize-y py-3 leading-relaxed`}
              />
            ) : (
              <input
                value={draft[field.key] ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                className={`${input} h-11`}
              />
            )}
            {field.help && (
              <span className="mt-1.5 block text-[10px] leading-relaxed text-white/25">
                {field.help}
              </span>
            )}
            {field.type === "image" && draft[field.key] && (
              <div className="mt-2 aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft[field.key]}
                  alt="Asset preview"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
          </label>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-7 border-t border-white/10 bg-[#0d0d0b]/95 px-5 pb-2 pt-4 backdrop-blur sm:-mx-6 sm:px-6">
        <button
          onClick={save}
          disabled={!dirty || busy === "save"}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-30"
        >
          {busy === "save" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          Save draft
        </button>
        <button
          onClick={discard}
          className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-full text-[10px] text-red-400 hover:bg-red-500/10"
        >
          <Trash2 size={12} /> Discard page drafts
        </button>
      </div>
    </div>
  );
}

function Revisions({
  revisions,
  busy,
  restore,
}: {
  revisions: Revision[];
  busy: string | null;
  restore: (id: number) => void;
}) {
  return (
    <div className="p-5">
      {revisions.length === 0 ? (
        <div className="py-12 text-center text-white/35">
          <History className="mx-auto" />
          <p className="mt-3 text-[13px]">No published versions yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {revisions.map((revision) => (
            <div
              key={revision.id}
              className="flex items-center gap-3 rounded-xl border border-white/10 p-4"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.07]">
                <Clock3 size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold">Published snapshot</span>
                <span className="mt-0.5 block text-[10px] text-white/35">
                  {new Date(revision.createdAt).toLocaleString()}
                </span>
              </span>
              <button
                disabled={busy === "restore"}
                onClick={() => restore(revision.id)}
                className="rounded-full border border-white/15 px-3 py-2 text-[10px] text-white/65 hover:bg-[#ffd444] hover:text-[#0b0b0a]"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
