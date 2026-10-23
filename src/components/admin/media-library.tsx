"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { assetGridThumbSrc } from "@/lib/admin-grid-thumb";
import {
  ArchiveRestore,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileImage,
  Folder,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Images,
  Info,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

type Variant = {
  id: number;
  variantName: string;
  width: number;
  height: number;
  fileSize: number;
  publicUrl: string;
};

type Asset = {
  id: number | string;
  title: string;
  name?: string;
  url: string;
  thumbnailUrl: string;
  altText: string;
  caption: string | null;
  category: string;
  folder: string;
  provider: string;
  source: "uploaded" | "legacy";
  status: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  originalSize: number;
  dominantColor: string | null;
  blurDataUrl: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  variants: Variant[];
  usageCount: number;
  usage?: Array<{
    entityType: string;
    entityId: string | null;
    fieldName: string | null;
    pagePath: string | null;
  }>;
};

type LibraryView = "all" | "uploaded" | "legacy" | "trash";
type Orientation = "all" | "landscape" | "portrait" | "square";

const DEFAULT_FOLDERS = [
  "site-assets",
  "news",
  "gallery-campus",
  "gallery-academics",
  "gallery-sports",
  "gallery-arts",
  "staff",
  "cadeting",
  "academics",
  "sports",
];

const DEFAULT_CATEGORIES = [
  "Campus",
  "News",
  "Academics",
  "Sports",
  "Arts & Culture",
  "Portraits",
  "Cadeting",
  "Uncategorised",
];

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function orientation(asset: Asset): Exclude<Orientation, "all"> | "unknown" {
  if (!asset.width || !asset.height) return "unknown";
  const ratio = asset.width / asset.height;
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait";
  return "square";
}

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

function uploadDirect(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 70));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Direct upload failed (${request.status}).`));
    };
    request.onerror = () => reject(new Error("The direct upload connection failed."));
    request.send(file);
  });
}

export function MediaLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<LibraryView>("all");
  const [folder, setFolder] = useState("all");
  const [category, setCategory] = useState("all");
  const [orientationFilter, setOrientationFilter] =
    useState<Orientation>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async (nextView = view) => {
    setLoading(true);
    const response = await fetch(
      `/api/admin/media${nextView === "trash" ? "?view=trash" : ""}`,
      { cache: "no-store" },
    );
    const json = await response.json();
    setAssets(json.assets ?? []);
    setLoading(false);
  };

  /* View-switch spinner (React's render-time derived-state pattern): the
     loader lights up DURING the render that flips the view, so the effect
     below never has to set state synchronously. */
  const [prevView, setPrevView] = useState(view);
  if (view !== prevView) {
    setPrevView(view);
    setLoading(true);
  }

  useEffect(() => {
    /* Every state change lands in the fetch continuation — the effect body
       itself never sets state synchronously (event handlers may keep using
       `load`, whose sync spinner is fine there). */
    let cancelled = false;
    void (async () => {
      const response = await fetch(
        `/api/admin/media${view === "trash" ? "?view=trash" : ""}`,
        { cache: "no-store" },
      );
      const json = await response.json();
      if (cancelled) return;
      setAssets(json.assets ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const folders = useMemo(
    () => Array.from(new Set([...DEFAULT_FOLDERS, ...assets.map((asset) => asset.folder)])).sort(),
    [assets],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_CATEGORIES, ...assets.map((asset) => asset.category)]),
      ).sort(),
    [assets],
  );

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) counts.set(asset.folder, (counts.get(asset.folder) ?? 0) + 1);
    return counts;
  }, [assets]);

  const filtered = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      const viewMatch =
        view === "all" ||
        view === "trash" ||
        (view === "uploaded" && asset.source === "uploaded") ||
        (view === "legacy" && asset.source === "legacy");
      const folderMatch = folder === "all" || asset.folder === folder;
      const categoryMatch = category === "all" || asset.category === category;
      const orientationMatch =
        orientationFilter === "all" || orientation(asset) === orientationFilter;
      const searchMatch =
        !term ||
        asset.title.toLowerCase().includes(term) ||
        asset.altText.toLowerCase().includes(term) ||
        asset.folder.toLowerCase().includes(term) ||
        asset.category.toLowerCase().includes(term);
      return viewMatch && folderMatch && categoryMatch && orientationMatch && searchMatch;
    });
  }, [assets, view, folder, category, orientationFilter, debouncedSearch]);

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    setToast("Image URL copied");
    window.setTimeout(() => setCopied(null), 1800);
  };

  const saveMetadata = async (asset: Asset) => {
    if (typeof asset.id !== "number") return;
    setBusy(true);
    const response = await fetch("/api/admin/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: asset.id,
        title: asset.title,
        altText: asset.altText,
        caption: asset.caption ?? "",
        folder: asset.folder,
        category: asset.category,
      }),
    });
    const json = await response.json();
    if (response.ok) {
      setToast("Media details saved");
      setSelected(null);
      await load();
    } else setToast(json.error ?? "Unable to save media details");
    setBusy(false);
  };

  const trashAsset = async (asset: Asset) => {
    if (typeof asset.id !== "number") return;
    if (!window.confirm(`Move “${asset.title}” to trash?`)) return;
    const response = await fetch("/api/admin/media", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: asset.id }),
    });
    const json = await response.json();
    if (response.ok) {
      setToast("Asset moved to trash");
      setSelected(null);
      await load();
    } else setToast(json.error ?? "Unable to trash this asset");
  };

  const restoreAsset = async (asset: Asset) => {
    if (typeof asset.id !== "number") return;
    const response = await fetch("/api/admin/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: asset.id, action: "restore" }),
    });
    if (response.ok) {
      setSelected(null);
      setToast("Asset restored");
      await load("trash");
    }
  };

  return (
    <>
      <div className="grid min-h-[calc(100svh-9rem)] gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Folder navigation */}
        <aside className="hidden rounded-2xl border border-white/10 bg-[#0d0d0b] p-3 xl:block">
          <p className="px-3 pb-2 pt-2 font-sans text-[9px] font-semibold uppercase tracking-[0.22em] text-white/30">
            Library
          </p>
          <LibraryButton
            icon={Images}
            label="All Media"
            count={assets.length}
            active={view === "all" && folder === "all"}
            onClick={() => {
              setView("all");
              setFolder("all");
            }}
          />
          <LibraryButton
            icon={UploadCloud}
            label="Uploaded"
            count={assets.filter((asset) => asset.source === "uploaded").length}
            active={view === "uploaded"}
            onClick={() => {
              setView("uploaded");
              setFolder("all");
            }}
          />
          <LibraryButton
            icon={HardDrive}
            label="Legacy Assets"
            count={assets.filter((asset) => asset.source === "legacy").length}
            active={view === "legacy"}
            onClick={() => {
              setView("legacy");
              setFolder("all");
            }}
          />
          <LibraryButton
            icon={Trash2}
            label="Trash"
            active={view === "trash"}
            onClick={() => {
              setView("trash");
              setFolder("all");
            }}
          />

          <div className="my-4 h-px bg-white/10" />
          <p className="px-3 pb-2 font-sans text-[9px] font-semibold uppercase tracking-[0.22em] text-white/30">
            Folders
          </p>
          {folders.map((item) => (
            <LibraryButton
              key={item}
              icon={folder === item ? FolderOpen : Folder}
              label={item.replaceAll("-", " ")}
              count={folderCounts.get(item) ?? 0}
              active={view === "all" && folder === item}
              onClick={() => {
                setView("all");
                setFolder(item);
              }}
            />
          ))}
        </aside>

        <section className="min-w-0">
          {/* Header controls */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1 lg:max-w-md">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by title, category or folder…"
                  className="h-11 w-full rounded-full border border-white/12 bg-white/[0.05] pl-10 pr-4 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                />
              </div>
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a]"
              >
                <Plus size={15} /> Upload image
              </button>
            </div>

            {/* Mobile folder switcher — extra bottom padding keeps the thin
                scrollbar clear of the chips (spacing fix) */}
            <div className="hscroll mt-3 flex gap-2 overflow-x-auto pb-2.5 xl:hidden">
              {[
                ["all", "All"],
                ["uploaded", "Uploaded"],
                ["legacy", "Legacy"],
                ["trash", "Trash"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setView(value as LibraryView);
                    setFolder("all");
                  }}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[9px] font-medium uppercase tracking-[0.15em] ${
                    view === value
                      ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                      : "border-white/12 text-white/45"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
              <select
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                className="h-9 max-w-44 rounded-full border border-white/12 bg-[#161614] px-3 text-[10px] text-white/65 outline-none"
              >
                <option value="all">All folders</option>
                {folders.map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-9 max-w-44 rounded-full border border-white/12 bg-[#161614] px-3 text-[10px] text-white/65 outline-none"
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select
                value={orientationFilter}
                onChange={(event) =>
                  setOrientationFilter(event.target.value as Orientation)
                }
                className="h-9 rounded-full border border-white/12 bg-[#161614] px-3 text-[10px] text-white/65 outline-none"
              >
                <option value="all">Any orientation</option>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
                <option value="square">Square</option>
              </select>
              <span className="ml-auto text-[10px] text-white/30">
                {filtered.length} asset{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid min-h-72 place-items-center">
              <Loader2 className="animate-spin text-[#ffd444]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-dashed border-white/15 text-center">
              <div>
                <FileImage className="mx-auto text-white/20" />
                <p className="mt-3 text-[13px] text-white/40">
                  No media matches these filters.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => setSelected(asset)}
                  className="group min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] text-left transition-all hover:-translate-y-0.5 hover:border-[#ffd444]/60"
                >
                  <div className="relative aspect-square overflow-hidden bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetGridThumbSrc(asset)}
                      alt={asset.altText || asset.title}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 font-sans text-[7px] uppercase tracking-[0.12em] text-[#ffd444] backdrop-blur">
                      {asset.source === "uploaded" ? asset.provider : "legacy"}
                    </span>
                    <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[7px] text-white/60 backdrop-blur">
                      {asset.width && asset.height
                        ? `${asset.width}×${asset.height}`
                        : asset.mimeType.split("/")[1]?.toUpperCase() || "IMAGE"}
                    </span>
                    <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white/70 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                      <MoreHorizontal size={13} />
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[11.5px] font-semibold text-white">
                      {asset.title}
                    </p>
                    <p className="mt-0.5 truncate text-[8.5px] uppercase tracking-[0.12em] text-white/30">
                      {asset.folder.replaceAll("-", " ")} · {asset.category}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <AssetDrawer
          asset={selected}
          folders={folders}
          categories={categories}
          trashView={view === "trash"}
          busy={busy}
          copied={copied === selected.url}
          close={() => setSelected(null)}
          copy={() => copy(selected.url)}
          save={(asset) => saveMetadata(asset)}
          trash={() => trashAsset(selected)}
          restore={() => restoreAsset(selected)}
          setSelected={setSelected}
        />
      )}

      {uploadOpen && (
        <UploadModal
          folders={folders}
          categories={categories}
          close={() => setUploadOpen(false)}
          uploaded={async (message) => {
            setUploadOpen(false);
            setToast(message);
            setView("uploaded");
            setFolder("all");
            await load("uploaded");
          }}
        />
      )}

      {toast && (
        <div className="g-fade fixed left-1/2 top-5 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl">
          <Check size={14} /> {toast}
        </div>
      )}
    </>
  );
}

function LibraryButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`mb-1 flex w-full min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[11px] capitalize transition-colors ${
        active
          ? "bg-[#ffd444] font-semibold text-[#0b0b0a]"
          : "text-white/48 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <Icon size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className={active ? "text-black/50" : "text-white/25"}>{count}</span>
      )}
    </button>
  );
}

