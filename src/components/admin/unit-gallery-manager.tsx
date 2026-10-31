"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";

type UnitOption = { slug: string; name: string };

type UnitPhoto = {
  id: number;
  unitSlug: string;
  title: string;
  caption: string;
  image: string;
  zoom: number;
  aspect: "landscape" | "portrait" | "square";
  sortOrder: number;
};

const ASPECTS = ["landscape", "portrait", "square"] as const;
const MAX_ADD_IMAGES = 10;

/** Per-cadet-unit gallery archives — mirrors the archive style of the public unit pages. */
export function UnitGalleryManager() {
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unit, setUnit] = useState("");
  const [items, setItems] = useState<UnitPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UnitPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // "+" add dialog — images + title + short sentence in one place.
  const [addOpen, setAddOpen] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addCaption, setAddCaption] = useState("");
  const [addAspect, setAddAspect] = useState<(typeof ASPECTS)[number]>("landscape");
  const [addImages, setAddImages] = useState<string[]>([""]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async (unitSlug: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/unit-gallery?unit=${encodeURIComponent(unitSlug)}`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (res.ok) {
      setItems(json.items ?? []);
      setUnits(json.units ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch("/api/admin/unit-gallery?unit=army-cadet", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setUnits(json.units ?? []);
        setItems(json.items ?? []);
        setUnit(json.units?.[0]?.slug ?? "army-cadet");
      })
      .finally(() => setLoading(false));
  }, []);

  const switchUnit = (slug: string) => {
    setUnit(slug);
    setEditing(null);
    void load(slug);
  };

  const openAdd = () => {
    setAddTitle("");
    setAddCaption("");
    setAddAspect("landscape");
    setAddImages([""]);
    setAddOpen(true);
  };

  /** Create one gallery item per chosen image, sharing the title + sentence. */
  const submitAdd = async () => {
    const images = addImages.map((url) => url.trim()).filter(Boolean);
    if (!images.length) {
      notify("Choose at least one image");
      return;
    }
    setBusy(true);
    try {
      const created: UnitPhoto[] = [];
      for (const image of images) {
        const res = await fetch("/api/admin/unit-gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unitSlug: unit,
            image,
            title: addTitle.trim() || "Untitled photo",
            caption: addCaption.trim(),
            aspect: addAspect,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          notify(json.error || "Unable to add photo");
          return;
        }
        created.push(json.item);
      }
      setItems((prev) => [...prev, ...created]);
      setAddOpen(false);
      notify(
        created.length === 1
          ? "Photo added to unit gallery"
          : `${created.length} photos added to unit gallery`,
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const res = await fetch("/api/admin/unit-gallery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (res.ok) {
      setItems((prev) => prev.map((item) => (item.id === json.item.id ? json.item : item)));
      setEditing(null);
      notify("Unit photo saved");
    } else notify(json.error || "Unable to save");
    setBusy(false);
  };

  const remove = async (id: number) => {
    if (!window.confirm("Remove this photo from the unit gallery?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/unit-gallery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
      setEditing(null);
      notify("Photo removed");
    }
    setBusy(false);
  };

  const chosen = units.find((u) => u.slug === unit);

  return (
    <div>
      {/* Unit switcher */}
      <div className="flex flex-wrap gap-1.5">
        {units.map((option) => (
          <button
            key={option.slug}
            onClick={() => switchUnit(option.slug)}
            className={`rounded-full border px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] transition-colors ${
              unit === option.slug
                ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                : "border-white/12 text-white/45 hover:text-white"
            }`}
          >
            {option.name}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-[12px] text-white/50">
          <span className="font-semibold text-white">{chosen?.name ?? "Unit"}</span>
          {" · "}
          {items.length} photo{items.length === 1 ? "" : "s"} — shown on
          <a
            href={`/cadeting/${unit}`}
            target="_blank"
            rel="noreferrer"
            className="ml-1.5 inline-flex items-center gap-1 text-[#ffd444] hover:underline"
          >
            /cadeting/{unit} <ExternalLink size={10} />
          </a>
        </p>
        <button
          onClick={openAdd}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a]"
        >
          <Plus size={14} /> Add photos
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[220] -translate-x-1/2 rounded-full bg-[#ffd444] px-5 py-2.5 text-[11px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-10">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="grid min-h-64 place-items-center">
          <Loader2 className="animate-spin text-[#ffd444]" />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setEditing(photo)}
              className={`group relative overflow-hidden rounded-xl border border-white/10 bg-black text-left hover:border-[#ffd444]/60 ${
                photo.aspect === "portrait" ? "row-span-2" : ""
              }`}
            >
              <div className={`${photo.aspect === "portrait" ? "aspect-[3/4]" : photo.aspect === "square" ? "aspect-square" : "aspect-[4/3]"} w-full overflow-hidden`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={adminGridThumbSrc(photo.image)}
                  alt={photo.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                  style={photo.zoom && photo.zoom !== 100 ? { transform: `scale(${photo.zoom / 100})` } : undefined}
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
                <p className="truncate text-[11px] font-semibold text-white">{photo.title}</p>
              </div>
            </button>
          ))}
          <button
            onClick={openAdd}
            className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-white/15 text-white/30 transition-colors hover:border-[#ffd444]/60 hover:text-[#ffd444]"
            aria-label="Add photos to this unit gallery"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* ── Add dialog — images + title + short sentence ─────────── */}
      {addOpen && (
        <div className="fixed inset-0 z-[200] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div className="g-panel flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <div>
                <h3 className="font-display text-lg font-semibold">Add to {chosen?.name ?? "unit gallery"}</h3>
                <p className="mt-0.5 text-[11px] text-white/40">Images, a title and a short sentence — one tile per image.</p>
              </div>
              <button
                onClick={() => setAddOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15 hover:bg-white/10"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">Images</span>
                <div className="space-y-2.5">
                  {addImages.map((url, index) => (
                    <div key={index} className="flex items-center gap-2.5">
                      <span className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/12 bg-black">
                        {url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon size={14} className="text-white/25" />
                        )}
                      </span>
                      <input
                        value={url}
                        onChange={(e) => {
                          const next = [...addImages];
                          next[index] = e.target.value;
                          setAddImages(next);
                        }}
                        placeholder="/images/… or https://…"
                        className="h-10 min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                      />
                      <MediaLibraryButton
                        preferFolder="cadeting"
                        onSelect={(picked) => {
                          const next = [...addImages];
                          next[index] = picked.url;
                          setAddImages(next);
                        }}
                      />
                      {addImages.length > 1 && (
                        <button
                          onClick={() => setAddImages(addImages.filter((_, i) => i !== index))}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/12 text-white/40 hover:border-red-400/40 hover:text-red-400"
                          aria-label="Remove image"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {addImages.length < MAX_ADD_IMAGES && (
                  <button
                    onClick={() => setAddImages([...addImages, ""])}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                  >
                    <Plus size={11} /> Add image slot
                  </button>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">Title</span>
                <input
                  value={addTitle}
                  onChange={(e) => setAddTitle(e.target.value)}
                  placeholder="e.g. Leadership training camp 2026"
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">Short sentence</span>
                <textarea
                  rows={2}
                  value={addCaption}
                  onChange={(e) => setAddCaption(e.target.value)}
                  placeholder="One line about these photos…"
                  className="w-full resize-none rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[13px] text-white outline-none focus:border-[#ffd444]"
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">Shape</span>
                <div className="flex gap-1.5">
                  {ASPECTS.map((aspect) => (
                    <button
                      key={aspect}
                      onClick={() => setAddAspect(aspect)}
                      className={`rounded-full border px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] ${
                        addAspect === aspect
                          ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                          : "border-white/12 text-white/45"
                      }`}
                    >
                      {aspect}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 p-4">
              <button
                onClick={() => setAddOpen(false)}
                className="rounded-full border border-white/15 px-5 py-2.5 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={submitAdd}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-2.5 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Add {addImages.filter((url) => url.trim()).length || ""} photo{addImages.filter((url) => url.trim()).length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit overlay */}
      {editing && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div className="g-panel flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={editing.image}
                alt=""
                className="h-full w-full object-cover"
                style={editing.zoom && editing.zoom !== 100 ? { transform: `scale(${editing.zoom / 100})` } : undefined}
              />
              <div className="absolute inset-x-4 top-4 flex items-start gap-2">
                <span className="rounded-full bg-black/70 px-3 py-2">
                  <MediaLibraryButton
                    preferFolder="cadeting"
                    onSelect={(picked) => setEditing({ ...editing, image: picked.url })}
                  />
                </span>
                <button
                  onClick={() => setEditing(null)}
                  className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-black/60"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">Title</span>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
                />
              </div>
              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">Short sentence</span>
                <textarea
                  rows={2}
                  value={editing.caption}
                  onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                  className="w-full resize-none rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[13px] text-white outline-none focus:border-[#ffd444]"
                />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/40">
                  <span>Photo zoom — preview updates live</span>
                  <span className="font-display text-[12px] font-semibold text-white">{editing.zoom ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={240}
                  step={5}
                  value={editing.zoom ?? 100}
                  onChange={(e) => setEditing({ ...editing, zoom: Number(e.target.value) })}
                  aria-label="Photo zoom"
                  className="mt-2 w-full accent-[#ffd444]"
                />
              </div>
              <div>
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/40">Shape</span>
                <div className="flex gap-1.5">
                  {ASPECTS.map((aspect) => (
                    <button
                      key={aspect}
                      onClick={() => setEditing({ ...editing, aspect })}
                      className={`rounded-full border px-4 py-2 text-[10px] font-medium uppercase tracking-[0.14em] ${
                        editing.aspect === aspect
                          ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                          : "border-white/12 text-white/45"
                      }`}
                    >
                      {aspect}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 p-4">
              <button
                onClick={() => void remove(editing.id)}
                className="inline-flex items-center gap-2 rounded-full border border-red-400/25 px-4 py-2.5 text-[11px] text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={12} /> Remove
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-2.5 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save photo
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-white/30">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-400" />
        Unit galleries are structured content — they cannot be corrupted by the
        universal visual editor. Use “Add photos” to attach images with a title
        and a short sentence.
      </p>
    </div>
  );
}
