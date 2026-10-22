"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  History,
  Home,
  Image as ImageIcon,
  Images,
  Link2,
  Loader2,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Trash2,
  Type,
  Video,
  X,
} from "lucide-react";
import { VISUAL_EDITOR_PAGES } from "@/lib/visual-pages";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { VisualBlocksPanel } from "@/components/cms/visual-blocks-panel";
import { useDraggableToolbar } from "@/components/cms/use-draggable-toolbar";

type PatchData = {
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
  hidden?: boolean;
  textMode?: "direct" | "full";
  backgroundImage?: string;
  backgroundColor?: string;
  /** Registry logo fill scale — 100 fits the white circle. */
  logoScale?: number;
};

type Patch = {
  id?: number;
  selector: string;
  label?: string;
  elementType?: string;
  draftData?: PatchData;
  publishedData?: PatchData;
  data?: PatchData;
};

type SelectedElement = {
  selector: string;
  label: string;
  elementType: string;
  data: PatchData;
  element: HTMLElement;
  /** Central logo-registry identity (`data-logo-id`) when this is a logo. */
  logoId?: string;
};

const SELECTABLE =
  "h1,h2,h3,h4,h5,h6,p,a,button,img,video,iframe,figcaption,li,span,td,th,dt,dd,[data-visual-bg]";

function directText(element: HTMLElement) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function setText(element: HTMLElement, value: string, mode: "direct" | "full") {
  if (mode === "full") {
    if (element.textContent !== value) element.textContent = value;
    return;
  }
  const nodes = Array.from(element.childNodes).filter(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  if (nodes.length === 0) {
    element.insertBefore(document.createTextNode(value), element.firstChild);
    return;
  }
  const current = nodes
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (current === value) return;
  nodes[0].textContent = value;
  for (let index = 1; index < nodes.length; index++) nodes[index].textContent = "";
}

function applyPatch(
  patch: { selector: string; data: PatchData },
  editorPreview = false,
) {
  let element: HTMLElement | null = null;
  try {
    element = document.querySelector<HTMLElement>(patch.selector);
  } catch {
    return;
  }
  if (!element) return;
  const data = patch.data ?? {};
  element.dataset.visualPatched = "1";
  if (typeof data.hidden === "boolean") {
    if (data.hidden && editorPreview) {
      // Hidden elements remain visible/selectable only inside the editor.
      // Public rendering uses display:none, allowing the next sibling to reflow.
      element.style.display = "";
      element.style.opacity = "0.28";
      element.style.filter = "grayscale(1)";
      element.style.outline = "2px dashed #fbbf24";
      element.style.outlineOffset = "3px";
      element.dataset.visualHiddenDraft = "1";
    } else {
      element.style.display = data.hidden ? "none" : "";
      element.style.removeProperty("opacity");
      element.style.removeProperty("filter");
      if (element.dataset.visualHiddenDraft) {
        element.style.removeProperty("outline");
        element.style.removeProperty("outline-offset");
        delete element.dataset.visualHiddenDraft;
      }
    }
  }
  if (typeof data.backgroundImage === "string") {
    element.style.backgroundImage = data.backgroundImage
      ? `url("${data.backgroundImage.replaceAll('"', "%22")}")`
      : "none";
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
    if (element.hasAttribute("data-visual-bg")) {
      Array.from(element.children).forEach((child) => {
        (child as HTMLElement).style.opacity = data.backgroundImage ? "0" : "";
      });
    }
  }
  if (typeof data.backgroundColor === "string") {
    element.style.backgroundColor = data.backgroundColor;
  }
  // Registry logos: the fill scale of the image inside its circle.
  if (typeof data.logoScale === "number") {
    element.style.backgroundRepeat = "no-repeat";
    if (data.logoScale === 100) {
      element.style.removeProperty("background-size");
    } else {
      element.style.backgroundSize = `${data.logoScale}%`;
    }
  }
  if (typeof data.text === "string" && element.tagName !== "IMG") {
    setText(element, data.text, data.textMode ?? "full");
  }
  if (element instanceof HTMLAnchorElement && typeof data.href === "string") {
    element.setAttribute("href", data.href);
  }
  if (element instanceof HTMLImageElement) {
    if (typeof data.src === "string" && data.src) {
      // Next.js <Image> renders a srcset that always wins over src — strip it
      // (and sizes) so a patched image actually replaces the original one.
      element.removeAttribute("srcset");
      element.removeAttribute("sizes");
      element.src = data.src;
    }
    if (typeof data.alt === "string") element.alt = data.alt;
  }
  if (
    (element instanceof HTMLVideoElement || element instanceof HTMLIFrameElement) &&
    typeof data.src === "string" &&
    data.src
  ) {
    element.src = data.src;
    if (element instanceof HTMLVideoElement) element.load();
  }
  // Exam-results trend: editing the percentage label also updates its bar.
  const trendRow = element.closest<HTMLElement>("[data-trend-row]");
  if (trendRow && typeof data.text === "string") {
    const score = Number.parseFloat(data.text.replace(/[^0-9.]/g, ""));
    const bar = trendRow.querySelector<HTMLElement>("[data-trend-bar]");
    if (bar && Number.isFinite(score)) {
      bar.style.width = `${Math.max(0, Math.min(100, score))}%`;
    }
  }
}

function cssSelector(element: HTMLElement) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  // Prefer stable visual keys: a keyed element (or an element inside a keyed
  // component) survives React re-renders and content shifts. Structural
  // :nth-of-type chains are only used as a last resort.
  const keyed = element.closest<HTMLElement>("[data-visual-key]");
  const key = keyed?.getAttribute("data-visual-key");
  if (keyed && key) {
    if (keyed === element) return `[data-visual-key="${key}"]`;
    // Build a short relative path from the keyed container down to the element.
    const parts: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== keyed) {
      const parent: HTMLElement | null = current.parentElement;
      if (!parent) break;
      const sameTag = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName,
      );
      let part = current.tagName.toLowerCase();
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      parts.unshift(part);
      current = parent;
    }
    return `[data-visual-key="${key}"] ${parts.join(" > ")}`;
  }
  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();
    const parentElement: HTMLElement | null = current.parentElement;
    if (!parentElement) break;
    const siblings = Array.from(parentElement.children).filter(
      (child: Element) => child.tagName === current!.tagName,
    );
    if (siblings.length > 1) {
      part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    if (current.tagName === "MAIN") break;
    current = parentElement;
  }
  return parts.join(" > ");
}