function AssetDrawer({
  asset,
  folders,
  categories,
  trashView,
  busy,
  copied,
  close,
  copy,
  save,
  trash,
  restore,
  setSelected,
}: {
  asset: Asset;
  folders: string[];
  categories: string[];
  trashView: boolean;
  busy: boolean;
  copied: boolean;
  close: () => void;
  copy: () => void;
  save: (asset: Asset) => void;
  trash: () => void;
  restore: () => void;
  setSelected: React.Dispatch<React.SetStateAction<Asset | null>>;
}) {
  const editable = asset.source === "uploaded";
  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[180] flex justify-end bg-black/65"
    >
      <aside
        onClick={(event) => event.stopPropagation()}
        className="g-panel h-full w-full max-w-[460px] overflow-y-auto border-l border-white/10 bg-[#0d0d0b] text-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0d0d0b]/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[8px] uppercase tracking-[0.18em] text-[#ffd444]">
              {editable ? "Uploaded asset" : "Legacy asset"}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold">Asset details</h2>
          </div>
          <button
            onClick={close}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/55 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>

        <div className="relative aspect-[16/11] overflow-hidden bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url || asset.thumbnailUrl}
            alt={asset.altText || asset.title}
            className="h-full w-full object-contain"
          />
          {asset.dominantColor && (
            <span
              className="absolute bottom-3 left-3 rounded-full border border-white/15 px-3 py-1 text-[8px] font-mono text-white shadow"
              style={{ backgroundColor: asset.dominantColor }}
            >
              {asset.dominantColor}
            </span>
          )}
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <label className="block">
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
              Title
            </span>
            <input
              disabled={!editable}
              value={asset.title}
              onChange={(event) =>
                setSelected({ ...asset, title: event.target.value })
              }
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[13px] text-white outline-none focus:border-[#ffd444] disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
              Alternative text
            </span>
            <textarea
              disabled={!editable}
              rows={2}
              value={asset.altText}
              onChange={(event) =>
                setSelected({ ...asset, altText: event.target.value })
              }
              className="w-full resize-none rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-3 text-[12px] leading-relaxed text-white outline-none focus:border-[#ffd444] disabled:opacity-60"
            />
          </label>

          {editable && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
                  Folder
                </span>
                <input
                  list="media-folders"
                  value={asset.folder}
                  onChange={(event) =>
                    setSelected({ ...asset, folder: event.target.value })
                  }
                  className="h-10 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3 text-[11px] text-white outline-none focus:border-[#ffd444]"
                />
                <datalist id="media-folders">
                  {folders.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </datalist>
              </label>
              <label>
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
                  Category
                </span>
                <input
                  list="media-categories"
                  value={asset.category}
                  onChange={(event) =>
                    setSelected({ ...asset, category: event.target.value })
                  }
                  className="h-10 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3 text-[11px] text-white outline-none focus:border-[#ffd444]"
                />
                <datalist id="media-categories">
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </datalist>
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-[10px]">
            <InfoRow label="Provider" value={asset.provider} />
            <InfoRow label="Format" value={asset.mimeType.split("/")[1]?.toUpperCase() || "IMAGE"} />
            <InfoRow
              label="Dimensions"
              value={asset.width && asset.height ? `${asset.width} × ${asset.height}` : "Unknown"}
            />
            <InfoRow label="Original size" value={formatBytes(asset.originalSize)} />
            <InfoRow label="Used in" value={`${asset.usageCount} places`} />
            <InfoRow label="Variants" value={String(asset.variants.length || "Legacy")} />
          </div>

          {asset.variants.length > 0 && (
            <div>
              <p className="mb-2 text-[9px] uppercase tracking-[0.18em] text-white/35">
                Responsive variants
              </p>
              <div className="overflow-hidden rounded-xl border border-white/10">
                {asset.variants.map((variant) => (
                  <div
                    key={variant.id}
                    className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5 text-[10px] last:border-b-0"
                  >
                    <span className="capitalize text-white/60">{variant.variantName}</span>
                    <span className="text-white/30">
                      {variant.width}×{variant.height} · {formatBytes(variant.fileSize)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {asset.usage && asset.usage.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-white/35">
                <Link2 size={10} className="text-emerald-400" /> Usage locations — this
                asset cannot be trashed while listed here
              </p>
              <div className="overflow-hidden rounded-xl border border-emerald-400/15">
                {asset.usage.map((row, index) => (
                  <div
                    key={`${row.entityType}-${row.entityId}-${index}`}
                    className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5 text-[10px] last:border-b-0"
                  >
                    <span className="capitalize text-white/60">{row.entityType}</span>
                    <span className="truncate text-right font-mono text-[9px] text-white/35">
                      {row.pagePath || `${row.entityType} #${row.entityId}`}
                      {row.fieldName ? ` · ${row.fieldName}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copy}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 text-[10px] font-medium text-white/60 hover:text-white"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy URL"}
            </button>
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 text-[10px] font-medium text-white/60 hover:text-white"
            >
              <ExternalLink size={12} /> Open original
            </a>
          </div>

          {editable && (
            <div className="flex gap-2 border-t border-white/10 pt-5">
              {trashView ? (
                <button
                  onClick={restore}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#ffd444] text-[11px] font-semibold text-[#0b0b0a]"
                >
                  <ArchiveRestore size={14} /> Restore asset
                </button>
              ) : (
                <>
                  <button
                    onClick={trash}
                    disabled={asset.usageCount > 0}
                    title={
                      asset.usageCount > 0
                        ? `Used in ${asset.usageCount} place${asset.usageCount === 1 ? "" : "s"} — remove those references first`
                        : "Move to trash"
                    }
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-red-400/25 text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Move to trash"
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    onClick={() => save(asset)}
                    disabled={busy}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#ffd444] text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Save details
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] uppercase tracking-[0.14em] text-white/25">{label}</p>
      <p className="mt-0.5 truncate capitalize text-white/60">{value}</p>
    </div>
  );
}

function UploadModal({
  folders,
  categories,
  close,
  uploaded,
}: {
  folders: string[];
  categories: string[];
  close: () => void;
  uploaded: (message: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [caption, setCaption] = useState("");
  const [folder, setFolder] = useState("site-assets");
  const [category, setCategory] = useState("Uncategorised");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Choose a JPEG, PNG, WebP, AVIF or HEIC image.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = (next: File | null) => {
    setFile(next);
    setError(null);
    if (next && !title) {
      const base = next.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setTitle(base.replace(/\b\w/g, (letter) => letter.toUpperCase()));
      setAltText(base);
    }
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(5);
    setStatus("Preparing secure upload…");

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
        setStatus(`Uploading directly to ${String(prepare.driver).toUpperCase()}…`);
        // v2.8.67.0 — fall back to the multipart proxy upload when the
        // provider refuses the browser-direct PUT (in practice: the bucket's
        // CORS rules are missing). No CORS involved; capped at 4 MB because
        // Vercel caps serverless request bodies at ~4.5 MB.
        let directOk = true;
        try {
          await uploadDirect(prepare.url, file, prepare.headers ?? {}, setProgress);
        } catch {
          directOk = false;
          if (file.size > PROXY_MAX_BYTES) {
            throw new Error(
              "The image host refused the direct upload (bucket CORS rules are missing) and this file is too large for the automatic fallback. Fix the bucket CORS rules, then try again.",
            );
          }
          setStatus("Direct upload was blocked — uploading through the server…");
        }
        if (directOk) {
          setProgress(78);
          setStatus("Optimising image and creating WebP variants…");
          result = await fetch("/api/admin/media/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: prepare.key,
              filename: file.name,
              title,
              altText,
              caption,
              folder,
              category,
            }),
          });
        } else {
          setProgress(30);
          const form = new FormData();
          form.set("file", file);
          form.set("title", title);
          form.set("altText", altText);
          form.set("caption", caption);
          form.set("folder", folder);
          form.set("category", category);
          result = await fetch("/api/admin/media/upload", {
            method: "POST",
            body: form,
          });
        }
      } else {
        setProgress(25);
        setStatus("Optimising image and creating WebP variants…");
        const form = new FormData();
        form.set("file", file);
        form.set("title", title);
        form.set("altText", altText);
        form.set("caption", caption);
        form.set("folder", folder);
        form.set("category", category);
        result = await fetch("/api/admin/media/upload", {
          method: "POST",
          body: form,
        });
      }

      const json = (await parseJsonOrUploadError(result, "Image processing failed.")) as {
        error?: string;
        duplicate?: boolean;
      };
      setProgress(100);
      setStatus(json.duplicate ? "Existing image found — reused safely." : "Upload complete.");
      await uploaded(
        json.duplicate
          ? "Duplicate detected — existing media reused"
          : "Image uploaded and converted to WebP",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
      setStatus("Upload did not complete.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-[190] flex items-end bg-black/70 sm:items-center sm:justify-center sm:p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="g-panel max-h-[94svh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0d0d0b] p-5 text-white shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#ffd444]">
              Optimised upload
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold">Add to Media Library</h2>
          </div>
          <button
            onClick={close}
            disabled={busy}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 text-white/55"
          >
            <X size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-6 grid min-h-40 w-full place-items-center rounded-2xl border border-dashed border-white/20 bg-white/[0.025] p-5 text-center transition-colors hover:border-[#ffd444]/60 hover:bg-[#ffd444]/5"
        >
          <span>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#ffd444] text-[#0b0b0a]">
              <UploadCloud size={20} />
            </span>
            <span className="mt-3 block text-[13px] font-semibold">
              {file ? file.name : "Choose image from your device"}
            </span>
            <span className="mt-1 block text-[10px] text-white/35">
              {file ? `${formatBytes(file.size)} · tap to replace` : "Maximum 20 MB · EXIF and GPS will be removed"}
            </span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
          className="hidden"
          onChange={(event) => choose(event.target.files?.[0] ?? null)}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <UploadField label="Title" className="sm:col-span-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[13px] text-white outline-none focus:border-[#ffd444]"
            />
          </UploadField>
          <UploadField label="Folder">
            <input
              list="upload-folders"
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
            />
            <datalist id="upload-folders">
              {folders.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </datalist>
          </UploadField>
          <UploadField label="Category">
            <input
              list="upload-categories"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
            />
            <datalist id="upload-categories">
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </datalist>
          </UploadField>
          <UploadField label="Alternative text" className="sm:col-span-2">
            <input
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              placeholder="Describe the image for screen readers"
              className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
            />
          </UploadField>
          <UploadField label="Caption (optional)" className="sm:col-span-2">
            <textarea
              rows={2}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className="w-full resize-none rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-3 text-[12px] leading-relaxed text-white outline-none focus:border-[#ffd444]"
            />
          </UploadField>
        </div>

        {(busy || progress > 0) && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <span className="text-white/50">{status}</span>
              <span className="font-semibold text-[#ffd444]">{progress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-[#ffd444] transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-[12px] leading-relaxed text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-5">
          <button
            onClick={close}
            disabled={busy}
            className="rounded-full border border-white/15 px-5 py-3 text-[11px] text-white/55 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!file || !title.trim() || busy}
            className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-3 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
            Upload & optimise
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">
        {label}
      </span>
      {children}
    </label>
  );
}
