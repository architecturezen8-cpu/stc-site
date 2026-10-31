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
import { DEFAULT_VIDEO_OPTIONS, isVideoUrl, resolveVideoOptions } from "@/lib/media-kind";

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
  /** v2.9.8.0 — video render options (img→video replacements + native
   *  videos). Absent flags never change how an existing video plays. */
  videoAutoplay?: boolean;
  videoLoop?: boolean;
  videoMuted?: boolean;
  videoControls?: boolean;
};

type Patch = {
  id?: number;
  selector: string;
  label?: string;
  elementType?: string;
  /** "*" rows are site-wide chrome edits (header/footer/crest). */
  pagePath?: string;
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
  /* v2.9.2.0 — the navId / footerField write-through fields are GONE: menu
     and footer items are Admin-Studio-only (MANAGED_CHROME) and can no
     longer be selected here at all. */
  /** The element's CURRENT asset/link values — the save strips any patch
      field that still equals this baseline, so unchanged src / href /
      background never freeze into the patch (Task 97, A2 + A5 sync). */
  baseline?: PatchData;
};

const SELECTABLE =
  "h1,h2,h3,h4,h5,h6,p,a,button,img,video,iframe,figcaption,li,span,td,th,dt,dd,[data-visual-bg]";

/* v2.9.2.0 — MANAGED CHROME (the owner's final policy: "visual editor eken
   mewa edit karanna bari wenna one — footer, navigation bar menu + submenu
   — ewa edit karanna puluwan admin eke footer section ekenui navigation
   section ekenui witharai"). Navbar menu items (data-nav-id) and every
   footer item (data-footer-field) are edited EXCLUSIVELY in Admin Studio
   (Admin → Navigation / Admin → Footer). The on-site visual editor never
   selects or patches them — clicking one explains where to edit it — so
   each source has exactly ONE editor and nothing can ever corrupt. */
/* v2.9.3.0 — the owner: "footer eke visual editor eken thama editable
   ewage images tikak — e tka fixx karanna": the footer's IMAGES (the
   College crest) are managed too — footer#contact img joins the managed
   contract so the picker and the asset navigator never touch them. The
   crest is changed in Admin → Footer (central registry, one source). */
/* v2.9.4.0 — the owner re-report: "footer eke visual editor ekedi eke
   background clck karama e element eka edit karanna puluwan — mn kalin
   damma images wala ewage". `footer#contact img` was too narrow: the
   footer's background area, the brand <Link> around the crest and the
   tagline spans carry NO data-footer-field, so clicking them still
   selected an editable element. The WHOLE footer is managed chrome now —
   any click inside footer#contact (background, links, spans, images,
   everything) gets the Admin-Studio explanation and can never be
   selected, outlined or patched. One editor: Admin → Footer. */
const MANAGED_CHROME = "[data-nav-id],[data-footer-field],footer#contact";

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

/* ── v2.9.8.0 — img ⇄ video conversion (hydration-safe by design) ───────
   Conversions NEVER run pre-paint (the boot script skips video-src rows);
   they run here — post-hydration in the editor canvas and in
   PublishedVisualPatches — plus SSR-side inside SiteImage via the patch
   context for keyed images. A converted node keeps the same
   data-visual-key, so the selector contract survives the tag swap. */
const COPIED_VISUAL_ATTRS = [
  "data-visual-key",
  "data-visual-media-src",
  "data-visual-image-fallback",
  "data-visual-original-src",
  "data-visual-patch-selector",
  "data-logo-id",
] as const;

function copyVisualAttrs(from: Element, to: HTMLElement) {
  for (const name of COPIED_VISUAL_ATTRS) {
    const value = from.getAttribute(name);
    if (value !== null) to.setAttribute(name, value);
  }
  const style = from.getAttribute("style");
  if (style) to.setAttribute("style", style);
  if (from.getAttribute("class")) to.setAttribute("class", from.getAttribute("class")!);
}

function convertImgToVideo(element: HTMLImageElement, data: PatchData): HTMLVideoElement {
  const video = document.createElement("video");
  copyVisualAttrs(element, video);
  video.setAttribute("data-visual-video", "1");
  /* v2.9.8.1 — remember the image this video replaces (the owner: "video
     eka ain karala aya image eka danna ba"): restoring the slot needs the
     ORIGINAL source, which no longer exists anywhere in the DOM once the
     <img> node is gone. realImageSrc unwraps the /_next/image proxy. */
  const originalImage = realImageSrc(element);
  if (originalImage) video.setAttribute("data-visual-original-src", originalImage);
  video.setAttribute("data-visual-media-src", data.src ?? "");
  video.src = data.src ?? "";
  const options = resolveVideoOptions(data);
  video.autoplay = options.autoplay;
  video.loop = options.loop;
  video.muted = options.muted; // silent autoplay is the only autoplay browsers honour
  video.playsInline = true;
  if (options.controls) video.setAttribute("controls", "");
  if (options.autoplay) video.setAttribute("autoplay", "");
  if (options.loop) video.setAttribute("loop", "");
  if (options.muted) video.setAttribute("muted", "");
  element.replaceWith(video);
  video.load();
  void video.play().catch(() => undefined);
  return video;
}

function convertVideoToImg(video: HTMLVideoElement, data: PatchData): HTMLImageElement {
  const img = document.createElement("img");
  copyVisualAttrs(video, img);
  img.removeAttribute("data-visual-video");
  /* v2.9.8.1 — an empty patch src means "revert to the image that was
     here"; the stash attribute carries it across the tag swap. A video
     src never lands on an <img> — fall back to the stash there too. */
  const stash = video.getAttribute("data-visual-original-src") ?? "";
  const restoredSrc =
    typeof data.src === "string" && data.src && !isVideoUrl(data.src)
      ? data.src
      : stash;
  img.src = restoredSrc;
  img.alt = typeof data.alt === "string" ? data.alt : "";
  img.setAttribute("data-visual-media-src", restoredSrc);
  video.replaceWith(img);
  return img;
}

