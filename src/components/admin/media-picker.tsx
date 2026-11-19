"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";
import {
  isUploadCancelled,
  UploadSpeedMeter,
  xhrUpload,
  type UploadHttpResponse,
} from "@/lib/upload-client";
import { speedLabel } from "@/components/portal/upload-progress-row";
import { PickOrType } from "@/components/admin/pick-or-type";
import { mergeFolderOptions } from "@/lib/media-folders";
import {
  BadgeCheck,
  FolderOpen,
  ImagePlus,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  Video,
  X,
} from "lucide-react";

export type PickedMedia = {
  /** Resolved public URL stored in the content field (URL compatibility kept). */
  url: string;
  /** Numeric asset id when the image came from the uploaded library. */
  assetId: number | null;
  title: string;
};

/**
 * Parse a fetch Response as JSON with a CLEAR message when the server
 * answers non-JSON (route missing, proxy 404/405, HTML error page) —
 * replaces the cryptic "Unexpected token 'S'/'<' … is not valid JSON"
 * SyntaxError that used to surface in the upload flow.
 * v2.8.41.1 — added after the /api/admin/media/upload route vanished twice.
 */
async function parseJsonOrUploadError(response: Response, fallbackMessage: string): Promise<unknown> {
  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(
      `${fallbackMessage} (server answered ${response.status} with a non-JSON response)`,
    );
  }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : fallbackMessage;
    throw new Error(message);
  }
  return parsed;
}

/** Wrap an XHR (upload-client) result as a real Response so the shared
 *  parseJsonOrUploadError contract above keeps working unchanged. */
