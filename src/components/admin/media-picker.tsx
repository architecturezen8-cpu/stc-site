"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";
import {
  BadgeCheck,
  FolderOpen,
  ImagePlus,
  Loader2,
  RefreshCw,
  Search,
  Upload,
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
  width: number | null;
  height: number | null;
  usageCount: number;
  source?: "uploaded" | "legacy";
  variants?: Array<{ variantName: string; publicUrl: string }>;
};

async function uploadDirect(
  url: string,
  file: File,
  headers: Record<string, string> | undefined,
  onProgress: (value: number) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(95, Math.round((event.loaded / event.total) * 70)));
      }
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Direct upload failed.")));
    xhr.onerror = () => reject(new Error("Direct upload failed."));
    xhr.send(file);
  });
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
  onSelect,
  onClose,
}: {
  open: boolean;
  preferFolder?: string;
  title?: string;
  onSelect: (picked: PickedMedia) => void;
  onClose: () => void;
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

  const folders = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((asset) => set.add(asset.folder || "site-assets"));
    const list = Array.from(set).sort();
    if (preferFolder && list.includes(preferFolder)) {
      return [preferFolder, ...list.filter((f) => f !== preferFolder)];
    }
    return list;
  }, [assets, preferFolder]);

  const visible = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const filtered = assets.filter((asset) => {
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
  }, [assets, debouncedQuery, folder, preferFolder]);

  const pick = (asset: LibraryAsset) => {
    const url = masterUrl(asset);
    if (!url) return;
    onSelect({
      url,
      assetId: typeof asset.id === "number" ? asset.id : null,
      title: asset.title,
    });
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(5);
    setUploadStatus("Preparing secure upload…");
    const baseTitle = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const targetFolder = preferFolder || "site-assets";

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
        try {
          await uploadDirect(prepare.url, file, prepare.headers, setProgress);
        } catch {
          directOk = false;
          if (file.size > PROXY_MAX_BYTES) {
            throw new Error(
              "The image host refused the direct upload (bucket CORS rules are missing) and this file is too large for the automatic fallback. Fix the bucket CORS rules, then try again.",
            );
          }
          setUploadStatus("Direct upload was blocked — uploading through the server…");
        }
        if (directOk) {
          setProgress(78);
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
              folder: targetFolder,
              category: "Uncategorised",
            }),
          });
        } else {
          setProgress(30);
          const form = new FormData();
          form.set("file", file);
          form.set("title", baseTitle);
          form.set("altText", baseTitle);
          form.set("caption", "");
          form.set("folder", targetFolder);
          form.set("category", "Uncategorised");
          result = await fetch("/api/admin/media/upload", { method: "POST", body: form });
        }
      } else {
        setProgress(25);
        setUploadStatus("Optimising image and creating WebP variants…");
        const form = new FormData();
        form.set("file", file);
        form.set("title", baseTitle);
        form.set("altText", baseTitle);
        form.set("caption", "");
        form.set("folder", targetFolder);
        form.set("category", "Uncategorised");
        result = await fetch("/api/admin/media/upload", { method: "POST", body: form });
      }

      const json = (await parseJsonOrUploadError(result, "Image processing failed.")) as {
        error?: string;
        duplicate?: boolean;
        asset?: { id?: number; title?: string; url?: string };
        variants?: Array<{ variantName: string; publicUrl: string }>;
      };
      setProgress(100);
      setUploadStatus(json.duplicate ? "Existing image found — reused." : "Upload complete.");

      const master = (json.variants || []).find(
        (v: { variantName: string; publicUrl: string }) => v.variantName === "master",
      );
      const url = master?.publicUrl || json.asset?.url || "";
      if (url) {
        onSelect({ url, assetId: json.asset?.id ?? null, title: json.asset?.title || baseTitle });
      } else {
        setLoading(true);
        await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
      setUploadStatus("Upload did not complete.");
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  // Portal to <body> so the sheet always centres on the viewport — even when
  // the button lives inside a g-panel modal (whose persistent transform makes
  // it a containing block and whose overflow-hidden would clip this sheet).
  return createPortal(
    <div
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
              <span className="hidden sm:inline">{uploading ? "Uploading…" : "Upload new"}</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
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

        {uploading && (
          <div className="mx-5 mb-3 rounded-xl border border-[#ffd444]/25 bg-[#ffd444]/10 px-4 py-3 sm:mx-6">
            <div className="flex items-center justify-between text-[10.5px] text-[#ffd444]">
              <span>{uploadStatus}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#ffd444] transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
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
                return (
                  <button
                    key={String(asset.id)}
                    onClick={() => pick(asset)}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-black text-left transition-colors hover:border-[#ffd444]/60"
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-white/[0.04]">
                      {thumb ? (
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
              <p className="text-sm text-white/40">No media matches this filter.</p>
              <p className="mt-1 text-[11px] text-white/25">
                Upload a new image and it will be selected automatically.
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
  onSelect,
  className = "",
  title = "Choose from Media Library",
}: {
  preferFolder?: string;
  onSelect: (picked: PickedMedia) => void;
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
        <ImagePlus size={11} /> Library
      </button>
      <MediaPickerModal
        open={open}
        preferFolder={preferFolder}
        title={title}
        onClose={() => setOpen(false)}
        onSelect={(picked) => {
          setOpen(false);
          onSelect(picked);
        }}
      />
    </>
  );
}
