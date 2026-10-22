"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { ManageFiltersLink } from "@/components/admin/manage-filters-link";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";

type Item = {
  id: number;
  title: string;
  category: string;
  image: string;
  caption: string;
  year: string;
  location: string;
  aspect: string;
};

export function GalleryManager({
  categories: initialCategories,
  aspects,
}: {
  categories: string[];
  aspects: string[];
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newCatModal, setNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const loadData = () => {
    Promise.all([
      fetch("/api/admin/gallery", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/collections", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([galData, collData]) => {
        setItems(galData.items ?? []);
        if (collData.galleryCategories) setCategories(collData.galleryCategories);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "gallery", name: newCatName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCategories((prev) => Array.from(new Set([...prev, data.name])));
        if (editing) setEditing({ ...editing, category: data.name });
        setNewCatName("");
        setNewCatModal(false);
        setToast(`Collection "${data.name}" added!`);
      } else {
        setToast(data.error || "Failed to add collection");
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const add = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/gallery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: "/images/about.jpg", title: "New frame" }),
    });
    const json = await res.json();
    if (res.ok) {
      setItems((i) => [...i, json.item]);
      setEditing(json.item);
      setToast("Frame added — edit it now");
    } else setToast(json.error);
    setBusy(false);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const res = await fetch("/api/admin/gallery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (res.ok) {
      setItems((i) => i.map((item) => (item.id === json.item.id ? json.item : item)));
      setEditing(null);
      setToast("Frame saved");
    } else setToast(json.error);
    setBusy(false);
  };

  const remove = async (id: number) => {
    if (!window.confirm("Remove this frame from the gallery?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/gallery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setItems((i) => i.filter((item) => item.id !== id));
      setEditing(null);
      setToast("Frame removed");
    }
    setBusy(false);
  };

  /** Persist a new order after a local move. */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    await fetch("/api/admin/gallery", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((item) => item.id) }),
    });
    setToast("Gallery order saved");
  };

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  const aspectClass = (aspect: string) =>
    aspect === "portrait" ? "aspect-[4/5]" : aspect === "square" ? "aspect-square" : "aspect-[16/11]";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/45">
          {items.length} frames · order them with the arrows
        </p>
        <div className="flex items-center gap-2">
          <ManageFiltersLink tab="gallery" />
          <button
            onClick={add}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
            Add frame
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item, index) => (
          <figure
            key={item.id}
            className="group relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
          >
            <div className={`relative overflow-hidden bg-black ${aspectClass(item.aspect)}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={adminGridThumbSrc(item.image)}
                alt={item.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20 opacity-80" />
              <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-[#ffd444] backdrop-blur">
                {item.category}
              </span>
              <span className="absolute right-3 top-3 rounded-full bg-white/20 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">
                {item.year}
              </span>
              <figcaption className="absolute inset-x-3 bottom-3">
                <h3 className="line-clamp-2 font-display text-[15px] font-semibold leading-snug text-white">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-1 text-[10px] text-white/55">{item.location}</p>
              </figcaption>
            </div>

            {/* Hover controls */}
            <div className="flex items-center gap-px border-t border-white/10">
              <button
                onClick={() => setEditing(item)}
                className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[10.5px] font-semibold text-[#ffd444] hover:bg-white/5"
              >
                <ImageIcon size={12} /> Edit
              </button>
              <button
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="grid w-10 place-items-center border-l border-white/10 text-white/40 hover:bg-white/5 hover:text-white disabled:opacity-25"
                aria-label="Move earlier"
              >
                <ArrowUp size={12} />
              </button>
              <button
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                className="grid w-10 place-items-center border-l border-white/10 text-white/40 hover:bg-white/5 hover:text-white disabled:opacity-25"
                aria-label="Move later"
              >
                <ArrowDown size={12} />
              </button>
              <button
                onClick={() => remove(item.id)}
                className="grid w-10 place-items-center border-l border-white/10 text-white/35 hover:bg-red-500/10 hover:text-red-400"
                aria-label="Delete frame"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </figure>
        ))}
      </div>

      {/* Edit overlay */}
      {editing && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div className="g-panel flex max-h-[94svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={editing.image} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0b] via-black/40 to-transparent" />
              <button
                onClick={() => setEditing(null)}
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-black/60 backdrop-blur"
                aria-label="Close"
              >
                <X size={15} />
              </button>
              <div className="absolute inset-x-4 bottom-4">
                <label className="flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 backdrop-blur">
                  <ImageIcon size={12} className="shrink-0 text-[#ffd444]" />
                  <input
                    value={editing.image}
                    onChange={(e) => setEditing({ ...editing, image: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-[10px] text-white/80 outline-none placeholder:text-white/30"
                    placeholder="/images/… or https://…"
                  />
                  <MediaLibraryButton
                    preferFolder="gallery"
                    onSelect={(picked) => setEditing({ ...editing, image: picked.url })}
                  />
                </label>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="mt-3 w-full bg-transparent font-display text-xl font-semibold leading-tight text-white outline-none placeholder:text-white/40 sm:text-2xl"
                  placeholder="Frame title"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setEditing({ ...editing, category: cat })}
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      editing.category === cat
                        ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <button
                  onClick={() => setNewCatModal(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                >
                  <Plus size={10} /> Add Collection
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="mr-1 self-center text-[9px] uppercase tracking-[0.18em] text-white/30">Shape</span>
                {aspects.map((aspect) => (
                  <button
                    key={aspect}
                    onClick={() => setEditing({ ...editing, aspect })}
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      editing.aspect === aspect
                        ? "border-transparent bg-white text-[#0b0b0a]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    {aspect}
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                value={editing.caption}
                onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                className="mt-5 w-full resize-none rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[13.5px] leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                placeholder="Caption shown in the lightbox…"
              />

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">Year</span>
                  <input
                    value={editing.year}
                    onChange={(e) => setEditing({ ...editing, year: e.target.value })}
                    className="h-10 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">Location</span>
                  <input
                    value={editing.location}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                    className="h-10 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]"
                  />
                </label>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#0d0d0b] px-5 py-4">
              <a
                href="/gallery"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[11px] text-white/45 hover:text-white"
              >
                <ExternalLink size={12} /> View gallery
              </a>
              <button
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-3 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-60"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save frame
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Collection Modal */}
      {newCatModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121210] p-6 text-white shadow-2xl">
            <h3 className="font-display text-lg font-semibold">New Gallery Collection</h3>
            <p className="mt-1 text-[12px] text-white/50">
              Create a custom album category for photographs.
            </p>
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Science Day, Golden Jubilee…"
              className="mt-4 h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-4 text-[13px] text-white outline-none focus:border-[#ffd444]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory();
                if (e.key === "Escape") setNewCatModal(false);
              }}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setNewCatModal(false)}
                className="rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={addCategory}
                disabled={!newCatName.trim() || busy}
                className="rounded-full bg-[#ffd444] px-5 py-2 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-50"
              >
                Create Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="g-fade fixed bottom-6 left-1/2 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#ffd444] px-5 py-3 text-[12px] font-semibold text-[#0b0b0a] shadow-2xl lg:bottom-7">
          <Check size={14} /> {toast}
        </div>
      )}
    </>
  );
}
