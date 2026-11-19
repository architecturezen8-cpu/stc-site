"use client";

import { FlipHorizontal2, ImagePlus, RotateCcw, RotateCw, Trash2, Undo2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { isUploadCancelled, xhrUpload } from "@/lib/upload-client";
import { speedLabel } from "@/components/portal/upload-progress-row";

/**
 * v3.2.1.0 — PHOTO STUDIO (the ONE profile-photo popup for every surface)
 *
 * An Instagram/WhatsApp-style editor shared by admin, principal, teacher,
 * parent, student and lms-admin profiles. Two views:
 *
 *   VIEW A · manage — the current photo (or an initials disc), "Choose photo"
 *           and "Remove photo" behind an inline confirm strip.
 *   VIEW B · editor — a square canvas viewport with drag-to-pan, wheel/pinch
 *           zoom (1–4 relative to the cover-fit base), ±90° rotate steps,
 *           horizontal flip, a WhatsApp-style circular crop mask, nine
 *           Instagram-style filter chips and five adjust sliders. A 64px
 *           live result chip at the viewport's top-right corner (re-rendered
 *           at ~10fps via rAF throttle) shows exactly what will be saved.
 *
 * ONE draw function (drawScene) renders the live viewport, the result chip
 * AND the offscreen export. Pan offsets are stored in fraction-of-size
 * units, so the export is the identical composition scaled to outputSize —
 * rotate-90 cover math included. Export goes out as JPEG through ctx.filter
 * (guarded — unsupported engines fall back to unfiltered) and uploads via
 * the shared xhrUpload engine with live progress and cancel.
 *
 * v3.3.0 — DARK THEME (owner: "e popup eka light theme ne dark theme ekata
 * hadanawada"): the studio now renders on near-black zinc-900 — the same
 * dark surface Instagram's own editor uses — so the photo is the brightest
 * thing on screen on every portal, light or dark page around it.
 */

const DEFAULT_ACCENT = "#b98a13";
const CIRCLE_R = 0.47; // crop-circle radius as a fraction of the square
const CHIP_SIZE = 64; // live result chip, css px
const CHIP_MIN_MS = 100; // ≈10fps throttle for the chip re-render
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

const RENDER_VIEW = 1;
const RENDER_CHIP = 2;

type EditorState = {
  zoom: number;
  /** Pan offsets in fraction-of-viewport-size units — scale-invariant for export. */
  offX: number;
  offY: number;
  rotation: number; // 0 | 90 | 180 | 270
  flipH: boolean;
};

const INITIAL_STATE: EditorState = { zoom: 1, offX: 0, offY: 0, rotation: 0, flipH: false };

type Adjust = { brightness: number; contrast: number; saturation: number; warmth: number; smooth: number };

const DEFAULT_ADJUST: Adjust = { brightness: 100, contrast: 100, saturation: 100, warmth: 0, smooth: 0 };

const PRESETS = [
  { id: "original", label: "Original", css: "" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.08)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.45) saturate(0.9) contrast(0.95)" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(-8deg) brightness(1.03)" },
  { id: "warm", label: "Warm", css: "sepia(0.22) saturate(1.15) brightness(1.04)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.35) contrast(1.06)" },
  { id: "fade", label: "Fade", css: "contrast(0.88) brightness(1.08) saturate(0.85)" },
  { id: "dramatic", label: "Dramatic", css: "contrast(1.25) saturate(1.12)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.3) brightness(0.92)" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

const SLIDERS: Array<{
  key: keyof Adjust;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}> = [
  { key: "brightness", label: "Brightness", min: 50, max: 150, step: 1, fmt: (v) => `${Math.round(v)}%` },
  { key: "contrast", label: "Contrast", min: 50, max: 150, step: 1, fmt: (v) => `${Math.round(v)}%` },
  { key: "saturation", label: "Saturation", min: 0, max: 200, step: 1, fmt: (v) => `${Math.round(v)}%` },
  { key: "warmth", label: "Warmth", min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}` },
  { key: "smooth", label: "Smooth", min: 0, max: 4, step: 0.1, fmt: (v) => `${v.toFixed(1)}px` },
];

type UploadResponseJson = { ok?: boolean; photoUrl?: string; avatarUrl?: string; avatar?: string; url?: string; error?: string };
type RemoveResponseJson = { ok?: boolean; error?: string };

function clampDpr(): number {
  if (typeof window === "undefined") return 1;
  const d = window.devicePixelRatio || 1;
  return Math.min(3, Math.max(1, d));
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const out = parts
    .slice(0, 2)
    .map((w) => (w[0] ?? "").toUpperCase())
    .join("");
  return out || "?";
}

/**
 * The combined ctx.filter string for one render: the preset first, then the
 * manual adjustments composed on top. `blurScale` converts the Smooth slider
 * (blur px at viewport scale) into the pixel units of the target canvas —
 * dpr for the on-screen canvases, outputSize/viewportCss for the export.
 */
function buildFilterString(presetId: PresetId, adjust: Adjust, blurScale: number): string {
  const parts: string[] = [];
  const preset = PRESETS.find((p) => p.id === presetId);
  if (preset && preset.css) parts.push(preset.css);
  if (adjust.brightness !== 100) parts.push(`brightness(${Math.round(adjust.brightness)}%)`);
  if (adjust.contrast !== 100) parts.push(`contrast(${Math.round(adjust.contrast)}%)`);
  if (adjust.saturation !== 100) parts.push(`saturate(${Math.round(adjust.saturation)}%)`);
  if (adjust.warmth > 0) {
    parts.push(`sepia(${(adjust.warmth / 140).toFixed(3)})`);
    parts.push(`hue-rotate(${(adjust.warmth * 0.12).toFixed(2)}deg)`);
  }
  if (adjust.smooth > 0) parts.push(`blur(${(adjust.smooth * blurScale).toFixed(2)}px)`);
  return parts.join(" ");
}

/**
 * The ONE scene renderer — used by the live viewport (withMask=true, dimmed
 * crop circle + white stroke) and by the result chip / export (withMask=false).
 * The image is drawn rotated/flipped about its centre, cover-fitted at the
 * given square size, panned by fraction-of-size offsets in screen space.
 */
function drawScene(
  ctx: CanvasRenderingContext2D,
  sizePx: number,
  img: HTMLImageElement,
  st: EditorState,
  filterString: string,
  withMask: boolean,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw <= 0 || ih <= 0) return;
  const rot = ((st.rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const effW = swap ? ih : iw;
  const effH = swap ? iw : ih;
  const base = Math.max(sizePx / effW, sizePx / effH); // cover fit (rotation-aware)
  const s = base * st.zoom;

  ctx.save();
  ctx.fillStyle = "#0c0c0c";
  ctx.fillRect(0, 0, sizePx, sizePx);
  ctx.translate(sizePx / 2 + st.offX * sizePx, sizePx / 2 + st.offY * sizePx);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(st.flipH ? -s : s, s);
  try {
    ctx.filter = filterString; // ignored by engines without ctx.filter
  } catch {
    /* fall back to unfiltered */
  }
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();

  if (!withMask) return;
  const r = sizePx * CIRCLE_R;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, sizePx, sizePx);
  ctx.arc(sizePx / 2, sizePx / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fill("evenodd"); // dim everything OUTSIDE the circle
  ctx.beginPath();
  ctx.arc(sizePx / 2, sizePx / 2, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1, sizePx * 0.004);
  ctx.stroke();
  ctx.restore();
}

/** Keep the image covering the square: clamp pan to the per-axis slack. */
function clampOffsets(img: HTMLImageElement, st: EditorState, vpCss: number): void {
  if (vpCss <= 0) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw <= 0 || ih <= 0) return;
  const rot = ((st.rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const effW = swap ? ih : iw;
  const effH = swap ? iw : ih;
  const base = Math.max(vpCss / effW, vpCss / effH);
  const s = base * st.zoom;
  const slackX = Math.max(0, (effW * s - vpCss) / 2) / vpCss;
  const slackY = Math.max(0, (effH * s - vpCss) / 2) / vpCss;
  st.offX = Math.min(slackX, Math.max(-slackX, st.offX));
  st.offY = Math.min(slackY, Math.max(-slackY, st.offY));
}

function renderViewport(
  canvas: HTMLCanvasElement | null,
  sizeCss: number,
  img: HTMLImageElement,
  st: EditorState,
  presetId: PresetId,
  adjust: Adjust,
  dpr: number,
): void {
  if (!canvas || sizeCss <= 0) return;
  const px = Math.max(1, Math.round(sizeCss * dpr));
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawScene(ctx, px, img, st, buildFilterString(presetId, adjust, dpr), true);
}

function renderChip(
  canvas: HTMLCanvasElement | null,
  img: HTMLImageElement,
  st: EditorState,
  presetId: PresetId,
  adjust: Adjust,
  dpr: number,
): void {
  if (!canvas) return;
  const px = Math.max(1, Math.round(CHIP_SIZE * dpr));
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawScene(ctx, px, img, st, buildFilterString(presetId, adjust, dpr), false);
}

const PS_CSS = `
/* v3.3.0 dark theme — track rests on dark zinc; the thumb keeps its white
   border so it reads against both the accent fill and the dark track. */
.ps-scroll { scrollbar-width: thin; scrollbar-color: #52525b transparent; overscroll-behavior: contain; }
.ps-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.ps-scroll::-webkit-scrollbar-track { background: transparent; }
.ps-scroll::-webkit-scrollbar-thumb { background: #52525b; border-radius: 9999px; }
.ps-range { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; margin: 0; background: transparent; cursor: pointer; }
.ps-range::-webkit-slider-runnable-track { height: 4px; border-radius: 9999px; background: linear-gradient(to right, var(--ps-accent, ${DEFAULT_ACCENT}) var(--ps-fill, 50%), #3f3f46 var(--ps-fill, 50%)); }
.ps-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; margin-top: -6px; height: 16px; width: 16px; border-radius: 9999px; background: var(--ps-accent, ${DEFAULT_ACCENT}); border: 2.5px solid #ffffff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28); }
.ps-range::-moz-range-track { height: 4px; border-radius: 9999px; background: #3f3f46; }
.ps-range::-moz-range-progress { height: 4px; border-radius: 9999px; background: var(--ps-accent, ${DEFAULT_ACCENT}); }
.ps-range::-moz-range-thumb { height: 16px; width: 16px; border-radius: 9999px; background: var(--ps-accent, ${DEFAULT_ACCENT}); border: 2.5px solid #ffffff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28); }
.ps-range:focus-visible { outline: 2px solid var(--ps-accent, ${DEFAULT_ACCENT}); outline-offset: 3px; border-radius: 9999px; }
.ps-range:disabled { opacity: 0.45; cursor: default; }
/* v2.9.15.6 compact editor — the crop viewport is capped so the filter chips,
   sliders and action row all stay on-screen WITHOUT scrolling. It shrinks on
   short viewports via the vh term and never exceeds 360px. */
.ps-vp { width: min(calc(100% - 3rem), clamp(15rem, 38vh, 22.5rem)); }
`;

export type PhotoStudioProps = {
  open: boolean;
  onClose: () => void;
  ownerName: string;
  /** Current photo display URL (null → initials disc shown). */
  currentPhotoUrl: string | null;
  initials?: string;
  /** CSS color for accents — defaults to a warm amber #b98a13-family tone. */
  accent?: string;
  upload: { endpoint: string; method?: string };
  /** Present + truthy when the photo can be removed. */
  remove?: { endpoint: string; method?: string } | null;
  /** Called with the new display URL after upload, or null after removal. */
  onDone: (displayUrl: string | null) => void;
  /** Exported square size in px, default 512. */
  outputSize?: number;
  /** Heading label, defaults "Profile photo". */
  title?: string;
  /** v2.9.15.10 — honest size badge on the manage view (owner: "profile
      images wala size ekath poddak mension karoth hodai ne"). The stored
      bytes come from the storage ledger; dimensions default to the export
      square when unknown. */
  photoMeta?: { bytes?: number | null; width?: number | null; height?: number | null } | null;
};

/** "24 KB" / "1.2 MB" — small, human. */
function fmtBytes(n?: number | null): string | null {
  if (!n || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function PhotoStudio({
  open,
  onClose,
  ownerName,
  currentPhotoUrl,
  initials,
  accent = DEFAULT_ACCENT,
  upload,
  remove = null,
  onDone,
  outputSize = 512,
  title = "Profile photo",
  photoMeta = null,
}: PhotoStudioProps) {
  /* ── refs: canvas + editor machinery ─────────────────────────────────── */
  const cardRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const stRef = useRef<EditorState>({ ...INITIAL_STATE });
  const presetRef = useRef<PresetId>("original");
  const adjustRef = useRef<Adjust>({ ...DEFAULT_ADJUST });
  const vpRef = useRef(0); // viewport css size
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const savingRef = useRef(false);
  const openRef = useRef(open);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const renderBitsRef = useRef(0);
  const rafRef = useRef(0);
  const chipLastRef = useRef(0);

  /* ── state ───────────────────────────────────────────────────────────── */
  const [view, setView] = useState<"manage" | "editor">("manage");
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<PresetId>("original");
  const [adjust, setAdjust] = useState<Adjust>({ ...DEFAULT_ADJUST });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"edit" | "saving">("edit");
  const [prog, setProg] = useState<{ pct: number; bps: number | null } | null>(null);
  const [shown, setShown] = useState(false);
  const [vpSize, setVpSize] = useState(0);

  const busy = removing || phase === "saving";
  const initialsText = initials && initials.trim() ? initials.trim() : initialsFrom(ownerName);

  /* ── render scheduler: one rAF loop, chip throttled to ~10fps ────────── */
  const renderTick = useCallback((ts: number) => {
    rafRef.current = 0;
    const bits = renderBitsRef.current;
    renderBitsRef.current = 0;
    const img = imgRef.current;
    if (!img) return;
    const dpr = clampDpr();
    if ((bits & RENDER_VIEW) !== 0) {
      renderViewport(canvasRef.current, vpRef.current, img, stRef.current, presetRef.current, adjustRef.current, dpr);
    }
    if ((bits & RENDER_CHIP) !== 0) {
      if (ts - chipLastRef.current >= CHIP_MIN_MS) {
        renderChip(chipCanvasRef.current, img, stRef.current, presetRef.current, adjustRef.current, dpr);
        chipLastRef.current = ts;
      } else {
        renderBitsRef.current |= RENDER_CHIP;
        rafRef.current = requestAnimationFrame((next) => tickRef.current(next));
      }
    }
  }, []);
  const tickRef = useRef(renderTick);

  const scheduleRender = useCallback((bits: number) => {
    renderBitsRef.current |= bits;
    if (rafRef.current === 0) rafRef.current = requestAnimationFrame((ts) => tickRef.current(ts));
  }, []);

  /* ── close paths ─────────────────────────────────────────────────────── */
  const closeRequest = useCallback(() => {
    if (removing || phase === "saving") return; // never close mid-flight
    onClose();
  }, [removing, phase, onClose]);

  /* ── remove photo (View A) ───────────────────────────────────────────── */
  const removePhoto = useCallback(async () => {
    if (!remove || !currentPhotoUrl || removing) return;
    setRemoving(true);
    setManageError(null);
    try {
      const res = await fetch(remove.endpoint, {
        method: remove.method ?? "DELETE",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as RemoveResponseJson | null;
      if (!res.ok || json?.ok === false) {
        const statusPart = res.status ? ` (error ${res.status})` : "";
        setManageError(json?.error || `Could not remove the photo${statusPart} — try again.`);
        return;
      }
      onDone(null);
      onClose();
    } catch {
      setManageError("Network error — check the connection and try again.");
    } finally {
      setRemoving(false);
    }
  }, [remove, currentPhotoUrl, removing, onDone, onClose]);

  /* ── open/close lifecycle: reset on open, abort on close ───────────────
     React state resets via the documented adjust-on-prop-change pattern
     (during render, guarded by the previous value); the imperative half —
     aborting in-flight work, revoking the blob URL and resetting the
     editor refs — happens in the effect below. */
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      /* fresh open — reset everything back to View A */
      setImgEl(null);
      setObjectUrl(null);
      setView("manage");
      setConfirmRemove(false);
      setManageError(null);
      setSaveError(null);
      setProg(null);
      setPhase("edit");
      setPresetId("original");
      setAdjust({ ...DEFAULT_ADJUST });
      setVpSize(0);
      setShown(false);
    }
  }

  useEffect(() => {
    /* both directions — kill any in-flight upload first */
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    if (!open) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    renderBitsRef.current = 0;
    savingRef.current = false;
    imgRef.current = null;
    stRef.current = { ...INITIAL_STATE };
    vpRef.current = 0;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    /* enter animation: mount hidden, then flip on the next frame so the
       scale+fade transition actually plays */
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  /* mirror `open` for the async upload callbacks (lint: never write refs
     during render) */
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  /* unmount — abort anything in flight and free the blob URL */
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  /* ── focus: grab on open, restore on close ───────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus({ preventScroll: true });
    return () => {
      prev?.focus({ preventScroll: true });
    };
  }, [open]);

  /* ── body scroll lock while open ─────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ── Esc closes — never while removing/saving ────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (removing || phase === "saving") return;
      closeRequest();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, removing, phase, closeRequest]);

  /* ── viewport measurement (dpr-scaled canvas backing store) ──────────── */
  useEffect(() => {
    if (view !== "editor" || !imgEl) return;
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const size = Math.round(el.clientWidth);
      if (size > 0 && size !== vpRef.current) {
        vpRef.current = size;
        setVpSize(size);
        scheduleRender(RENDER_VIEW | RENDER_CHIP);
      }
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, imgEl, scheduleRender]);

  /* first paint / re-measure of the editor canvases */
  useEffect(() => {
    if (open && view === "editor" && imgEl) scheduleRender(RENDER_VIEW | RENDER_CHIP);
  }, [open, view, imgEl, vpSize, scheduleRender]);

  /* mirror the React-side filter state into refs the rAF loop reads */
  useEffect(() => {
    presetRef.current = presetId;
    scheduleRender(RENDER_VIEW | RENDER_CHIP);
  }, [presetId, scheduleRender]);
  useEffect(() => {
    adjustRef.current = adjust;
    scheduleRender(RENDER_VIEW | RENDER_CHIP);
  }, [adjust, scheduleRender]);

  /* ── wheel zoom (non-passive so preventDefault sticks) ───────────────── */
  useEffect(() => {
    if (view !== "editor" || !imgEl) return;
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = stRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      st.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, st.zoom * factor));
      clampOffsets(imgEl, st, vpRef.current);
      scheduleRender(RENDER_VIEW | RENDER_CHIP);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view, imgEl, scheduleRender]);

  /* ── file picking ────────────────────────────────────────────────────── */
  const openFilePicker = () => {
    fileRef.current?.click();
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow re-picking the same file via Replace
    onFileChosen(file);
  };

  const onFileChosen = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setView("manage");
      setManageError("Please pick an image file — JPG, PNG or WebP.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setObjectUrl(url);
    setManageError(null);
    setSaveError(null);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      stRef.current = { ...INITIAL_STATE };
      setPresetId("original");
      setAdjust({ ...DEFAULT_ADJUST });
      setSaveError(null);
      setImgEl(img);
      setView("editor");
    };
    img.onerror = () => {
      if (objectUrlRef.current === url) {
        URL.revokeObjectURL(url);
        objectUrlRef.current = null;
        setObjectUrl(null);
      }
      imgRef.current = null;
      setImgEl(null);
      setView("manage");
      setManageError("That file could not be opened as an image.");
    };
    img.src = url;
  };

  /* ── viewport gestures: pan (1 pointer), pinch zoom (2 pointers) ─────── */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "saving" || !imgEl) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      if (a && b) {
        pinchRef.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          zoom: stRef.current.zoom,
        };
      }
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "saving" || !imgEl) return;
    const pts = pointersRef.current;
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, cur);
    const st = stRef.current;
    if (pts.size >= 2 && pinchRef.current) {
      const [a, b] = Array.from(pts.values());
      if (a && b) {
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        st.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchRef.current.zoom * (dist / pinchRef.current.dist)));
      }
    } else if (vpRef.current > 0) {
      st.offX += (cur.x - prev.x) / vpRef.current;
      st.offY += (cur.y - prev.y) / vpRef.current;
    }
    clampOffsets(imgEl, st, vpRef.current);
    scheduleRender(RENDER_VIEW | RENDER_CHIP);
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  /* ── transform tools ─────────────────────────────────────────────────── */
  const rotateBy = (dir: 1 | -1) => {
    const img = imgRef.current;
    if (!img || phase === "saving") return;
    const st = stRef.current;
    st.rotation = (((st.rotation + dir * 90) % 360) + 360) % 360;
    clampOffsets(img, st, vpRef.current);
    scheduleRender(RENDER_VIEW | RENDER_CHIP);
  };

  const toggleFlip = () => {
    if (!imgRef.current || phase === "saving") return;
    stRef.current.flipH = !stRef.current.flipH;
    scheduleRender(RENDER_VIEW | RENDER_CHIP);
  };

  const resetAdjustments = () => {
    setPresetId("original");
    setAdjust({ ...DEFAULT_ADJUST }); // crop / pan / zoom / rotation stay
  };

  const backToManage = () => {
    setView("manage"); // editor state kept until replaced or closed
  };

  /* ── save: export → xhrUpload with progress + cancel ─────────────────── */
  const beginSave = () => {
    if (savingRef.current) return;
    const img = imgRef.current;
    const vp = vpRef.current;
    if (!img || vp <= 0) return;
    const out = document.createElement("canvas");
    out.width = outputSize;
    out.height = outputSize;
    const ctx = out.getContext("2d");
    if (!ctx) {
      setSaveError("This browser could not process the image — try again.");
      return;
    }
    /* the export reproduces the viewport composition exactly — same
       fraction-of-size offsets, scaled by outputSize / viewportCssSize */
    drawScene(
      ctx,
      outputSize,
      img,
      stRef.current,
      buildFilterString(presetRef.current, adjustRef.current, outputSize / vp),
      false,
    );
    out.toBlob(
      (blob: Blob | null) => {
        if (!blob) {
          setSaveError("Could not process the image — try again.");
          return;
        }
        const form = new FormData();
        form.append("file", blob, "edited.jpg");
        const handle = xhrUpload({
          url: upload.endpoint,
          method: (upload.method ?? "POST") as "POST" | "PUT" | "PATCH",
          body: form,
          onProgress: (info) => {
            if (!openRef.current) return;
            setProg({ pct: info.pct, bps: info.bytesPerSecond });
          },
        });
        abortRef.current = handle.abort;
        savingRef.current = true;
        setSaveError(null);
        setProg({ pct: 0, bps: null });
        setPhase("saving");
        handle.promise
          .then((res) => {
            if (!openRef.current) return;
            const raw: unknown = res.json;
            const json = raw && typeof raw === "object" ? (raw as UploadResponseJson) : null;
            if (!res.ok || json?.ok === false) {
              const statusPart = res.status ? ` (error ${res.status})` : "";
              setSaveError(json?.error || `Upload failed${statusPart} — try again.`);
              setPhase("edit");
              setProg(null);
              return;
            }
            const displayUrl = [json?.photoUrl, json?.avatarUrl, json?.avatar, json?.url].find(
              (u): u is string => typeof u === "string" && u.length > 0,
            );
            if (!displayUrl) {
              setSaveError("The server did not return a photo URL — try again.");
              setPhase("edit");
              setProg(null);
              return;
            }
            onDone(displayUrl);
            onClose();
          })
          .catch((err: unknown) => {
            if (isUploadCancelled(err)) {
              if (openRef.current) {
                setPhase("edit");
                setProg(null);
              }
              return;
            }
            if (!openRef.current) return;
            setSaveError(err instanceof Error ? err.message : "Upload failed — check the connection and try again.");
            setPhase("edit");
            setProg(null);
          })
          .finally(() => {
            savingRef.current = false;
            if (abortRef.current === handle.abort) abortRef.current = null;
          });
      },
      "image/jpeg",
      0.92,
    );
  };

  const cancelUpload = () => {
    abortRef.current?.(); // promise rejects as cancelled → quietly back to editor
  };

  if (!open || typeof document === "undefined") return null;

  /* ── markup ──────────────────────────────────────────────────────────── */
  /* v2.9.15.6 QA fix — the dialog renders through a PORTAL to <body>.
     Inside a page, animated ancestors (pt-rise, panel shadows…) create
     stacking contexts that trap this overlay's z-index and let the sticky
     portal header paint OVER the dialog's top edge. Escaping to the body
     root puts the studio above every page chrome, exactly like the
     admin studio's own onboarding overlay. */
  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <style>{PS_CSS}</style>

      {/* backdrop — click to close (guarded while busy) */}
      <div
        aria-hidden="true"
        onClick={closeRequest}
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* card layer — click-through everywhere except the card itself */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={`pointer-events-auto flex max-h-[min(88vh,760px)] w-[calc(100vw-2rem)] max-w-[560px] flex-col overflow-hidden rounded-3xl bg-zinc-900 shadow-[0_32px_80px_-24px_rgb(0_0_0/0.9)] ring-1 ring-white/10 outline-none transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ${
            shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0"
          }`}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-zinc-100">{title}</h2>
            <button
              type="button"
              onClick={closeRequest}
              disabled={busy}
              aria-label="Close"
              title="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-40"
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </header>

          {/* grow (NOT flex-1): a basis-0 flex child collapsed to zero inside
              the auto-height card — the content vanished and the dialog
              shrank to its header alone. */}
          <div className="ps-scroll min-h-0 grow overflow-y-auto">
            {view === "editor" && imgEl ? (
              /* ── VIEW B · editor ─────────────────────────────────────── */
              <div className="px-5 pb-2 pt-3">
                {/* compact editor row: capped square viewport + vertical transform
                    tools beside it — every control visible without scrolling */}
                <div className="flex items-start justify-center gap-3">
                <div
                  ref={viewportRef}
                  aria-label="Photo crop area — drag to move, pinch or scroll to zoom"
                  className={`ps-vp relative aspect-square shrink-0 touch-none select-none overflow-hidden rounded-2xl bg-[#0c0c0c] ${
                    phase === "saving" ? "pointer-events-none" : "cursor-grab active:cursor-grabbing"
                  }`}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endPointer}
                  onPointerCancel={endPointer}
                >
                  <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
                  <div className="absolute right-3 top-3 h-16 w-16 overflow-hidden rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.5)] ring-2 ring-white/85">
                    <canvas
                      ref={chipCanvasRef}
                      role="img"
                      aria-label="Live preview of the saved photo"
                      className="h-full w-full"
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[10px] font-medium tracking-wide text-white/70 backdrop-blur-sm"
                  >
                    Drag to move · pinch or scroll to zoom
                  </div>
                </div>

                  {/* transform tools — vertical rail beside the viewport */}
                  <div role="group" aria-label="Transform tools" className="flex w-9 shrink-0 flex-col gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => rotateBy(-1)}
                      disabled={phase === "saving"}
                      aria-label="Rotate left"
                      title="Rotate left"
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => rotateBy(1)}
                      disabled={phase === "saving"}
                      aria-label="Rotate right"
                      title="Rotate right"
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <RotateCw size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleFlip}
                      disabled={phase === "saving"}
                      aria-label="Flip horizontally"
                      title="Flip horizontally"
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <FlipHorizontal2 size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={resetAdjustments}
                      disabled={phase === "saving"}
                      aria-label="Reset filters and adjustments"
                      title="Reset filters and adjustments"
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <Undo2 size={15} strokeWidth={2} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* controls freeze while the export is uploading */}
                <div
                  aria-hidden={phase === "saving"}
                  className={`mt-2 ${phase === "saving" ? "pointer-events-none opacity-60" : ""}`}
                >
                  {/* filter chips — Instagram-style row; narrowed so all nine
                      presets fit without horizontal scrolling on desktop */}
                  <div className="ps-scroll flex gap-1 overflow-x-auto pb-1">
                    {PRESETS.map((p) => {
                      const selected = presetId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPresetId(p.id)}
                          aria-pressed={selected}
                          disabled={phase === "saving"}
                          className={`flex w-[54px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-1.5 transition-colors ${
                            selected ? "bg-white/10" : "hover:bg-white/5"
                          }`}
                        >
                          <span
                            className="h-7 w-7 overflow-hidden rounded-full"
                            style={{
                              boxShadow: selected
                                ? `0 0 0 1.5px #ffffff, 0 0 0 3px ${accent}`
                                : "0 0 0 1px rgba(255,255,255,0.18)",
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={objectUrl ?? undefined}
                              alt=""
                              aria-hidden="true"
                              className="h-7 w-7 rounded-full object-cover"
                              style={{ filter: p.css || undefined }}
                            />
                          </span>
                          <span
                            className={`text-[9.5px] leading-none ${
                              selected ? "font-semibold text-zinc-50" : "font-medium text-zinc-400"
                            }`}
                          >
                            {p.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* adjust sliders — compose on top of the chosen preset */}
                  <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3">
                    {SLIDERS.map((s) => {
                      const value = adjust[s.key];
                      const fill = `${((value - s.min) / (s.max - s.min)) * 100}%`;
                      return (
                        <div key={s.key}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[10.5px] font-medium text-zinc-400">{s.label}</span>
                            <span className="text-[10.5px] font-semibold tabular-nums text-zinc-200">
                              {s.fmt(value)}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={s.min}
                            max={s.max}
                            step={s.step}
                            value={value}
                            aria-label={s.label}
                            disabled={phase === "saving"}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setAdjust((a) => {
                                const next: Adjust = { ...a };
                                next[s.key] = v;
                                return next;
                              });
                            }}
                            className="ps-range mt-1"
                            style={{ "--ps-accent": accent, "--ps-fill": fill } as CSSProperties}
                          />
                        </div>
                      );
                    })}
                  </div>

                </div>

              </div>
            ) : (
              /* ── VIEW A · manage ─────────────────────────────────────── */
              <div className="flex flex-col items-center px-5 pb-6 pt-5 text-center">
                <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
                  {currentPhotoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={currentPhotoUrl}
                      alt={`${ownerName}'s current profile photo`}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="grid h-full w-full place-items-center text-[34px] font-semibold tracking-tight"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${accent} 16%, #0c0c0c)`,
                        color: accent,
                      }}
                    >
                      {initialsText}
                    </span>
                  )}
                </div>

                <p className="mt-3.5 text-[15px] font-semibold tracking-[-0.01em] text-zinc-50">{ownerName}</p>
                {currentPhotoUrl && (photoMeta?.bytes || (photoMeta?.width && photoMeta?.height)) ? (
                  <p className="mt-1 text-[11px] font-medium tracking-wide text-zinc-500">
                    {photoMeta?.width && photoMeta?.height
                      ? `${photoMeta.width}×${photoMeta.height}`
                      : ""}
                    {fmtBytes(photoMeta?.bytes) ? `${photoMeta?.width && photoMeta?.height ? " · " : ""}${fmtBytes(photoMeta?.bytes)}` : ""}
                    {photoMeta?.bytes ? " · optimised copy" : ""}
                  </p>
                ) : null}
                <p className="mt-1 max-w-[340px] text-[12.5px] leading-relaxed text-zinc-400">
                  Tap Choose photo to crop, filter and fine-tune a new one.
                </p>
                {/*
                  v2.9.15.11 — the owner: "photo ekak upload karanna yaddi me
                  size eke photo ekak thama hodatama galapenne kiyala mension
                  karana eka" — the honest size guide sits BEFORE the picker
                  opens, so the right kind of photo goes in the first time.
                */}
                <p className="mt-2.5 max-w-[340px] rounded-xl bg-white/[0.06] px-3.5 py-2.5 text-[11px] leading-relaxed text-zinc-400">
                  <span className="font-semibold text-zinc-200">
                    Best fit: a square photo, {outputSize}&times;{outputSize} px or larger.
                  </span>{" "}
                  JPG, PNG or WebP up to 12 MB — it is saved as a small optimised WebP automatically.
                </p>

                {manageError ? (
                  <p
                    aria-live="polite"
                    className="mt-3 w-full rounded-xl bg-red-500/10 px-3 py-2 text-[11.5px] font-medium text-red-300"
                  >
                    {manageError}
                  </p>
                ) : null}

                {confirmRemove ? (
                  /* inline confirm strip before the destructive call */
                  <div className="mt-4 w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-left">
                    <p className="text-[12px] leading-relaxed text-red-200">
                      Your photo disappears everywhere it appears — the school record itself is untouched.
                    </p>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(false)}
                        disabled={removing}
                        className="h-9 rounded-full border border-white/15 bg-transparent px-4 text-[12.5px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        onClick={removePhoto}
                        disabled={removing}
                        className="inline-flex h-9 items-center gap-2 rounded-full bg-red-600 px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-60"
                      >
                        {removing ? <Spinner /> : null}
                        {removing ? "Removing…" : "Yes, remove"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={openFilePicker}
                      disabled={busy}
                      className="inline-flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      style={{ backgroundColor: accent }}
                    >
                      <ImagePlus size={15} strokeWidth={2.25} aria-hidden="true" />
                      Choose photo
                    </button>
                    {remove && currentPhotoUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          setManageError(null);
                          setConfirmRemove(true);
                        }}
                        disabled={busy}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-transparent px-5 text-[13px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                        Remove photo
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* v2.9.15.6 — the editor action row lives OUTSIDE the scroll area
              (shrink-0 footer): Back / Replace / Save photo and the upload
              progress box are reachable on ANY viewport height without
              scrolling the canvas away. */}
          {view === "editor" && imgEl ? (
            <div className="shrink-0 px-5 pb-4 pt-1.5">
              {saveError ? (
                <p
                  aria-live="polite"
                  className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11.5px] font-medium text-red-300"
                >
                  {saveError}
                </p>
              ) : (
                <p aria-live="polite" className="sr-only">
                  No errors.
                </p>
              )}

              {phase === "saving" ? (
                /* upload progress — percent, thin bar, Cancel via abort */
                <div role="status" className="rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-semibold text-zinc-200">
                      Saving photo… {prog?.pct ?? 0}%
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-medium tabular-nums text-zinc-400">
                        {speedLabel(prog?.bps ?? null)}
                      </span>
                      <button
                        type="button"
                        onClick={cancelUpload}
                        aria-label="Cancel upload"
                        className="text-[11px] font-semibold text-red-400 transition-colors hover:text-red-300 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-150 ease-out"
                      style={{ width: `${prog?.pct ?? 0}%`, backgroundColor: accent }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={backToManage}
                    className="h-10 rounded-full border border-white/15 bg-transparent px-5 text-[13px] font-semibold text-zinc-300 transition-colors hover:bg-white/10"
                  >
                    Back
                  </button>
                  <div className="ml-auto flex items-center gap-4">
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="text-[12.5px] font-semibold text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-100 hover:underline"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={beginSave}
                      className="inline-flex h-10 items-center gap-2 rounded-full px-6 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      style={{ backgroundColor: accent }}
                    >
                      Save photo
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* the ONE hidden file input — shared by Choose photo and Replace */}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onFileInputChange}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