/** Fire-and-forget playback — autoplay rejections are normal browser
 *  behaviour (power-saver, data-saver), never an error worth surfacing. */
function videoPlayQuietly(video: HTMLVideoElement) {
  const attempt = video.play();
  if (attempt) attempt.catch(() => undefined);
}

/** Only EXPLICIT flags touch an existing video — pages with pre-existing
 *  videos keep their current behaviour unless the owner changes an option. */
function applyExplicitVideoFlags(video: HTMLVideoElement, data: PatchData) {
  if (typeof data.videoAutoplay === "boolean") {
    if (data.videoAutoplay) video.setAttribute("autoplay", "");
    else video.removeAttribute("autoplay");
  }
  if (typeof data.videoLoop === "boolean") {
    if (data.videoLoop) video.setAttribute("loop", "");
    else video.removeAttribute("loop");
  }
  if (typeof data.videoMuted === "boolean") {
    if (data.videoMuted) video.setAttribute("muted", "");
    else video.removeAttribute("muted");
    video.muted = data.videoMuted;
  }
  if (typeof data.videoControls === "boolean") {
    if (data.videoControls) video.setAttribute("controls", "");
    else video.removeAttribute("controls");
  }
}

/** A VIDEO background on a data-visual-bg container: inject a real cover
 *  <video> as the first child (CSS url() can never carry video). */
function applyVideoBackground(element: HTMLElement, url: string) {
  let video =
    element.querySelector<HTMLVideoElement>(":scope > [data-visual-video-bg]") ??
    undefined;
  if (!video) {
    video = document.createElement("video");
    video.setAttribute("data-visual-video-bg", "1");
    video.playsInline = true;
    video.preload = "auto";
    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }
    element.insertBefore(video, element.firstChild);
  }
  video.style.position = "absolute";
  video.style.inset = "0";
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "cover";
  video.setAttribute("autoplay", "");
  video.setAttribute("loop", "");
  video.setAttribute("muted", "");
  video.muted = true; // silent autoplay
  if (video.getAttribute("src") !== url) {
    video.src = url;
    video.load();
  }
  void video.play().catch(() => undefined);
  // Hide the placeholder image/content underneath (same contract as bg images).
  Array.from(element.children).forEach((child) => {
    if (child !== video) (child as HTMLElement).style.opacity = "0";
  });
}

function removeVideoBackground(element: HTMLElement) {
  element
    .querySelector(":scope > [data-visual-video-bg]")
    ?.remove();
}

/**
 * v2.9.8.0 — the four playback toggles for replaced/embedded videos
 * (the owner's "eka adalawa ona optionsuth add karanna"). Unchecked
 * defaults match the hero-style rendering: silent, looping, self-playing,
 * no chrome.
 */