function toXhrResponse(res: UploadHttpResponse): Response {
  return new Response(res.json == null ? "" : JSON.stringify(res.json), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Vercel serverless request bodies cap at ~4.5 MB — keep headroom for the
 * multipart envelope and only use the proxy-upload fallback below this size.
 */
const PROXY_MAX_BYTES = 4 * 1024 * 1024;

type LibraryAsset = {
  id: number | string;
  title: string;
  category: string;
  folder: string;
  status: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  width: number | null;
  height: number | null;
  usageCount: number;
  source?: "uploaded" | "legacy";
  variants?: Array<{ variantName: string; publicUrl: string }>;
};

/** v2.9.8.0 — what the host is allowed to choose (default stays "image"
 *  so every existing manager keeps its old behaviour untouched). */
export type MediaPickerAccept = "image" | "video" | "all";

function assetMatchesAccept(asset: LibraryAsset, accept: MediaPickerAccept): boolean {
  if (accept === "all") return true;
  const mime = (asset.mimeType || "").toLowerCase();
  const url = asset.url || asset.thumbnailUrl || "";
  const looksVideo =
    mime.startsWith("video/") ||
    /\.(mp4|m4v|webm|ogg|ogv|mov|mkv)(\?|$)/i.test(url);
  if (accept === "video") return looksVideo;
  return !looksVideo;
}

/** Client-side size guard matching the server contract (presign route). */
function maxBytesFor(file: File): number {
  return file.type.startsWith("video/")
    ? 120 * 1024 * 1024
    : 20 * 1024 * 1024;
}

function uploadDirect(
  url: string,
  file: File,
  headers: Record<string, string> | undefined,
  /** v2.8.68.1 — RAW bytes so the caller can show % AND measured speed. */
  onRawProgress: (loaded: number, total: number) => void,
): Promise<void> & { abort?: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url);
    Object.entries(headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onRawProgress(event.loaded, event.total);
      }
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Direct upload failed.")));
    xhr.onerror = () => reject(new Error("Direct upload failed."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    xhr.send(file);
  });
  const wrapped = promise as Promise<void> & { abort?: () => void };
  wrapped.abort = () => {
    try {
      xhr.abort();
    } catch {
      /* already finished */
    }
  };
  return wrapped;
}

function masterUrl(asset: LibraryAsset): string {
  if (asset.url) return asset.url;
  const master = asset.variants?.find((v) => v.variantName === "master");
  return master?.publicUrl || asset.variants?.[0]?.publicUrl || "";
}

/**
 * Phase 2.8 — Media Picker.
 * A compact, mobile-first sheet every structured manager and the universal
 * visual editor uses instead of typing raw image URLs. Manual URLs are still
 * supported by the hosts for migration compatibility.
 */
export function MediaPickerModal({
  open,
  preferFolder,
  title = "Choose from Media Library",
  accept = "image",
  onSelect,
  onClose,
  onClosed,
}: {
  open: boolean;
  preferFolder?: string;
  title?: string;
  /** v2.9.8.0 — "image" (default, unchanged everywhere) | "video" | "all". */
  accept?: MediaPickerAccept;
  onSelect: (picked: PickedMedia) => void;
  onClose: () => void;
  /** v2.8.97.0 — fires ONCE when the sheet transitions open → closed, no
   * matter which path closed it (pick, backdrop, X). The visual editor uses
   * this to suppress the phantom follow-up click: the pick closes the sheet
   * instantly but the inspector stays up until the PATCH lands, so the
   * owner's next click (aimed at ANOTHER library card) fell through onto the
   * PAGE behind and silently selected/edited a random page element — the
   * "picker elements can be clicked and edited" re-report. */
  onClosed?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const [folder, setFolder] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  /* v2.9.8.0 — the folder CHOICE step (the owner: "aluth folder ekaka hadala
     ehemath nathan danata hadala thiyana folder ekakata upload karaddi
     choos karanna option eka na — upload karana hama ekakma nikanma upload
     wenawa"). A chosen file waits in this state until the owner confirms
     the destination folder — existing pick or a brand-new folder name. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadFolder, setUploadFolder] = useState(preferFolder || "site-assets");
  /* v2.8.68.1 — measured network speed + a real cancel for the upload. */
  const [speed, setSpeed] = useState<number | null>(null);
  const uploadAbortRef = useRef<(() => void) | null>(null);
  const [canAbort, setCanAbort] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unable to load the media library.");
      setAssets(Array.isArray(json.assets) ? json.assets : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the media library.");
    } finally {
      setLoading(false);
    }
  }, []);

  /* v2.8.97.0 — one-shot closed notification. Tracked with a ref so the
     callback fires exactly once per open → close transition, whichever
     path closed the sheet (pick / backdrop / X). */
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      onClosed?.();
    }
  }, [open, onClosed]);

  /* Open-transition reset (React's render-time derived-state pattern): the
     dialog clears its query/folder and lights the spinner DURING the render
     that flips `open` — the effect below never sets state synchronously. */
  const [prevOpenSnapshot, setPrevOpenSnapshot] = useState({ open, preferFolder });
  if (open !== prevOpenSnapshot.open || preferFolder !== prevOpenSnapshot.preferFolder) {
    setPrevOpenSnapshot({ open, preferFolder });
    if (open) {
      setQuery("");
      setFolder(preferFolder ? "__prefer__" : "all");
      setLoading(true);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    /* Inline fetch continuation — the body's only state changes all happen
       after awaits (the standalone `load` stays for event handlers). */
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/media", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Unable to load the media library.");
        setAssets(Array.isArray(json.assets) ? json.assets : []);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load the media library.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const folders = useMemo(
    () => mergeFolderOptions(assets.map((asset) => asset.folder)),
    [assets],
  );

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const filtered = assets.filter((asset) => {
      /* v2.9.8.0 — image hosts never see video assets (gallery/staff/news
         pickers stay exactly as they were); video hosts see videos only. */
      if (!assetMatchesAccept(asset, accept)) return false;
      if (
        folder !== "all" &&
        folder !== "__prefer__" &&
        (asset.folder || "site-assets") !== folder
      ) {
        return false;
      }
      if (q && !`${asset.title} ${asset.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (folder === "__prefer__" && preferFolder) {
      return [...filtered].sort((a, b) => {
        const aHit = (a.folder || "") === preferFolder ? 0 : 1;
        const bHit = (b.folder || "") === preferFolder ? 0 : 1;
        return aHit - bHit;
      });
    }
    return filtered;
  }, [assets, debouncedQuery, folder, preferFolder, accept]);

  const pick = (asset: LibraryAsset) => {
    const url = masterUrl(asset);
    if (!url) return;
    onSelect({
      url,
      assetId: typeof asset.id === "number" ? asset.id : null,
      title: asset.title,
    });
  };

  const upload = async (file: File, targetFolder: string) => {
    setUploading(true);
    setError(null);
    setProgress(5);
    setSpeed(null);
    setUploadStatus("Preparing secure upload…");
    /* v2.8.68.1 — one rolling byte-rate meter per upload attempt. */
    const meter = new UploadSpeedMeter();
    const baseTitle = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const folderSlug =
      targetFolder
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 120) || "site-assets";

    try {
      const prepareResponse = await fetch("/api/admin/media/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });
      const prepare = (await parseJsonOrUploadError(
        prepareResponse,
        "Upload preparation failed.",
      )) as { mode?: string; driver?: string; url?: string; headers?: Record<string, string>; key?: string };

      let result: Response;
      if (prepare.mode === "direct") {
        if (!prepare.url) throw new Error("Upload preparation failed (missing signed URL).");
        setUploadStatus(`Uploading directly to ${String(prepare.driver).toUpperCase()}…`);
        // v2.8.67.0 — if the provider refuses the browser-direct PUT (in
        // practice: the bucket's CORS rules are missing, exactly what B2's
        // "This CORS request is not allowed" means), fall back to the
        // multipart proxy upload which flows through this server and needs
        // no CORS at all. Vercel caps serverless bodies at ~4.5 MB, so the
        // fallback only runs for files up to 4 MB.
        let directOk = true;
        const direct = uploadDirect(prepare.url, file, prepare.headers, (loaded, total) => {
          setProgress(Math.min(95, Math.round((loaded / total) * 70)));
          setSpeed(meter.sample(loaded, total).bytesPerSecond);
        });
        uploadAbortRef.current = direct.abort ?? null;
        setCanAbort(true);
        try {
          await direct;
        } catch (cause) {
          if (isUploadCancelled(cause)) throw cause; /* user asked to stop */
          directOk = false;
          if (file.size > PROXY_MAX_BYTES) {
            throw new Error(
              "The image host refused the direct upload (bucket CORS rules are missing) and this file is too large for the automatic fallback. Fix the bucket CORS rules, then try again.",
            );
          }
          setUploadStatus("Direct upload was blocked — uploading through the server…");
        } finally {
          uploadAbortRef.current = null;
          setCanAbort(false);
        }
        if (directOk) {
          setProgress(78);
          setSpeed(null);
          setUploadStatus("Optimising image and creating WebP variants…");
          result = await fetch("/api/admin/media/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: prepare.key,
              filename: file.name,
              title: baseTitle,
              altText: baseTitle,
              caption: "",
              folder: folderSlug,
              category: "Uncategorised",
            }),
          });
        } else {
          setSpeed(null);
          setUploadStatus("Uploading through the server…");
          const form = new FormData();
          form.set("file", file);
          form.set("title", baseTitle);
          form.set("altText", baseTitle);
          form.set("caption", "");
          form.set("folder", folderSlug);
          form.set("category", "Uncategorised");
          const up = xhrUpload({
            /* v2.8.68.4 — canonical POST on the never-vanished media route
             * (the /api/admin/media/upload alias 404'd four times). */
            url: "/api/admin/media",
            method: "POST",
            body: form,
            /* v2.8.69.0 — the proxy leg now feeds the SAME live speed + ETA
             * meter the direct leg does. */
            onProgress: (info) => {
              setProgress(Math.max(30, info.pct));
              setSpeed(info.bytesPerSecond);
            },
          });
          uploadAbortRef.current = up.abort;
          setCanAbort(true);
          try {
            result = toXhrResponse(await up.promise);
          } finally {
            uploadAbortRef.current = null;
            setCanAbort(false);
          }
        }
      } else {
        setUploadStatus("Uploading through the server…");
        const form = new FormData();
        form.set("file", file);
        form.set("title", baseTitle);
        form.set("altText", baseTitle);
        form.set("caption", "");
        form.set("folder", folderSlug);
        form.set("category", "Uncategorised");
        const up = xhrUpload({
          /* v2.8.68.4 — canonical POST on the never-vanished media route
           * (the /api/admin/media/upload alias 404'd four times). */
          url: "/api/admin/media",
          method: "POST",
          body: form,
          /* v2.8.69.0 — live speed + ETA on this leg too. */
          onProgress: (info) => {
            setProgress(Math.max(25, info.pct));
            setSpeed(info.bytesPerSecond);
          },
        });
        uploadAbortRef.current = up.abort;
        setCanAbort(true);
        try {
          result = toXhrResponse(await up.promise);
        } finally {
          uploadAbortRef.current = null;
          setCanAbort(false);
        }
      }

      const json = (await parseJsonOrUploadError(result, "Image processing failed.")) as {
        error?: string;
        duplicate?: boolean;
        asset?: { id?: number; title?: string; url?: string };
        variants?: Array<{ variantName: string; publicUrl: string }>;
      };
      setProgress(100);
      setSpeed(null);
      setUploadStatus(json.duplicate ? "Existing file found — reused." : "Upload complete.");
      setPendingFile(null);

      const master = (json.variants || []).find(
        (v: { variantName: string; publicUrl: string }) => v.variantName === "master",
      );
      const url = master?.publicUrl || json.asset?.url || "";
      if (url) {
        /* v2.9.8.0 — refresh the list even when auto-selecting, so the
           freshly uploaded asset is in the grid next time the sheet opens. */
        void load();
        onSelect({ url, assetId: json.asset?.id ?? null, title: json.asset?.title || baseTitle });
      } else {
        setLoading(true);
        await load();
      }
    } catch (cause) {
      if (isUploadCancelled(cause)) {
        /* A cancel is not an error — calm the sheet down, reset the bar. */
        setUploadStatus("Upload cancelled.");
        setProgress(0);
        setSpeed(null);
      } else {
        setError(cause instanceof Error ? cause.message : "Upload failed.");
        setUploadStatus("Upload did not complete.");
      }
    } finally {
      uploadAbortRef.current = null;
      setUploading(false);
    }
  };

  if (!open) return null;

  // Portal to <body> so the sheet always centres on the viewport — even when
  // the button lives inside a g-panel modal (whose persistent transform makes
  // it a containing block and whose overflow-hidden would clip this sheet).
  return createPortal(
    <div
      /* v2.8.95.0 — media-library fix: the sheet portals to document.body,
         OUTSIDE the visual editor's [data-visual-ui] wrapper, so every
         library card (a <button> — selectable by the editor's SELECTABLE
         list) was being captured by the editor's document-level click
         handler: the pick applied the URL but the selection instantly
         flipped to the card itself ("SELECTED BUTTON", empty text).
         Marking the portal root as editor UI makes click / hover / submit
         / keydown capture listeners ignore everything inside the picker,
         exactly like the editor toolbar + the cine-overlay portal. */
      data-visual-ui=""
      onClick={onClose}
      className="fixed inset-0 z-[340] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="g-panel flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0d0d0b] text-white shadow-2xl sm:max-w-3xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 pb-4 sm:px-6">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/30">
              Phase 2.8 · Asset Picker
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.01em]">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ffd444] px-3.5 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              <span className="hidden sm:inline">
                {uploading ? "Uploading…" : accept === "video" ? "Upload video" : "Upload new"}
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={
                accept === "video"
                  ? "video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.m4v,.mkv,.ogv"
                  : accept === "all"
                    ? "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/x-icon,.ico,image/svg+xml,.svg,video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.m4v,.mkv,.ogv"
                    : "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/x-icon,.ico,image/svg+xml,.svg"
              }
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                /* v2.9.8.0 — NO silent auto-upload any more: the file waits
                   while the owner picks its folder (the exact complaint:
                   "hama ekakma nikanma upload wenawa"). */
                if (file.size > maxBytesFor(file)) {
                  setError(
                    file.type.startsWith("video/")
                      ? "Videos must be 120 MB or smaller."
                      : "Images must be 20 MB or smaller.",
                  );
                  return;
                }
                setError(null);
                setUploadFolder(preferFolder || "site-assets");
                setPendingFile(file);
              }}
            />
            <button
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-white/60 hover:text-white"
              aria-label="Close picker"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Search + folders */}
        <div className="space-y-3 px-5 pb-4 sm:px-6">
          <label className="flex h-11 items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.05] px-3.5">
            <Search size={14} className="shrink-0 text-white/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles or categories…"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white outline-none placeholder:text-white/30"
            />
            <button
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="grid h-7 w-7 place-items-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white"
              aria-label="Refresh"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setFolder("all")}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.12em] transition-colors ${
                folder === "all" || folder === "__prefer__"
                  ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                  : "border-white/12 text-white/45 hover:text-white"
              }`}
            >
              All media
            </button>
            {folders.map((name) => (
              <button
                key={name}
                onClick={() => setFolder(name)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.12em] transition-colors ${
                  folder === name
                    ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                    : name === preferFolder
                      ? "border-[#ffd444]/45 bg-[#ffd444]/10 text-[#ffd444]"
                      : "border-white/12 text-white/45 hover:text-white"
                }`}
              >
                <FolderOpen size={10} />
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* v2.9.8.0 — the folder-confirmation strip. The chosen file does NOT
            upload until the owner confirms the destination folder here:
            pick an existing folder or type a brand-new one (it is created
            on the fly by the upload). */}
        {pendingFile && !uploading && (
          <div className="mx-5 mb-3 rounded-xl border border-[#ffd444]/30 bg-[#ffd444]/[0.07] p-4 sm:mx-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-white">
                  {pendingFile.name}
                </p>
                <p className="mt-0.5 text-[9.5px] uppercase tracking-[0.12em] text-white/40">
                  {pendingFile.type.startsWith("video/") ? "Video" : "Image"} ·{" "}
                  {(pendingFile.size / 1024 / 1024).toFixed(1)} MB · choose where it lives
                </p>
              </div>
              <button
                onClick={() => setPendingFile(null)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-white/55 hover:text-white"
                aria-label="Remove chosen file"
              >
                <X size={13} />
              </button>
            </div>
            <div className="mt-3">
              <PickOrType
                label="Folder"
                value={uploadFolder}
                onChange={setUploadFolder}
                options={folders}
                customPlaceholder="New folder name"
              />
            </div>
            <button
              onClick={() => {
                const file = pendingFile;
                if (file) void upload(file, uploadFolder || "site-assets");
              }}
              disabled={!uploadFolder.trim()}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] text-[11.5px] font-semibold text-[#0b0b0a] disabled:opacity-40"
            >
              <Upload size={13} />
              Upload to “{uploadFolder.trim() || "…"}”
            </button>
          </div>
        )}

        {uploading && (
          <div className="mx-5 mb-3 rounded-xl border border-[#ffd444]/25 bg-[#ffd444]/10 px-4 py-3 sm:mx-6">
            <div className="flex items-center justify-between text-[10.5px] text-[#ffd444]">
              <span>{uploadStatus}</span>
              <span>
                {progress}%
                {speedLabel(speed) ? ` · ${speedLabel(speed)}` : ""}
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#ffd444] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {uploading && canAbort ? (
              <button
                type="button"
                onClick={() => uploadAbortRef.current?.()}
                className="mt-2 inline-flex items-center gap-1 rounded-full text-[10px] font-semibold text-white/50 transition-colors hover:text-red-300"
              >
                <X size={11} aria-hidden="true" /> Cancel upload
              </button>
            ) : null}
          </div>
        )}

        {error && (
          <div className="mx-5 mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[11px] text-red-300 sm:mx-6">
            {error}
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 sm:px-6">
          {loading && !assets.length ? (
            <div className="grid h-48 place-items-center text-white/35">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : visible.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visible.map((asset) => {
                const thumb = asset.thumbnailUrl || asset.url || "";
                const isVideoAsset = assetMatchesAccept(asset, "video") && accept !== "image";
                return (
                  <button
                    key={String(asset.id)}
                    onClick={() => pick(asset)}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-black text-left transition-colors hover:border-[#ffd444]/60"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-white/[0.04]">
                      {isVideoAsset ? (
                        /* v2.9.8.0 — videos render their first frame via
                           preload="metadata" (no thumbnail variant exists
                           for video — sharp cannot demux it). */
                        <video
                          src={thumb}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        />
                      ) : thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={adminGridThumbSrc(thumb)}
                          alt={asset.title}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-white/20">
                          <ImagePlus size={18} />
                        </div>
                      )}
                      {isVideoAsset && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[7.5px] font-bold uppercase tracking-[0.12em] text-[#ffd444] backdrop-blur">
                          <Video size={9} /> Video
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-[11px] font-medium text-white/85">{asset.title}</p>
                      <p className="mt-0.5 flex items-center justify-between text-[8.5px] uppercase tracking-[0.12em] text-white/30">
                        <span className="truncate">{asset.folder || "site-assets"}</span>
                        {asset.usageCount > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-emerald-400/90">
                            <BadgeCheck size={9} /> {asset.usageCount}× used
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 py-14 text-center">
              <p className="text-sm text-white/40">
                {accept === "video" ? "No videos match this filter." : "No media matches this filter."}
              </p>
              <p className="mt-1 text-[11px] text-white/25">
                Upload a new one and it will be selected automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Compact "browse library" control that sits next to an existing URL input.
 * The manual input stays available for legacy /images and external URLs.
 */
export function MediaLibraryButton({
  preferFolder,
  accept = "image",
  onSelect,
  onPickerClosed,
  className = "",
  title = "Choose from Media Library",
}: {
  preferFolder?: string;
  /** v2.9.8.0 — "image" (default) | "video" | "all". */
  accept?: MediaPickerAccept;
  onSelect: (picked: PickedMedia) => void;
  /** v2.8.97.0 — forwarded to the sheet's onClosed: lets the visual editor
   * start its phantom-click suppression window when the picker closes. */
  onPickerClosed?: () => void;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#ffd444]/40 bg-[#ffd444]/10 px-3 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#ffd444] transition-colors hover:bg-[#ffd444]/20 ${className}`}
      >
        {accept === "video" ? <Video size={11} /> : <ImagePlus size={11} />} Library
      </button>
      <MediaPickerModal
        open={open}
        preferFolder={preferFolder}
        accept={accept}
        title={title}
        onClose={() => setOpen(false)}
        onClosed={onPickerClosed}
        onSelect={(picked) => {
          setOpen(false);
          onSelect(picked);
        }}
      />
    </>
  );
}
