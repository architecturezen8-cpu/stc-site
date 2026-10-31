"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  FileText,
  Film,
  Globe,
  GraduationCap,
  Link2,
  Loader2,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { ManageFiltersLink } from "@/components/admin/manage-filters-link";

type Item = {
  id: number;
  title: string;
  description: string;
  category: string;
  url: string;
  linkType: string;
  medium: string;
  featured: boolean;
};

const TYPE_META: Record<string, { icon: typeof Globe; label: string }> = {
  link: { icon: Globe, label: "Website" },
  paper: { icon: FileText, label: "Past paper" },
  document: { icon: FileText, label: "Document" },
  video: { icon: Film, label: "Video" },
};

export function ResourcesManager({
  categories: initialCategories,
}: {
  categories: string[];
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newCatModal, setNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const load = () => {
    return Promise.all([
      fetch("/api/admin/resources", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/collections", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([resData, collData]) => {
        setItems(resData.items ?? []);
        if (collData.resourceCategories) setCategories(collData.resourceCategories);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      map[item.category] = (map[item.category] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const visible = useMemo(
    () =>
      activeCategory === "all"
        ? items
        : items.filter((item) => item.category === activeCategory),
    [items, activeCategory],
  );

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "resources", name: newCatName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCategories((prev) => Array.from(new Set([...prev, data.name])));
        if (editing) setEditing({ ...editing, category: data.name });
        setNewCatName("");
        setNewCatModal(false);
        setToast(`Category "${data.name}" added`);
      } else {
        setToast(data.error || "Failed to add category");
      }
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New resource",
          url: "https://",
          category: activeCategory === "all" ? "Student Tools" : activeCategory,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setItems((i) => [...i, json.item]);
        setEditing(json.item);
        setToast("Resource added — edit it now");
      } else setToast(json.error);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/resources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const json = await res.json();
      if (res.ok) {
        setItems((i) => i.map((item) => (item.id === json.item.id ? json.item : item)));
        setEditing(null);
        setToast("Resource saved");
        load();
      } else setToast(json.error);
    } finally {
      setBusy(false);
    }
  };

  const toggleFeatured = async (item: Item) => {
    setItems((i) =>
      i.map((row) => (row.id === item.id ? { ...row, featured: !row.featured } : row)),
    );
    await fetch("/api/admin/resources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, featured: !item.featured }),
    });
    setToast(item.featured ? "Removed from featured" : "Marked as featured");
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this resource?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/resources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setItems((i) => i.filter((item) => item.id !== id));
        setEditing(null);
        setToast("Resource deleted");
      }
    } finally {
      setBusy(false);
    }
  };

  /** Move within the currently visible (category) list. */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= visible.length) return;
    const next = [...visible];
    [next[index], next[target]] = [next[target], next[index]];
    // Rebuild global order: replace the visible slice inside items.
    let vi = 0;
    const reordered = items.map((item) =>
      visible.some((v) => v.id === item.id) ? next[vi++] : item,
    );
    setItems(reordered);
    await fetch("/api/admin/resources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((item) => item.id) }),
    });
    setToast("Order saved");
  };

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  return (
    <>
      {/* Category tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setActiveCategory("all")}
          className={`rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
            activeCategory === "all"
              ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
              : "border-white/12 text-white/50 hover:text-white"
          }`}
        >
          All · {items.length}
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
              activeCategory === cat
                ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                : "border-white/12 text-white/50 hover:text-white"
            }`}
          >
            {cat}
            <span className="ml-1.5 opacity-60">{counts[cat] ?? 0}</span>
          </button>
        ))}
        <button
          onClick={() => setNewCatModal(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
        >
          <Plus size={11} /> Category
        </button>
        <ManageFiltersLink tab="resources" />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-white/45">
          {visible.length} resource{visible.length === 1 ? "" : "s"}
          {activeCategory !== "all" ? ` in ${activeCategory}` : " across all categories"}
        </p>
        <button
          onClick={add}
          disabled={busy}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
          Add resource
        </button>
      </div>

      {/* List */}
      <div className="mt-5 space-y-3">
        {visible.map((item, index) => {
          const typeMeta = TYPE_META[item.linkType] ?? TYPE_META.link;
          const TypeIcon = typeMeta.icon;
          return (
            <div
              key={item.id}
              className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/25"
            >
              <div className="flex items-start gap-3.5 sm:items-center">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ffd444]/15 text-[#ffd444]">
                  <TypeIcon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 max-w-full flex-1 basis-40 truncate font-display text-[15px] font-semibold">
                      {item.title}
                    </h3>
                    {item.featured && (
                      <span className="rounded-full bg-[#ffd444] px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-[#0b0b0a]">
                        Featured
                      </span>
                    )}
                  </div>
                  {/* Description breathes over two lines on mobile */}
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-white/45 sm:line-clamp-1">
                    {item.description || typeMeta.label}
                  </p>
                  <p className="mt-1 truncate font-mono text-[9px] text-white/30">{item.url}</p>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                  <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    {item.category}
                  </span>
                  <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-white/40">
                    {item.medium} medium
                  </span>
                </div>
                <div className="hidden shrink-0 items-center gap-px sm:flex">
                  <button
                    onClick={() => toggleFeatured(item)}
                    className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 ${
                      item.featured ? "text-[#ffd444]" : "text-white/30"
                    }`}
                    aria-label="Toggle featured"
                  >
                    <Star size={14} fill={item.featured ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-[#ffd444] hover:bg-white/10"
                    aria-label="Edit resource"
                  >
                    <Link2 size={14} />
                  </button>
                  <button
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/40 hover:bg-white/10 disabled:opacity-25"
                    aria-label="Move earlier"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={index === visible.length - 1}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/40 hover:bg-white/10 disabled:opacity-25"
                    aria-label="Move later"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/30 hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Delete resource"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Mobile footer row — category/medium chips left, actions right,
                  so the title and details above get the full row width */}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3 sm:hidden">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    {item.category}
                  </span>
                  <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-white/40">
                    {item.medium}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggleFeatured(item)}
                    className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 ${
                      item.featured ? "text-[#ffd444]" : "text-white/30"
                    }`}
                    aria-label="Toggle featured"
                  >
                    <Star size={14} fill={item.featured ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-[#ffd444] hover:bg-white/10"
                    aria-label="Edit resource"
                  >
                    <Link2 size={14} />
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/30 hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Delete resource"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
            <GraduationCap size={22} className="mx-auto text-white/25" />
            <p className="mt-3 text-[12.5px] text-white/45">
              No resources in this category yet — add the first one.
            </p>
          </div>
        )}
      </div>

      {/* Edit overlay */}
      {editing && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div className="g-panel flex max-h-[94svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
              <h3 className="font-display text-lg font-semibold">Edit resource</h3>
              <button
                onClick={() => setEditing(null)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/15"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-7">
              <label className="block">
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">Title</span>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[13px] text-white outline-none focus:border-[#ffd444]"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">URL</span>
                <input
                  value={editing.url}
                  onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                  placeholder="https://…"
                  className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 font-mono text-[11.5px] text-white outline-none focus:border-[#ffd444]"
                />
              </label>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">Description</span>
                <textarea
                  rows={3}
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full resize-none rounded-xl border border-white/12 bg-white/[0.05] px-4 py-3 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]"
                  placeholder="What will students find here?"
                />
              </label>

              <div className="mt-5">
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Category</span>
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
                    <Plus size={10} /> New
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Type</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(TYPE_META).map(([type, meta]) => {
                      const Icon = meta.icon;
                      return (
                        <button
                          key={type}
                          onClick={() => setEditing({ ...editing, linkType: type })}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                            editing.linkType === type
                              ? "border-transparent bg-white text-[#0b0b0a]"
                              : "border-white/12 text-white/45 hover:text-white"
                          }`}
                        >
                          <Icon size={10} /> {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Medium</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["All", "Sinhala", "Tamil", "English"].map((medium) => (
                      <button
                        key={medium}
                        onClick={() => setEditing({ ...editing, medium })}
                        className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                          editing.medium === medium
                            ? "border-transparent bg-white text-[#0b0b0a]"
                            : "border-white/12 text-white/45 hover:text-white"
                        }`}
                      >
                        {medium}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#0d0d0b] px-5 py-4 sm:px-7">
              <a
                href="/resources"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[11px] text-white/45 hover:text-white"
              >
                <ExternalLink size={12} /> View resources page
              </a>
              <button
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-3 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-60"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save resource
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New category modal */}
      {newCatModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121210] p-6 text-white shadow-2xl">
            <h3 className="font-display text-lg font-semibold">New resource category</h3>
            <p className="mt-1 text-[12px] text-white/50">
              Group resources however the college needs — by subject, grade or purpose.
            </p>
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Grade 5 Scholarship, ICT Notes…"
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
                Create category
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