function VideoOptionToggles({
  draft,
  setDraft,
}: {
  draft: PatchData;
  setDraft: React.Dispatch<React.SetStateAction<PatchData>>;
}) {
  const items = [
    { key: "videoAutoplay" as const, label: "Autoplay" },
    { key: "videoLoop" as const, label: "Loop" },
    { key: "videoMuted" as const, label: "Muted" },
    { key: "videoControls" as const, label: "Show controls" },
  ];
  const defaults: Record<string, boolean> = {
    videoAutoplay: DEFAULT_VIDEO_OPTIONS.autoplay,
    videoLoop: DEFAULT_VIDEO_OPTIONS.loop,
    videoMuted: DEFAULT_VIDEO_OPTIONS.muted,
    videoControls: DEFAULT_VIDEO_OPTIONS.controls,
  };
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {items.map(({ key, label }) => {
        const checked = draft[key] ?? defaults[key];
        return (
          <label
            key={key}
            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-[11px] transition-colors ${
              checked
                ? "border-[#ffd444]/45 bg-[#ffd444]/10 text-white"
                : "border-white/12 text-white/50"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                setDraft((data) => ({ ...data, [key]: event.target.checked }))
              }
              className="accent-[#ffd444]"
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

function applyPatch(
  patch: { selector: string; data: PatchData; target?: Element },
  editorPreview = false,
) {
  /* v2.9.8.1 — a CONVERTED node (img⇄video) stops matching its stored
     structural selector ("… > img" vs a <video>), so the saver can hand
     us the LIVE node directly; querySelector stays the path for every
     other caller (public pass, editor load). */
  let element: HTMLElement | null = null;
  if (patch.target instanceof HTMLElement && patch.target.isConnected) {
    element = patch.target;
  } else {
    try {
      element = document.querySelector<HTMLElement>(patch.selector);
    } catch {
      return;
    }
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
    /* v2.9.8.0 — a video background swaps in a real <video> child instead
       of a CSS url() (which can never carry video). */
    if (isVideoUrl(data.backgroundImage)) {
      if (element.hasAttribute("data-visual-bg")) {
        applyVideoBackground(element, data.backgroundImage);
      }
    } else {
      if (element.hasAttribute("data-visual-bg")) {
        removeVideoBackground(element);
      }
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
    /* v2.9.8.0 — the video swap: a video src on an <img> converts the node
       to a real <video> (same visual contract, same editor key). Picking
       an image again converts straight back. */
    if (typeof data.src === "string" && data.src && isVideoUrl(data.src)) {
      const video = convertImgToVideo(element, data);
      /* v2.9.8.1 — remember WHICH patch row owns this slot. A structural
         selector ("… > img") stops matching once the node is a <video>,
         and re-computing it builds "… > video" — a brand-new row — so
         restoring could never update the original video row (the owner's
         "video eka ain karala aya image eka danna ba" bug). */
      if (patch.selector)
        video.setAttribute("data-visual-patch-selector", patch.selector);
      return;
    }
    if (typeof data.src === "string" && data.src) {
      // Next.js <Image> renders a srcset that always wins over src — strip it
      // (and sizes) so a patched image actually replaces the original one.
      element.removeAttribute("srcset");
      element.removeAttribute("sizes");
      element.src = data.src;
    }
    if (typeof data.alt === "string") element.alt = data.alt;
  }
  if (element instanceof HTMLVideoElement) {
    /* v2.9.8.1 — a CONVERTED image slot (data-visual-video="1") flips
       straight back to an <img> when the patch src becomes an image URL
       or is cleared. This is the owner's restore path: without it the
       editor preview kept playing the video after the URL was emptied and
       raw (non-SiteImage) images could NEVER revert on the public page.
       Native page videos carry no marker and are never touched. */
    if (
      element.hasAttribute("data-visual-video") &&
      typeof data.src === "string" &&
      (!data.src || !isVideoUrl(data.src))
    ) {
      convertVideoToImg(element, data);
      return;
    }
    /* Only reload when the source ACTUALLY changed — applyPatch re-runs on
       every MutationObserver tick, and an unconditional load() would
       restart playback forever. */
    if (typeof data.src === "string" && data.src && element.getAttribute("src") !== data.src) {
      element.src = data.src;
      element.load();
      void videoPlayQuietly(element);
    }
    applyExplicitVideoFlags(element, data);
  }
  if (
    element instanceof HTMLIFrameElement &&
    typeof data.src === "string" &&
    data.src
  ) {
    element.src = data.src;
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
  const isVideo = element instanceof HTMLVideoElement;
  const isMedia =
    isImage ||
    isVideo ||
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
  /* v2.9.2.0 — data-nav-id / data-footer-field elements never reach
     elementData (blocked in find() as MANAGED_CHROME). */
  const logoScale = Number(element.getAttribute("data-logo-scale"));
  /* v2.9.8.0 — live video render options ride with the src so the inspector
     shows the element's ACTUAL playback state and save() can strip any
     flag the owner left unchanged. */
  const videoFlags: PatchData = isVideo
    ? {
        videoAutoplay: element.hasAttribute("autoplay"),
        videoLoop: element.hasAttribute("loop"),
        videoMuted: element.muted || element.hasAttribute("muted"),
        videoControls: element.hasAttribute("controls"),
      }
    : {};
  const mediaData: PatchData = isImage
    ? { src: realImageSrc(element), alt: element.alt }
    : isVideo || element instanceof HTMLIFrameElement
      ? { src: element.getAttribute("src") ?? "", ...videoFlags }
      : element.hasAttribute("data-visual-bg")
        ? {
            backgroundImage:
              /* v2.9.8.0 — an injected background video IS the current
                 background; report its src, not the old CSS image. */
              element.querySelector(":scope > [data-visual-video-bg]")?.getAttribute("src") ||
              element.dataset.visualBg ||
              getComputedStyle(element).backgroundImage
                .replace(/^url\(["']?/, "")
                .replace(/["']?\)$/, ""),
            backgroundColor: getComputedStyle(element).backgroundColor,
          }
        : {};
  const anchorData: PatchData =
    element instanceof HTMLAnchorElement
      ? { href: element.getAttribute("href") ?? "" }
      : {};
  /* Baseline = what the element shows RIGHT NOW. Only keys that differ
     from this at save time are written into the patch. */
  const baseline: PatchData = {};
  if (typeof mediaData.src === "string") baseline.src = mediaData.src;
  if (typeof mediaData.backgroundImage === "string")
    baseline.backgroundImage = mediaData.backgroundImage;
  if (typeof mediaData.backgroundColor === "string")
    baseline.backgroundColor = mediaData.backgroundColor;
  if (typeof anchorData.href === "string") baseline.href = anchorData.href;
  /* v2.9.8.0 — video flags participate in the same strip-unchanged rule. */
  for (const key of ["videoAutoplay", "videoLoop", "videoMuted", "videoControls"] as const) {
    if (typeof mediaData[key] === "boolean") baseline[key] = mediaData[key];
  }
  return {
    selector:
      /* v2.9.8.1 — a converted node keeps the selector of the patch row
         that created it; the freshly computed one would drift (img→video)
         and split the slot into a second row. */
      element.getAttribute("data-visual-patch-selector") || cssSelector(element),
    label,
    elementType: element.tagName.toLowerCase(),
    element,
    logoId,
    baseline,
    data: {
      ...(isMedia ? mediaData : { text: direct || fallbackText, textMode: mode }),
      ...anchorData,
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
  /* v2.8.98.0 — Edit Mode ALWAYS starts ON when the editor opens. The old
     sessionStorage persistence kept an old "browse" choice alive across
     visits, so the owner opened the editor, clicked a button to edit it and
     the click NAVIGATED away instead (their report: "visual editor eketh
     ehema button ekak click karama adala navigation ekata yanawa — ethakota
     button eke text eka, url eka change karanna ba"). Entering the editor
     now means editing: every link/button is static until the owner
     deliberately switches to browse mode for one look. */
  const [editMode, setEditMode] = useState(true);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [draft, setDraft] = useState<PatchData>({});
  const [patches, setPatches] = useState<Patch[]>([]);
  /* v2.9.8.1 — the re-apply observer reads patches through a ref: its rAF
     callbacks close over the effect's patches, and a save that flips a
     converted node MUST NOT be re-applied by a stale video-src row before
     load() refreshes the state (the restore flip-flop race). Synced in an
     effect — if a rAF ever reads one frame stale, the very conversion it
     wrongly re-applies mutates the DOM, reschedules the observer, and the
     now-fresh ref reverts it (convergent, self-healing). */
  const patchesRef = useRef<Patch[]>([]);
  useEffect(() => {
    patchesRef.current = patches;
  }, [patches]);
  /* v2.9.8.1 — while a save is in flight the observer must NOT re-apply
     the pre-save rows: its selector-based pass cannot reach a converted
     node ("… > img" vs a <video>), so one stale rAF would re-convert a
     freshly restored image and no later pass could undo it. */
  const observerSuppressed = useRef(false);
  const [revisions, setRevisions] = useState<Array<{ id: number; createdAt: string }>>([]);
  const [drawer, setDrawer] = useState<
    "pages" | "assets" | "blocks" | "edits" | "versions" | null
  >(null);
  const [pageAssets, setPageAssets] = useState<SelectedElement[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** True when a logo-registry draft is waiting to be published. */
  const [logoPending, setLogoPending] = useState(false);
  /* v2.8.98.0 — blocks panel pending count. Previously the Publish button
     only counted element patches, so a freshly added BLOCK left Publish
     disabled — the owner could add sections that could never go live
     (their report: "add karana ewa site eke show wenne na"). The panel
     reports its dirty-block count up here so Publish covers everything. */
  const [pendingBlocks, setPendingBlocks] = useState(0);
  const [blocksRefresh, setBlocksRefresh] = useState(0);

  /* Server-truth block pending count on editor mount — the panel only
     reports while its drawer is open, but the Publish badge must be right
     from the first paint after a reload with unpublished blocks. */
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/visual-blocks?path=${encodeURIComponent(pathname)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (cancelled) return;
        setPendingBlocks(
          (json.blocks ?? []).filter(
            (block: { draftData?: unknown; publishedData?: unknown }) =>
              JSON.stringify(block.draftData ?? {}) !==
              JSON.stringify(block.publishedData ?? {}),
          ).length,
        );
      } catch {
        /* the toolbar simply shows the patch-only count */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, pathname]);
  /* v2.8.94.0 — A5 reconciliation: Admin Studio conflicts for the selected
     element + stale (ghost) patch ids detected in the Saved-edits drawer. */
  const [conflicts, setConflicts] = useState<Array<{ source: string; label: string }>>([]);
  const [ghostIds, setGhostIds] = useState<number[]>([]);
  const auditAbort = useRef<AbortController | null>(null);
  const hoverRef = useRef<HTMLElement | null>(null);
  /* v2.8.97.0 — phantom click-through guard. A library pick closes the
     media sheet INSTANTLY but the inspector stays up until the PATCH
     returns, then everything closes at once. The owner's next click —
     aimed at ANOTHER library card — therefore landed on the PAGE behind
     and silently selected / opened the editor for a random page element
     (their "picker elements can be clicked and edited" re-report; the
     dev.log trail PATCH → audit POST → re-opened picker proves it).
     Clicks inside this window are swallowed ONCE instead of selecting. */
  const suppressClickUntil = useRef(0);
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

  /* v2.9.8.1 — the canvas is STREAMED: load() used to apply drafts ONCE,
     and a late-resolving hero (Suspense, dev compile latency, React
     re-renders replacing patched nodes) landed AFTER that single pass —
     the owner's canvas showed the ORIGINAL image while the public page
     (which re-applies through a MutationObserver) showed the video.
     Re-apply on settle, the exact contract PublishedVisualPatches uses.
     Application is idempotent, so the observer converges and stops. */
  useEffect(() => {
    if (!authenticated || leftEditor) return;
    let applying = false;
    let scheduled = false;
    const run = () => {
      if (applying || observerSuppressed.current) return;
      applying = true;
      for (const patch of patchesRef.current) {
        applyPatch(
          { selector: patch.selector, data: patch.draftData ?? {} },
          true,
        );
      }
      applying = false;
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        run();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => observer.disconnect();
  }, [authenticated, leftEditor]);

  /* v2.8.94.0 — A5 reconciliation audit: when an element is selected, ask
     the backend whether the SAME text / URL also lives in the Admin Studio
     tables (site settings, page sections, news). The inspector then warns
     that a visual patch would sit ON TOP of that managed copy. */
  const runSourceAudit = useCallback((item: SelectedElement) => {
    auditAbort.current?.abort();
    setConflicts([]);
    const text = typeof item.data.text === "string" ? item.data.text.trim() : "";
    const src = typeof item.data.src === "string" ? item.data.src.trim() : "";
    if (text.length < 12 && src.length < 12) return;
    const controller = new AbortController();
    auditAbort.current = controller;
    fetch("/api/admin/visual-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "audit",
        text: text || undefined,
        src: text ? undefined : src,
      }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : { conflicts: [] }))
      .then((json) => setConflicts(json.conflicts ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!authenticated || !editMode || leftEditor) return;
    let disposed = false;

    /* v2.9.0.0 — document-level Edit-Mode flag. RouteLoader (the black
       "Loading" navigation screen) checks this before arming its slow
       timer, so opening the inspector for a button/link is INSTANT —
       identical to a plain text element — instead of the loader covering
       the page for up to 12 s because no navigation ever completes. */
    document.documentElement.dataset.veEdit = "1";

    const find = (target: EventTarget | null) => {
      const node = target instanceof Element ? target : null;
      if (!node || node.closest("[data-visual-ui]")) return null;
      // A3: iframe shields stand in for cross-origin embeds (YouTube
      // college-song video) — a click on the shield edits the iframe
      // behind it, because clicks INSIDE the iframe never reach this
      // document at all.
      const shield = node.closest("[data-ve-shield]") as
        | (HTMLElement & { __veIframe?: HTMLIFrameElement })
        | null;
      if (shield) return shield.__veIframe ?? null;
      // Structured cards are owned by News/Gallery/Staff managers. Editing
      // their rendered DOM would create a conflicting visual patch.
      if (node.closest("[data-structured-content]")) return null;
      // v2.9.2.0 — navbar menu items + footer items are Admin-Studio-only
      // (Admin → Navigation / Admin → Footer); the picker never touches them.
      if (node.closest(MANAGED_CHROME)) return null;
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
      /* v2.8.94.0 — A1 follow-up (owner re-report): with Edit Mode ON the
         page is READ-ONLY. The interaction is neutralised BEFORE anything
         else, so a button or link can never navigate away mid-edit no
         matter what it is. Selectable elements then open the inspector,
         managed regions get the Admin-Studio toast, and any other
         interactive control (inputs, custom div "buttons"…) is paused
         with an explanation instead of silently falling through. */
      const node = event.target instanceof Element ? event.target : null;
      if (!node || node.closest("[data-visual-ui]")) return;
      /* v2.8.97.0 — inside the post-picker phantom-click window: swallow
         the click instead of letting it select a page element. */
      if (Date.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const interactive = node.closest(
        'a,button,input,select,textarea,label,summary,[role="button"],[onclick]',
      );
      event.preventDefault();
      event.stopPropagation();
      /* Structured regions (news / staff / gallery / forms / live cards)
         are owned by their Admin managers and are never patched. */
      if (node.closest("[data-structured-content]")) {
        setToast(
          "Managed from Admin Studio — this card belongs to its News / Staff / Gallery / Forms manager",
        );
        return;
      }
      /* v2.9.2.0 — navbar menu items (+ submenus) and every footer item are
         edited EXCLUSIVELY in Admin Studio; the click is already neutralised
         above, so the picker explains where to edit instead of opening an
         inspector (the owner's admin-only chrome policy). */
      if (node.closest(MANAGED_CHROME)) {
        setToast(
          "Menus & the footer are edited in Admin Studio only — Admin → Navigation / Admin → Footer",
        );
        return;
      }
      const element = find(event.target);
      if (!element) {
        if (interactive) {
          setToast(
            "Controls are paused in Edit Mode — tap the text, image or heading you want to change",
          );
        }
        return;
      }
      const current = elementData(element);
      const existing = patches.find((patch) => patch.selector === current.selector);
      const data = existing?.draftData
        ? { ...current.data, ...existing.draftData }
        : current.data;
      element.style.outline = "3px solid #ffd444";
      element.style.outlineOffset = "3px";
      setSelected(current);
      setDraft(data);
      runSourceAudit(current);
    };

    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("click", click, true);

    /* ── A3: transparent shields over cross-origin iframes ──────────────
       Clicks inside a cross-origin iframe (the college-song YouTube embed)
       never reach this document, so the capture listener saw zero events
       and the video emblem was impossible to edit. In Edit Mode every
       iframe gets an overlay div in THIS document; clicking it resolves
       back to the iframe and opens the inspector with the embed URL.
       Overlays use absolute document coordinates (glued to the page while
       scrolling) and re-sync on scroll / resize / DOM mutations. */
    type ShieldElement = HTMLDivElement & { __veIframe?: HTMLIFrameElement };
    const shields: ShieldElement[] = [];
    let shieldRaf = 0;
    const syncShields = () => {
      if (shieldRaf) return;
      shieldRaf = window.requestAnimationFrame(() => {
        shieldRaf = 0;
        if (disposed) return;
        const frames = Array.from(
          document.querySelectorAll<HTMLIFrameElement>("iframe"),
        ).filter(
          (frame) =>
            !frame.closest("[data-visual-ui]") &&
            !frame.closest("[data-structured-content]") &&
            frame.offsetWidth > 4 &&
            frame.offsetHeight > 4,
        );
        frames.forEach((frame, index) => {
          const rect = frame.getBoundingClientRect();
          let shield = shields[index];
          if (!shield) {
            shield = document.createElement("div") as ShieldElement;
            shield.setAttribute("data-ve-shield", "");
            shield.style.position = "absolute";
            shield.style.zIndex = "260";
            shield.style.background = "transparent";
            shield.style.cursor = "pointer";
            document.body.appendChild(shield);
            shields[index] = shield;
          }
          shield.__veIframe = frame;
          shield.style.left = `${rect.left + window.scrollX}px`;
          shield.style.top = `${rect.top + window.scrollY}px`;
          shield.style.width = `${rect.width}px`;
          shield.style.height = `${rect.height}px`;
          shield.style.display = "";
        });
        for (let index = frames.length; index < shields.length; index++) {
          shields[index].remove();
        }
        shields.length = frames.length;
      });
    };
    syncShields();
    const shieldObserver = new MutationObserver(syncShields);
    shieldObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", syncShields);
    window.addEventListener("scroll", syncShields, { passive: true, capture: true });

    /* Keyboard + form activations navigate without a click event — Enter
       on a focused link, or a form submit — so they are blocked too. */
    const submit = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (form?.closest("[data-visual-ui]")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const node = event.target instanceof Element ? event.target : null;
      if (!node || node.closest("[data-visual-ui]")) return;
      if (node.closest('a[href],button,[role="button"]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    /* v2.8.98.0 — middle-click / auxiliary-button clicks open links in new
       tabs WITHOUT a click event, bypassing the capture interceptor above.
       In Edit Mode buttons must be fully static, so auxclick is blocked on
       page targets too (editor UI stays unaffected). */
    const auxclick = (event: MouseEvent) => {
      const node = event.target instanceof Element ? event.target : null;
      if (!node || node.closest("[data-visual-ui]")) return;
      if (node.closest('a[href],button,[role="button"]')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("submit", submit, true);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("auxclick", auxclick, true);

    return () => {
      disposed = true;
      /* v2.9.0.0 — hand the clicks back to the site (browse mode / admin). */
      delete document.documentElement.dataset.veEdit;
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("auxclick", auxclick, true);
      if (shieldRaf) window.cancelAnimationFrame(shieldRaf);
      shieldObserver.disconnect();
      window.removeEventListener("resize", syncShields);
      window.removeEventListener("scroll", syncShields, { capture: true });
      shields.forEach((shield) => shield.remove());
      shields.length = 0;
      if (hoverRef.current) {
        hoverRef.current.style.removeProperty("outline");
        hoverRef.current.style.removeProperty("outline-offset");
      }
    };
    // leftEditor is included so navigating to /admin (or dropping the
    // ?visualEditor=1 flag) always detaches the capture-phase listeners —
    // without it the admin dashboard becomes unclickable.
  }, [authenticated, editMode, patches, selected, leftEditor, runSourceAudit]);

  const closeInspector = () => {
    if (selected?.element) {
      selected.element.style.removeProperty("outline");
      selected.element.style.removeProperty("outline-offset");
    }
    setSelected(null);
    setConflicts([]);
  };

  const openAssetNavigator = () => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        "main img, main video, main iframe, main [data-visual-bg]",
      ),
    ).filter(
      (element) =>
        !element.closest("[data-visual-ui]") &&
        !element.closest("[data-structured-content]") &&
        /* v2.9.3.0 — footer images (the crest) are Admin-Studio-managed:
           they never appear in the asset navigator either. */
        !element.closest("footer#contact"),
    );
    setPageAssets(elements.map(elementData));
    setDrawer("assets");
  };

  const selectFromNavigator = (item: SelectedElement) => {
    const existing = patches.find((patch) => patch.selector === item.selector);
    setSelected(item);
    setDraft(existing?.draftData ? { ...item.data, ...existing.draftData } : item.data);
    runSourceAudit(item);
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

  const save = async (override?: PatchData, appliedImage = false) => {
    if (!selected) return;
    setBusy("save");
    /* v2.9.8.1 — freeze the re-apply observer for the duration of this
       save (see observerSuppressed above). */
    observerSuppressed.current = true;
    /* v2.9.2.0 — the nav/footer write-through branches are GONE: those
       elements are Admin-Studio-only and can never be selected here. */
    /* v2.8.93.0 — patches no longer FREEZE unchanged assets (Task 97, A2 —
       the corrupt-on-edit + never-syncs root cause): src / href /
       background are stripped from the patch when they still equal the
       element's live values, so later logo-registry or admin changes reach
       the element. Only a deliberate change persists. */
    /* v2.8.96.0 — override: a library pick applies through this SAME path
       with the picked data in hand (React state has not flushed yet when
       the pick fires), so the canvas previews the new image immediately. */
    const data: PatchData = override ?? { ...draft };
    const base = selected.baseline;
    if (base) {
      const same = (a?: string, b?: string) => (a ?? "") === (b ?? "");
      if ("src" in data && same(data.src, base.src)) delete data.src;
      if ("href" in data && same(data.href, base.href)) delete data.href;
      if ("backgroundImage" in data && same(data.backgroundImage, base.backgroundImage))
        delete data.backgroundImage;
      if ("backgroundColor" in data && same(data.backgroundColor, base.backgroundColor))
        delete data.backgroundColor;
      /* v2.9.8.0 — video flags strip the same way: only a deliberate change
         persists. (A flag missing from the baseline counts as `undefined` —
         an explicit false CHANGES an absent flag, by design: it turns the
         hero-style default OFF.) */
      const sameFlag = (a?: boolean, b?: boolean) => (a ?? undefined) === (b ?? undefined);
      for (const key of ["videoAutoplay", "videoLoop", "videoMuted", "videoControls"] as const) {
        if (key in data && sameFlag(data[key], base[key])) delete data[key];
      }
    }
    const response = await fetch("/api/admin/visual-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pagePath: pathname,
        selector: selected.selector,
        label: selected.label,
        elementType: selected.elementType,
        data,
        // Registry logos sync by ID — the backend updates the shared
        // logo row instead of a page-local patch.
        logoId: selected.logoId,
        /* v2.9.0.0 — header/footer edits are SITE-WIDE chrome: the navbar
           and footer render on every page, so a page-scoped patch would
           look correct here and stale everywhere else (the owner's
           "footer eka corrupt" report). These land on the global "*" row
           and ride along on every page, crest-style. The public pages
           render exactly one chrome <header> (the navbar) and one
           <footer id="contact"> — both inside <main>, so the check is
           ancestor-based, not position-based. */
        scope:
          selected.element.closest("header, footer#contact")
            ? "global"
            : undefined,
      }),
    });
    const json = await response.json();
    if (response.ok) {
      /* v2.9.8.1 — optimistic local state: the re-apply observer's next rAF
         must see the SAVED data, not the pre-save rows, or it undoes the
         flip this save just applied (the video-restore race). */
      setPatches((prev) =>
        prev.map((patch) =>
          patch.selector === selected.selector
            ? { ...patch, draftData: data }
            : patch,
        ),
      );
      applyPatch(
        {
          selector: selected.selector,
          data,
          /* v2.9.8.1 — reach the LIVE node: after an img⇄video swap the
             stored selector no longer matches the tag, and the preview
             must flip in place. */
          target: selected.element,
        },
        true,
      );
      /* Release the observer only after the optimistic rows have committed
         (the ref syncs in a passive effect before paint; two frames is
         belt-and-braces), so the next pass sees the SAVED data. */
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          observerSuppressed.current = false;
        }),
      );
      /* v2.8.97.0 — the instant-apply path closes sheet + inspector only
         AFTER this PATCH returns; extend the suppression so the click that
         lands right as everything disappears is swallowed too. */
      if (appliedImage) {
        suppressClickUntil.current = Math.max(
          suppressClickUntil.current,
          Date.now() + 500,
        );
      }
      if (selected.logoId) {
        setLogoPending(true);
        closeInspector();
        setToast(
          appliedImage
            ? "Logo image applied — synced to every page using this logo (draft)"
            : "Logo saved — synced to every page using this logo (draft)",
        );
      } else {
        await load();
        closeInspector();
        setToast(
          appliedImage
            ? "Image applied — draft saved. Press Publish to make it live"
            : "Draft saved — press Publish to make it live",
        );
      }
    } else {
      observerSuppressed.current = false;
      setToast(json.error ?? "Unable to save edit");
    }
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
      /* The publish endpoint also promotes every block draft — clear the
         panel's contribution immediately, then let its reload confirm. */
      setPendingBlocks(0);
      setBlocksRefresh((value) => value + 1);
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

  /* v2.8.94.0 — A5 staleness sweep: a patch whose selector no longer
     matches anything on the page is a GHOST (its target was restructured
     or the managed section re-rendered). Surfaced in the Saved-edits
     drawer with a one-tap bulk cleanup. */
  useEffect(() => {
    if (drawer !== "edits") return;
    const frame = window.requestAnimationFrame(() => {
      const ghosts = patches
        .filter((patch) => patch.id)
        .filter((patch) => {
          try {
            return !document.querySelector(patch.selector);
          } catch {
            return true;
          }
        })
        .map((patch) => patch.id as number);
      setGhostIds(ghosts);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [drawer, patches]);

  const cleanupStale = async () => {
    if (ghostIds.length === 0) return;
    if (
      !window.confirm(
        `Remove ${ghostIds.length} stale edit${ghostIds.length === 1 ? "" : "s"}? Their target elements no longer exist on this page.`,
      )
    )
      return;
    setBusy("cleanup");
    for (const id of ghostIds) {
      await fetch("/api/admin/visual-content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pagePath: pathname }),
      });
    }
    setBusy(null);
    setGhostIds([]);
    setToast("Stale edits removed");
    await load();
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
  const pendingCount = dirtyCount + (logoPending ? 1 : 0) + pendingBlocks;

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
          Tap any heading, text, button, link, image or video
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

            {/* v2.8.94.0 — A5 reconciliation warning: the same content also
                lives in Admin Studio; a patch here would override it. */}
            {conflicts.length > 0 && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                  Also managed in Admin Studio
                </p>
                <ul className="mt-2 space-y-1">
                  {conflicts.map((conflict, index) => (
                    <li
                      key={`${conflict.source}-${index}`}
                      className="text-[11px] leading-relaxed text-white/65"
                    >
                      <span className="font-semibold text-white/90">{conflict.source}</span>
                      {" → "}
                      {conflict.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] leading-relaxed text-white/40">
                  The same content also lives there. A visual patch saved here sits ON
                  TOP of that copy — if it keeps changing from Admin Studio, edit the
                  source there instead.
                </p>
              </div>
            )}

            {selected.elementType === "img" ||
            selected.element.hasAttribute("data-visual-bg") ? (
              <>
                <label className="block">
                  <span className="mb-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40">
                    <span className="flex items-center gap-2">
                      <ImageIcon size={11} className="text-[#ffd444]" />
                      {selected.elementType === "img"
                        ? isVideoUrl(draft.src)
                          ? "Image / video URL"
                          : "Image URL"
                        : selected.logoId
                          ? "Logo image (synced by ID)"
                          : isVideoUrl(draft.backgroundImage)
                            ? "Background image / video"
                            : "Background image"}
                    </span>
                    <MediaLibraryButton
                      preferFolder="site-assets"
                      /* v2.9.8.0 — background slots also accept videos (the
                         owner: "images thiyana than walata videos replace
                         karanna"); a video URL turns the banner into a
                         silent looping video background. */
                      accept={selected.elementType === "img" ? "image" : "all"}
                      /* v2.8.97.0 — when the sheet closes (pick, backdrop or
                         X) the page behind is suddenly exposed while the
                         owner is still mid-gesture; open the phantom-click
                         suppression window so their follow-up click can
                         never silently select a page element. */
                      onPickerClosed={() => {
                        suppressClickUntil.current = Math.max(
                          suppressClickUntil.current,
                          Date.now() + 700,
                        );
                      }}
                      /* v2.8.96.0 — a library pick is a complete,
                         deliberate change, so it APPLIES immediately through
                         the same path as the Save button: the draft is
                         saved, the canvas preview updates and the toast +
                         Publish badge say what is left. Before this, a pick
                         only filled the URL input — the canvas kept the old
                         image until the owner noticed the input and pressed
                         "Save element draft", so picking LOOKED like it did
                         nothing at all (the owner's exact re-report after
                         the v2.8.95.0 selection-flip fix: private-tab check,
                         "eth e widiyatamai enne"). */
                      onSelect={(picked) => {
                        const next: PatchData =
                          selected.elementType === "img"
                            ? { ...draft, src: picked.url }
                            : { ...draft, backgroundImage: picked.url };
                        setDraft(next);
                        void save(next, true);
                      }}
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
                  {selected.element.hasAttribute("data-visual-bg") &&
                    isVideoUrl(draft.backgroundImage) && (
                      <span className="mt-2 block text-[10px] leading-relaxed text-[#ffd444]/80">
                        Video detected — this banner plays as a silent, looping
                        cover-fitted video background.
                      </span>
                    )}
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
                {/* v2.9.8.0 — REPLACE IMAGE WITH VIDEO (the owner: "page eke
                    images thiyana than walata videos replace karanna
                    wenawa"). One tap applies the swap through the same
                    save path as an image pick; the URL keeps editing in the
                    field above and an image pick swaps straight back. */}
                {selected.elementType === "img" && (
                  <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40">
                        <Video size={11} className="text-[#ffd444]" />
                        Replace with a video
                      </span>
                      <MediaLibraryButton
                        accept="video"
                        preferFolder="videos"
                        title="Choose a video from Media Library"
                        onSelect={(picked) => {
                          const next: PatchData = { ...draft, src: picked.url };
                          setDraft(next);
                          void save(next, true);
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-white/35">
                      Swap this image for a video — pick one from the library
                      (upload yours first: Admin → Media) or paste a direct
                      .mp4 / .webm URL above. Picking an image again swaps
                      straight back.
                    </p>
                    {isVideoUrl(draft.src) && (
                      <>
                        <p className="mt-3 text-[9px] uppercase tracking-[0.18em] text-white/40">
                          Playback
                        </p>
                        <VideoOptionToggles draft={draft} setDraft={setDraft} />
                      </>
                    )}
                  </div>
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
                    {isVideoUrl(draft.src || draft.backgroundImage) ? (
                      <video
                        src={draft.src || draft.backgroundImage}
                        className="h-full w-full object-cover"
                        autoPlay
                        muted
                        loop
                        playsInline
                        controls
                      />
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={draft.src || draft.backgroundImage}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                )}
              </>
            ) : selected.elementType === "video" || selected.elementType === "iframe" ? (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/40">
                    <Video size={11} className="text-[#ffd444]" />{" "}
                    {selected.element.hasAttribute("data-visual-video")
                      ? "Replaced image — video URL"
                      : "Video / embed URL"}
                  </span>
                  {/* v2.9.8.0 — swap the video file straight from the library.
                      v2.9.8.1 — a slot that USED to be an image accepts
                      images again (the owner: "aya image eka danna ba"), so
                      putting any picture back is one pick, not a puzzle. */}
                  <MediaLibraryButton
                    accept={
                      selected.element.hasAttribute("data-visual-video")
                        ? "all"
                        : "video"
                    }
                    preferFolder={
                      selected.element.hasAttribute("data-visual-video")
                        ? "site-assets"
                        : "videos"
                    }
                    title={
                      selected.element.hasAttribute("data-visual-video")
                        ? "Choose an image or video from Media Library"
                        : "Choose a video from Media Library"
                    }
                    onSelect={(picked) => {
                      const next: PatchData = { ...draft, src: picked.url };
                      setDraft(next);
                      void save(next, true);
                    }}
                  />
                </div>
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
                {/* v2.9.8.1 — RESTORE THE ORIGINAL IMAGE (the owner: "video
                    eka ain karala aya image eka danna ba"). An EMPTY src
                    reverts the slot: keyed SiteImage falls back to the
                    page's own image, converted nodes flip back via the
                    stashed original. Playback flags are dropped — an image
                    row with video flags is dead weight. Native videos (no
                    marker) never see this button. */}
                {selected.element.hasAttribute("data-visual-video") && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const next: PatchData = { ...draft, src: "" };
                        delete next.videoAutoplay;
                        delete next.videoLoop;
                        delete next.videoMuted;
                        delete next.videoControls;
                        setDraft(next);
                        void save(next, true);
                      }}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ffd444]/40 bg-[#ffd444]/[0.08] px-4 py-3 text-[11px] font-semibold text-[#ffd444] transition-colors hover:bg-[#ffd444]/[0.14]"
                    >
                      <ImageIcon size={12} />
                      Restore original image
                    </button>
                    <p className="mt-2 text-center text-[10px] leading-relaxed text-white/35">
                      Removes the video and puts the image that was here back
                      — press Publish to make it live on every page.
                    </p>
                  </>
                )}
                {selected.elementType === "video" && isVideoUrl(draft.src) && (
                  <>
                    <p className="mt-4 text-[9px] uppercase tracking-[0.18em] text-white/40">
                      Playback
                    </p>
                    <VideoOptionToggles draft={draft} setDraft={setDraft} />
                    <video
                      src={draft.src}
                      className="mt-4 aspect-video w-full rounded-xl border border-white/10 bg-black object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                      controls
                    />
                  </>
                )}
              </div>
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

            {/* v2.9.2.0 — the old "managed row" note + Save-menu/footer-item
                branches are GONE: nav & footer items are Admin-Studio-only
                and never open this inspector any more. */}
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
              onClick={() => void save()}
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
                onPendingBlocks={setPendingBlocks}
                refreshSignal={blocksRefresh}
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
                        {patch.pagePath === "*" && (
                          <span
                            className="shrink-0 rounded-full bg-[#ffd444]/15 px-2 py-1 text-[7.5px] font-bold uppercase tracking-[0.1em] text-[#ffd444]"
                            title="Site-wide edit — applies on every page"
                          >
                            All pages
                          </span>
                        )}
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
                        {patch.id && ghostIds.includes(patch.id) && (
                          <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-1 text-[7.5px] font-bold uppercase tracking-[0.1em] text-red-300">
                            Target gone
                          </span>
                        )}
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
                {/* v2.8.94.0 — A5: one-tap cleanup for ghost patches. */}
                {ghostIds.length > 0 && (
                  <button
                    onClick={cleanupStale}
                    disabled={busy === "cleanup"}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-4 py-3 text-[10px] font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {busy === "cleanup" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    Remove {ghostIds.length} stale edit{ghostIds.length === 1 ? "" : "s"} — target no longer on the page
                  </button>
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