/** Next/Image proxies src through /_next/image?url=… — show the real source. */
function realImageSrc(element: HTMLImageElement): string {
  const raw = element.getAttribute("src") ?? "";
  if (!raw.startsWith("/_next/image")) return raw;
  try {
    const url = new URL(raw, window.location.origin).searchParams.get("url");
    return url ? decodeURIComponent(url) : raw;
  } catch {
    return raw;
  }
}

function elementData(element: HTMLElement): SelectedElement {
  const isImage = element instanceof HTMLImageElement;
  const isMedia =
    isImage ||
    element instanceof HTMLVideoElement ||
    element instanceof HTMLIFrameElement ||
    element.hasAttribute("data-visual-bg");
  const direct = !isMedia ? directText(element) : "";
  const mode: "direct" | "full" = direct ? "direct" : "full";
  const fallbackText = !isMedia
    ? (element.textContent ?? "").replace(/\s+/g, " ").trim()
    : "";
  const mediaLabel = isImage
    ? element.alt
    : element.getAttribute("title") || element.getAttribute("aria-label") || "";
  const label =
    (isMedia ? mediaLabel : direct || fallbackText).slice(0, 80) ||
    `${element.tagName.toLowerCase()} element`;
  const logoId = element.getAttribute("data-logo-id") || undefined;
  const logoScale = Number(element.getAttribute("data-logo-scale"));
  return {
    selector: cssSelector(element),
    label,
    elementType: element.tagName.toLowerCase(),
    element,
    logoId,
    data: {
      ...(isImage
        ? { src: realImageSrc(element), alt: element.alt }
        : element instanceof HTMLVideoElement || element instanceof HTMLIFrameElement
          ? { src: element.getAttribute("src") ?? "" }
          : element.hasAttribute("data-visual-bg")
            ? {
                backgroundImage:
                  element.dataset.visualBg ||
                  getComputedStyle(element).backgroundImage
                    .replace(/^url\(["']?/, "")
                    .replace(/["']?\)$/, ""),
                backgroundColor: getComputedStyle(element).backgroundColor,
              }
            : { text: direct || fallbackText, textMode: mode }),
      ...(element instanceof HTMLAnchorElement
        ? { href: element.getAttribute("href") ?? "" }
        : {}),
      ...(logoId && Number.isFinite(logoScale) && logoScale > 0
        ? { logoScale }
        : {}),
      hidden:
        element.style.display === "none" || element.dataset.visualHiddenDraft === "1",
    },
  };
}

/** Applies published element patches to every public page. */
export function PublishedVisualPatches() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname.startsWith("/admin") || pathname.startsWith("/lms-admin") || pathname.startsWith("/api")) return;
    // In visual-editor mode the editor itself applies DRAFT patches —
    // re-applying published ones here would fight that preview.
    if (searchParams.get("visualEditor") === "1") return;
    let cancelled = false;
    let patches: Array<{ selector: string; data: PatchData }> = [];
    let applying = false;

    const run = () => {
      if (applying || cancelled) return;
      applying = true;
      for (const patch of patches) applyPatch(patch);
      applying = false;
    };

    fetch(`/api/visual-content?path=${encodeURIComponent(pathname)}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((json) => {
        patches = json.patches ?? [];
        run();
      })
      .catch(() => undefined);

    const observer = new MutationObserver(() => window.requestAnimationFrame(run));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname, searchParams]);

  return null;
}

/** Authenticated universal visual editor over the original public page. */
export function UniversalVisualEditor() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requested = searchParams.get("visualEditor") === "1";
  const [authenticated, setAuthenticated] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [draft, setDraft] = useState<PatchData>({});
  const [patches, setPatches] = useState<Patch[]>([]);
  const [revisions, setRevisions] = useState<Array<{ id: number; createdAt: string }>>([]);
  const [drawer, setDrawer] = useState<
    "pages" | "assets" | "blocks" | "edits" | "versions" | null
  >(null);
  const [pageAssets, setPageAssets] = useState<SelectedElement[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** True when a logo-registry draft is waiting to be published. */
  const [logoPending, setLogoPending] = useState(false);
  const hoverRef = useRef<HTMLElement | null>(null);
  const { ref: toolbarRef, pos: toolbarPos, dragging: toolbarDragging, handlers: toolbarHandlers } =
    useDraggableToolbar("stc:vtb:visual");

  const supported = useMemo(
    () => VISUAL_EDITOR_PAGES.some((page) => page.path === pathname),
    [pathname],
  );

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/admin/visual-content?path=${encodeURIComponent(pathname)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const json = await response.json();
    setPatches(json.patches ?? []);
    setRevisions(json.revisions ?? []);
    for (const patch of json.patches ?? []) {
      applyPatch({ selector: patch.selector, data: patch.draftData ?? {} }, true);
    }
  }, [pathname]);

  useEffect(() => {
    if (!requested || pathname.startsWith("/admin") || pathname.startsWith("/lms-admin")) return;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(() => {
        setAuthenticated(true);
        load();
      })
      .catch(() => router.replace("/admin/login"));
  }, [requested, pathname, router, load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  /* Leaving the editor (Home button → /admin, or the ?visualEditor=1 flag
     dropped) must fully detach the edit-mode interceptors. The listener
     effect below depends on `leftEditor` so its cleanup removes them; state
     resets happen via React's render-time derived-state pattern so no
     phantom edit mode can ever block the admin panel. */
  const leftEditor = !requested || pathname.startsWith("/admin") || pathname.startsWith("/lms-admin");
  const [prevLeftEditor, setPrevLeftEditor] = useState(leftEditor);
  if (leftEditor && !prevLeftEditor) {
    setPrevLeftEditor(true);
    setEditMode(false);
    setSelected(null);
    setDrawer(null);
  } else if (!leftEditor && prevLeftEditor) {
    setPrevLeftEditor(false);
  }

  /* Clearing a stale hover outline is a DOM side-effect, so it runs after
     commit (never during render — refs are off-limits there). */
  useEffect(() => {
    if (!leftEditor) return;
    if (hoverRef.current) {
      hoverRef.current.style.removeProperty("outline");
      hoverRef.current.style.removeProperty("outline-offset");
      hoverRef.current = null;
    }
  }, [leftEditor]);

  useEffect(() => {
    if (!authenticated || !editMode || leftEditor) return;

    const find = (target: EventTarget | null) => {
      const node = target instanceof Element ? target : null;
      if (!node || node.closest("[data-visual-ui]")) return null;
      // Structured cards are owned by News/Gallery/Staff managers. Editing
      // their rendered DOM would create a conflicting visual patch.
      if (node.closest("[data-structured-content]")) return null;
      const candidate = node.closest<HTMLElement>(SELECTABLE);
      if (!candidate || candidate.closest("[data-visual-ui]")) return null;
      if (candidate.tagName === "SPAN" && !(candidate.textContent ?? "").trim()) {
        return candidate.parentElement?.closest<HTMLElement>(SELECTABLE) ?? null;
      }
      return candidate;
    };

    const over = (event: MouseEvent) => {
      const element = find(event.target);
      if (hoverRef.current && hoverRef.current !== element) {
        hoverRef.current.style.removeProperty("outline");
        hoverRef.current.style.removeProperty("outline-offset");
      }
      if (element) {
        element.style.outline = "2px solid #ffd444";
        element.style.outlineOffset = "3px";
        hoverRef.current = element;
      }
    };

    const out = (event: MouseEvent) => {
      const element = find(event.target);
      if (element && element !== selected?.element) {
        element.style.removeProperty("outline");
        element.style.removeProperty("outline-offset");
      }
    };

    const click = (event: MouseEvent) => {
      const element = find(event.target);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      const current = elementData(element);
      const existing = patches.find((patch) => patch.selector === current.selector);
      const data = existing?.draftData
        ? { ...current.data, ...existing.draftData }
        : current.data;
      element.style.outline = "3px solid #ffd444";
      element.style.outlineOffset = "3px";
      setSelected(current);
      setDraft(data);
    };

    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("click", click, true);
      if (hoverRef.current) {
        hoverRef.current.style.removeProperty("outline");
        hoverRef.current.style.removeProperty("outline-offset");
      }
    };
    // leftEditor is included so navigating to /admin (or dropping the
    // ?visualEditor=1 flag) always detaches the capture-phase listeners —
    // without it the admin dashboard becomes unclickable.
  }, [authenticated, editMode, patches, selected, leftEditor]);

  const closeInspector = () => {
    if (selected?.element) {
      selected.element.style.removeProperty("outline");
      selected.element.style.removeProperty("outline-offset");
    }
    setSelected(null);
  };

  const openAssetNavigator = () => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main img, main video, main iframe, main [data-visual-bg]",
      ),
    ).filter(
      (element) =>
        !element.closest("[data-visual-ui]") &&
        !element.closest("[data-structured-content]"),
    );
    setPageAssets(elements.map(elementData));
    setDrawer("assets");
  };

  const selectFromNavigator = (item: SelectedElement) => {
    const existing = patches.find((patch) => patch.selector === item.selector);
    setSelected(item);
    setDraft(existing?.draftData ? { ...item.data, ...existing.draftData } : item.data);
    // Outline the LIVE node — re-resolved from the DOM with the same selector
    // contract applyPatch uses, so the React-state object is never mutated.
    const node = document.querySelector<HTMLElement>(item.selector);
    if (node) {
      node.style.outline = "3px solid #ffd444";
      node.style.outlineOffset = "3px";
    }
    item.element.scrollIntoView({ behavior: "smooth", block: "center" });
    setDrawer(null);
  };

  const save = async () => {
    if (!selected) return;
    setBusy("save");
    const response = await fetch("/api/admin/visual-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagePath: pathname,
        selector: selected.selector,
        label: selected.label,
        elementType: selected.elementType,
        data: draft,
        // Registry logos sync by ID — the backend updates the shared
        // logo row instead of a page-local patch.
        logoId: selected.logoId,
      }),
    });
    const json = await response.json();
    if (response.ok) {
      applyPatch({ selector: selected.selector, data: draft }, true);
      if (selected.logoId) {
        setLogoPending(true);
        closeInspector();
        setToast("Logo saved — synced to every page using this logo (draft)");
      } else {
        await load();
        closeInspector();
        setToast("Draft saved — press Publish to make it live");
      }
    } else setToast(json.error ?? "Unable to save edit");
    setBusy(null);
  };

  const publish = async () => {
    setBusy("publish");
    const response = await fetch("/api/admin/visual-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagePath: pathname, action: "publish" }),
    });
    if (response.ok) {
      setLogoPending(false);
      await load();
      router.refresh();
      setToast("Page edits published");
    } else {
      const json = await response.json().catch(() => ({}));
      setToast(json.error ?? "Unable to publish");
    }
    setBusy(null);
  };

  const discard = async () => {
    if (!window.confirm("Discard every element draft on this page?")) return;
    await fetch("/api/admin/visual-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagePath: pathname, action: "discard" }),
    });
    window.location.reload();
  };

  const removePatch = async (patch: Patch) => {
    if (!patch.id || !window.confirm("Remove this visual edit?")) return;
    await fetch("/api/admin/visual-content", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: patch.id, pagePath: pathname }),
    });
    setToast("Visual edit removed");
    window.setTimeout(() => window.location.reload(), 500);
  };

  const restore = async (revisionId: number) => {
    await fetch("/api/admin/visual-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagePath: pathname,
        action: "restore",
        revisionId,
      }),
    });
    setToast("Version restored as draft");
    await load();
    setDrawer(null);
  };

  if (!requested || !authenticated || pathname.startsWith("/admin") || pathname.startsWith("/lms-admin")) return null;

  const dirtyCount = patches.filter(
    (patch) =>
      JSON.stringify(patch.draftData ?? {}) !==
      JSON.stringify(patch.publishedData ?? {}),
  ).length;
  const pendingCount = dirtyCount + (logoPending ? 1 : 0);

  return (
    <div data-visual-ui>
      {/* Unpublished changes banner — impossible to miss, mobile-first */}
      {pendingCount > 0 && (
        <div className="fixed inset-x-3 top-3 z-[305] mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-amber-300/40 bg-amber-300 px-4 py-2.5 text-[#0b0b0a] shadow-2xl">
          <span className="text-[11px] font-semibold">
            {pendingCount} unpublished change{pendingCount === 1 ? "" : "s"} — the live
            site still shows the old version
          </span>
          <button
            onClick={publish}
            disabled={busy === "publish"}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0b0b0a] px-3.5 text-[10px] font-semibold text-amber-300 disabled:opacity-60"
          >
            {busy === "publish" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            Publish now
          </button>
        </div>
      )}

      {/* Floating full-site toolbar — defaults to the bottom centre, and can
          be dragged to any spot via the grip handle (double-tap resets).
          flex-wrap lets it break into two tidy rows on narrow phones so the
          Publish button can never overflow the viewport. */}
      <div
        ref={toolbarRef}
        style={toolbarPos ? { left: toolbarPos.x, top: toolbarPos.y } : undefined}
        className={`fixed z-[300] flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0b0b0a]/95 p-2 text-white shadow-2xl backdrop-blur-xl sm:gap-2.5 ${
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
          href="/admin"
          onClick={() => {
            // Exit edit mode BEFORE navigating so the admin dashboard is
            // immediately clickable and no outlines linger behind.
            setEditMode(false);
            closeInspector();
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/12 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Back to Admin Dashboard"
          title="Back to Admin Dashboard"
        >
          <Home size={14} />
        </Link>
        <button
          onClick={() => setDrawer("pages")}
          className="flex h-10 min-w-0 shrink items-center gap-1.5 rounded-xl px-2.5 text-[10px] font-semibold text-white/60 hover:bg-white/10 hover:text-white sm:px-3"
        >
          <FileText size={14} className="shrink-0 text-[#ffd444]" />
          <span className="hidden min-w-0 max-w-32 truncate sm:block">
            {VISUAL_EDITOR_PAGES.find((page) => page.path === pathname)?.title ??
              pathname}
          </span>
          <ChevronRight size={12} className="shrink-0" />
        </button>

        <span className="hidden h-6 w-px bg-white/10 sm:block" />

        <button
          onClick={() => setEditMode((value) => !value)}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[10px] font-semibold transition-colors sm:px-4 sm:text-[11px] ${
            editMode
              ? "bg-[#ffd444] text-[#0b0b0a]"
              : "border border-white/12 text-white/60 hover:text-white"
          }`}
        >
          {editMode ? <MousePointerClick size={14} /> : <Pencil size={14} />}
          {editMode ? "Edit On" : "Edit Mode"}
        </button>

        <span className="hidden h-6 w-px bg-white/10 sm:block" />

        <button
          onClick={() => setDrawer("blocks")}
          className="grid h-10 w-11 place-items-center rounded-xl bg-[#ffd444]/15 text-[#ffd444] hover:bg-[#ffd444]/25 sm:w-10"
          aria-label="Add sections and blocks"
          title="Add sections and blocks"
        >
          <Plus size={15} />
        </button>

        <button
          onClick={openAssetNavigator}
          className="grid h-10 w-11 place-items-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white sm:w-10"
          aria-label="Page images and banners"
          title="Page images and banners"
        >
          <Images size={14} />
        </button>

        <button
          onClick={() => setDrawer("edits")}
          className="grid h-10 w-11 place-items-center rounded-xl text-white/50 hover:bg-white/10 hover:text-white sm:w-10"
          aria-label="Saved edits"
          title="Saved edits"
        >
          <History size={14} />
        </button>

        <span className="hidden h-6 w-px bg-white/10 sm:block" />

        <button
          onClick={publish}
          disabled={busy === "publish" || pendingCount === 0}
          title={
            pendingCount === 0
              ? "No unpublished changes"
              : `Publish ${pendingCount} change${pendingCount === 1 ? "" : "s"} to the live site`
          }
          className={`relative inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[10px] font-semibold disabled:opacity-50 sm:px-4 sm:text-[11px] ${
            pendingCount > 0
              ? "bg-[#ffd444] text-[#0b0b0a]"
              : "border border-white/12 text-white/45"
          }`}
        >
          {busy === "publish" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Send size={13} />
          )}
          <span>Publish</span>
          {pendingCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#0b0b0a] px-1 text-[8px] font-bold text-[#ffd444]">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {editMode && !selected && (
        <div className="pointer-events-none fixed left-1/2 top-24 z-[290] -translate-x-1/2 rounded-full bg-[#ffd444] px-4 py-2 text-[10px] font-semibold text-[#0b0b0a] shadow-xl">
          Tap any heading, text, button, link or image
        </div>
      )}

      {/* Element inspector */}
      {selected && (
        <div className="fixed inset-0 z-[310] flex justify-end bg-black/45 backdrop-blur-[1px]">
          <aside className="g-panel h-full w-full max-w-[420px] overflow-y-auto border-l border-white/10 bg-[#0d0d0b] p-5 text-white shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-white/30">
                  Selected {selected.elementType}
                </p>
                <h2 className="mt-1 line-clamp-2 font-display text-xl font-semibold">
                  {selected.label}
                </h2>
              </div>
              <button
                onClick={closeInspector}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15"
              >
                <X size={15} />
              </button>
            </div>

            <div className="my-6 h-px bg-white/10" />

            {selected.elementType === "img" ||
            selected.element.hasAttribute("data-visual-bg") ? (
              <>
                <label className="block">
                  <span className="mb-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40">
                    <span className="flex items-center gap-2">
                      <ImageIcon size={11} className="text-[#ffd444]" />
                      {selected.elementType === "img"
                        ? "Image URL"
                        : selected.logoId
                          ? "Logo image (synced by ID)"
                          : "Background image"}
                    </span>
                    <MediaLibraryButton
                      preferFolder="site-assets"
                      onSelect={(picked) =>
                        setDraft((data) =>
                          selected.elementType === "img"
                            ? { ...data, src: picked.url }
                            : { ...data, backgroundImage: picked.url },
                        )
                      }
                    />
                  </span>
                  <input
                    value={
                      selected.elementType === "img"
                        ? draft.src ?? ""
                        : draft.backgroundImage ?? ""
                    }
                    onChange={(event) =>
                      setDraft((data) =>
                        selected.elementType === "img"
                          ? { ...data, src: event.target.value }
                          : { ...data, backgroundImage: event.target.value },
                      )
                    }
                    className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                  />
                </label>
                {selected.elementType === "img" && (
                  <label className="mt-5 block">
                    <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                      Alternative text
                    </span>
                    <input
                      value={draft.alt ?? ""}
                      onChange={(event) =>
                        setDraft((data) => ({ ...data, alt: event.target.value }))
                      }
                      className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                    />
                  </label>
                )}
                {selected.element.hasAttribute("data-visual-bg") && (
                  <label className="mt-5 block">
                    <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/40">
                      Background colour
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={draft.backgroundColor?.startsWith("#") ? draft.backgroundColor : "#0d0d0b"}
                        onChange={(event) =>
                          setDraft((data) => ({ ...data, backgroundColor: event.target.value }))
                        }
                        className="h-11 w-14 rounded-xl border border-white/12 bg-white/[0.05] p-1.5"
                      />
                      <input
                        value={draft.backgroundColor ?? ""}
                        onChange={(event) =>
                          setDraft((data) => ({ ...data, backgroundColor: event.target.value }))
                        }
                        className="h-11 min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                      />
                    </div>
                  </label>
                )}
                {/* Registry logo — fill-size control. Saves sync by logo ID
                    across every page that displays this logo. */}
                {selected.logoId && (
                  <div className="mt-5 rounded-xl border border-[#ffd444]/25 bg-[#ffd444]/[0.06] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] uppercase tracking-[0.18em] text-[#ffd444]">
                        Logo size in circle
                      </span>
                      <span className="font-display text-[13px] font-semibold text-white">
                        {draft.logoScale ?? 100}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={240}
                      step={5}
                      value={draft.logoScale ?? 100}
                      onChange={(event) =>
                        setDraft((data) => ({
                          ...data,
                          logoScale: Number(event.target.value),
                        }))
                      }
                      aria-label="Logo size inside its circle"
                      className="mt-3 w-full accent-[#ffd444]"
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <p className="text-[9.5px] leading-relaxed text-white/40">
                        100% fits the white circle. Changes sync to every page
                        showing this logo (ID: {selected.logoId}).
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((data) => ({ ...data, logoScale: 100 }))
                        }
                        className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[9px] font-medium text-white/55 hover:text-white"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
                {(draft.src || draft.backgroundImage) && (
                  <div className="mt-4 aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.src || draft.backgroundImage}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </>
            ) : selected.elementType === "video" || selected.elementType === "iframe" ? (
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40">
                  <Video size={11} className="text-[#ffd444]" /> Video / embed URL
                </span>
                <input
                  value={draft.src ?? ""}
                  onChange={(event) =>
                    setDraft((data) => ({ ...data, src: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                />
                <span className="mt-2 block text-[10px] leading-relaxed text-white/30">
                  YouTube embeds must use https://www.youtube.com/embed/VIDEO_ID
                </span>
              </label>
            ) : (
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40">
                  <Type size={11} className="text-[#ffd444]" /> Text content
                </span>
                <textarea
                  rows={6}
                  value={draft.text ?? ""}
                  onChange={(event) =>
                    setDraft((data) => ({ ...data, text: event.target.value }))
                  }
                  className="w-full resize-y rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-3 text-[13px] leading-relaxed text-white outline-none focus:border-[#ffd444]"
                />
              </label>
            )}

            {selected.elementType === "a" && (
              <label className="mt-5 block">
                <span className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40">
                  <Link2 size={11} className="text-[#ffd444]" /> Link destination
                </span>
                <input
                  value={draft.href ?? ""}
                  onChange={(event) =>
                    setDraft((data) => ({ ...data, href: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                />
              </label>
            )}

            <button
              onClick={() =>
                setDraft((data) => ({ ...data, hidden: !data.hidden }))
              }
              className={`mt-5 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[11px] transition-colors ${
                draft.hidden
                  ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                  : "border-white/12 text-white/50 hover:text-white"
              }`}
            >
              {draft.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
              {draft.hidden
                ? "Restore this element (visible after save)"
                : "Hide this element — layout will close the gap"}
            </button>

            <p className="mt-5 break-all rounded-xl bg-white/[0.035] p-3 font-mono text-[8px] leading-relaxed text-white/25">
              {selected.selector}
            </p>

            <button
              onClick={save}
              disabled={busy === "save"}
              className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-50"
            >
              {busy === "save" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save element draft
            </button>
          </aside>
        </div>
      )}

      {/* Pages and edits drawers */}
      {drawer && (
        <div
          onClick={() => setDrawer(null)}
          className="fixed inset-0 z-[310] flex justify-end bg-black/60 backdrop-blur-[2px]"
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            className="g-panel h-full w-full max-w-[430px] overflow-y-auto border-l border-white/10 bg-[#0d0d0b] text-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d0d0b]/95 px-5 py-4 backdrop-blur">
              <h2 className="font-display text-xl font-semibold">
                {drawer === "pages"
                  ? "Website Pages"
                  : drawer === "assets"
                    ? "Page Images & Banners"
                    : drawer === "blocks"
                      ? "Sections & Blocks Library"
                      : drawer === "versions"
                        ? "Version History"
                        : "Saved Visual Edits"}
              </h2>
              <button
                onClick={() => setDrawer(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15"
              >
                <X size={15} />
              </button>
            </div>

            {drawer === "pages" && (
              <div className="p-4">
                {Array.from(new Set(VISUAL_EDITOR_PAGES.map((page) => page.group))).map(
                  (group) => (
                    <div key={group} className="mb-6">
                      <p className="mb-2 px-2 text-[9px] uppercase tracking-[0.2em] text-[#ffd444]">
                        {group}
                      </p>
                      <div className="space-y-1.5">
                        {VISUAL_EDITOR_PAGES.filter((page) => page.group === group).map(
                          (page) => (
                            <a
                              key={page.path}
                              href={`${page.path}?visualEditor=1`}
                              className={`flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${
                                page.path === pathname
                                  ? "border-[#ffd444] bg-[#ffd444]/10"
                                  : "border-white/8 hover:border-white/20"
                              }`}
                            >
                              <FileText size={14} className="shrink-0 text-[#ffd444]" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold">
                                  {page.title}
                                </span>
                                <span className="block truncate text-[9px] text-white/30">
                                  {page.path}
                                </span>
                              </span>
                              <ChevronRight size={13} className="text-white/25" />
                            </a>
                          ),
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}

            {drawer === "blocks" && (
              <VisualBlocksPanel
                pathname={pathname}
                notify={(message) => setToast(message)}
              />
            )}

            {drawer === "assets" && (
              <div className="p-5">
                <p className="mb-4 text-[11px] leading-relaxed text-white/40">
                  Includes images hidden behind hero overlays, page banners, videos and
                  embeds. Structured News/Gallery/Staff cards are intentionally managed
                  only from their dedicated admin managers.
                </p>
                {pageAssets.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/15 py-12 text-center text-[12px] text-white/35">
                    No editable page assets found.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pageAssets.map((asset, index) => (
                      <button
                        key={`${asset.selector}-${index}`}
                        onClick={() => selectFromNavigator(asset)}
                        className="flex w-full items-center gap-3 rounded-xl border border-white/10 p-3 text-left hover:border-[#ffd444]/55 hover:bg-[#ffd444]/5"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.07] text-[#ffd444]">
                          {asset.elementType === "img" && asset.data.src ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={asset.data.src} alt="" className="h-full w-full object-cover" />
                          ) : asset.elementType === "video" || asset.elementType === "iframe" ? (
                            <Video size={15} />
                          ) : (
                            <ImageIcon size={15} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold">
                            {asset.label || `Page asset ${index + 1}`}
                          </span>
                          <span className="block truncate text-[8px] uppercase tracking-[0.12em] text-white/30">
                            {asset.elementType} · click to edit
                          </span>
                        </span>
                        <ChevronRight size={13} className="text-white/25" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {drawer === "edits" && (
              <div className="p-5">
                {patches.length === 0 ? (
                  <div className="py-14 text-center text-white/35">
                    <MousePointerClick className="mx-auto" />
                    <p className="mt-3 text-[13px]">No saved element edits yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {patches.map((patch) => (
                      <div
                        key={patch.id ?? patch.selector}
                        className="flex items-center gap-3 rounded-xl border border-white/10 p-3"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-[#ffd444]">
                          {patch.elementType === "img" ? (
                            <ImageIcon size={13} />
                          ) : (
                            <Type size={13} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold">
                            {patch.label}
                          </span>
                          <span className="block truncate font-mono text-[8px] text-white/25">
                            {patch.selector}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-[7.5px] font-bold uppercase tracking-[0.1em] ${
                            JSON.stringify(patch.draftData ?? {}) !==
                            JSON.stringify(patch.publishedData ?? {})
                              ? "bg-amber-400/15 text-amber-300"
                              : "bg-emerald-400/15 text-emerald-300"
                          }`}
                        >
                          {JSON.stringify(patch.draftData ?? {}) !==
                          JSON.stringify(patch.publishedData ?? {})
                            ? "Draft"
                            : "Live"}
                        </span>
                        <button
                          onClick={() => removePatch(patch)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-white/30 hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={discard}
                    className="rounded-full border border-white/15 px-4 py-3 text-[10px] text-white/55 hover:text-white"
                  >
                    Discard drafts
                  </button>
                  <button
                    onClick={() => setDrawer("versions")}
                    className="rounded-full border border-white/15 px-4 py-3 text-[10px] text-white/55 hover:text-white"
                  >
                    Version history
                  </button>
                </div>
              </div>
            )}

            {drawer === "versions" && (
              <div className="space-y-2 p-5">
                {revisions.length === 0 ? (
                  <p className="py-14 text-center text-[13px] text-white/35">
                    No published versions yet.
                  </p>
                ) : (
                  revisions.map((revision) => (
                    <div
                      key={revision.id}
                      className="flex items-center gap-3 rounded-xl border border-white/10 p-4"
                    >
                      <Clock3 size={14} className="shrink-0 text-[#ffd444]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold">
                          Published snapshot
                        </span>
                        <span className="text-[9px] text-white/30">
                          {new Date(revision.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <button
                        onClick={() => restore(revision.id)}
                        className="rounded-full border border-white/15 px-3 py-2 text-[9px] hover:bg-[#ffd444] hover:text-[#0b0b0a]"
                      >
                        Restore
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {toast && (
        <div className="g-fade fixed left-1/2 top-5 z-[400] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl">
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  );
}
