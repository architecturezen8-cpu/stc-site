"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PenLine,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { MediaLibraryButton } from "@/components/admin/media-picker";
import { ManageFiltersLink } from "@/components/admin/manage-filters-link";
import { adminGridThumbSrc } from "@/lib/admin-grid-thumb";
import {
  colomboInputToIso,
  formatScheduleLabel,
  isoToColomboInput,
} from "@/lib/post-visibility";

type PostLink = { label: string; url: string };

type Post = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  image: string;
  location: string;
  author: string;
  readMinutes: number;
  featured: boolean;
  isNew: boolean;
  publishedAt: string;
  /* v2.8.80.0 — scheduled publishing (ISO instant or null = live now). */
  scheduledAt: string | null;
  imageScale: number;
  extraImages: string[];
  links: PostLink[];
  videos: string[];
};

const input =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-white outline-none placeholder:text-white/25 focus:border-[#ffd444]";

export function NewsManager({ categories: initialCategories }: { categories: string[] }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState<Post | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newCatModal, setNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const loadData = () => {
    Promise.all([
      fetch("/api/admin/posts", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/collections", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([postData, collData]) => {
        setPosts(postData.posts ?? []);
        if (collData.newsCategories) setCategories(collData.newsCategories);
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
        body: JSON.stringify({ type: "news", name: newCatName.trim() }),
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

  const visible = useMemo(
    () => (filter === "All" ? posts : posts.filter((p) => p.category === filter)),
    [posts, filter],
  );

  const create = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "New story headline",
        excerpt: "Write a short standfirst for this story…",
        body: "Tell the story here…",
        category: "Notice",
        image: "/images/news-science.jpg",
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setPosts((p) => [{ ...json.post, extraImages: json.post.extraImages ?? [], links: json.post.links ?? [], videos: json.post.videos ?? [], imageScale: json.post.imageScale ?? 100 }, ...p]);
      setEditing(json.post);
      setToast("Story created — now edit it");
    } else setToast(json.error);
    setBusy(false);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const res = await fetch("/api/admin/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (res.ok) {
      setPosts((p) => p.map((item) => (item.id === json.post.id ? { ...json.post, extraImages: json.post.extraImages ?? [], links: json.post.links ?? [], videos: json.post.videos ?? [], imageScale: json.post.imageScale ?? 100 } : item)));
      /* v2.8.80.0 — the toast tells the truth about WHEN it goes live. */
      setToast(
        isScheduledFuture(editing.scheduledAt)
          ? `Story saved — goes live ${formatScheduleLabel(editing.scheduledAt as string)}`
          : "Story saved & published",
      );
      setEditing(null);
    } else setToast(json.error);
    setBusy(false);
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this story permanently?")) return;
    setBusy(true);
    const res = await fetch("/api/admin/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setPosts((p) => p.filter((item) => item.id !== id));
      setEditing(null);
      setToast("Story deleted");
    }
    setBusy(false);
  };

  /* v2.8.80.0 — "Schedule" defaults to tomorrow 8.00 a.m. Sri Lanka time. */
  const defaultScheduleIso = () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const datePart = isoToColomboInput(tomorrow.toISOString()).slice(0, 10);
    return colomboInputToIso(`${datePart}T08:00`) ?? "";
  };

  /* v2.8.80.0 — render-stable "now" for the Scheduled chips (purity rule:
     Date.now() lives in the lazy initializer, not the render body). */
  const [nowMs] = useState(() => Date.now());
  const isScheduledFuture = (value: string | null) =>
    Boolean(value && new Date(value).getTime() > nowMs);

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#ffd444]" />
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["All", ...categories].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`rounded-full border px-4 py-2 text-[10px] font-medium uppercase tracking-[0.16em] transition-colors ${
                filter === cat
                  ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                  : "border-white/12 text-white/50 hover:border-white/30 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ManageFiltersLink tab="news" />
          <button
            onClick={create}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#ffd444] px-5 text-[12px] font-semibold text-[#0b0b0a] disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
            New story
          </button>
        </div>
      </div>

      {/* Story cards — mirrors the public news card design */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((post) => (
          <article
            key={post.id}
            className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-[#ffd444]/50"
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={adminGridThumbSrc(post.image)}
                alt={post.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-2">
                <span className="rounded-full bg-black/70 px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#ffd444] backdrop-blur">
                  {post.category}
                </span>
                {post.featured && (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ffd444] text-[#0b0b0a]">
                    <Star size={12} className="fill-current" />
                  </span>
                )}
                {post.isNew && (
                  <span className="rounded-full bg-[#ffd444] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[#0b0b0a]">
                    New
                  </span>
                )}
                {isScheduledFuture(post.scheduledAt) && (
                  <span className="rounded-full bg-black/70 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[#ffd444] backdrop-blur">
                    Scheduled
                  </span>
                )}
              </div>
              <div className="absolute inset-x-4 bottom-3.5">
                <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-white">
                  {post.title}
                </h3>
              </div>
            </div>
            <div className="p-4">
              <p className="line-clamp-2 text-[12.5px] leading-relaxed text-white/45">
                {post.excerpt}
              </p>
              <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[9px] uppercase tracking-[0.14em] text-white/30">
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={11} />
                  {new Date(post.publishedAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={11} />
                  {post.readMinutes} min
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin size={11} />
                  {post.location}
                </span>
              </div>
              <div className="mt-4 flex gap-px border-t border-white/10 pt-3">
                <button
                  onClick={() => setEditing(post)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-[11px] font-semibold text-[#ffd444] hover:bg-white/5"
                >
                  <PenLine size={12} /> Edit story
                </button>
                <Link
                  href={`/news/${post.slug}`}
                  target="_blank"
                  className="flex items-center justify-center gap-2 rounded-lg border-l border-white/10 px-4 py-2.5 text-[11px] text-white/45 hover:bg-white/5 hover:text-white"
                >
                  <ExternalLink size={12} />
                </Link>
                <button
                  onClick={() => remove(post.id)}
                  className="grid w-11 place-items-center rounded-lg border-l border-white/10 text-white/35 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Delete story"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </article>
        ))}
        {visible.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-white/15 py-16 text-center">
            <p className="text-sm text-white/40">No stories in this category yet.</p>
          </div>
        )}
      </div>

      {/* Editorial overlay — writing view, not a form */}
      {editing && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/75 sm:items-center sm:justify-center sm:p-6">
          <div className="g-panel flex max-h-[94svh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#0d0d0b] text-white shadow-2xl sm:max-w-3xl sm:rounded-2xl">
            {/* Cover */}
            <div className="relative aspect-[21/9] shrink-0 overflow-hidden bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={editing.image}
                alt=""
                className="h-full w-full object-cover"
                style={
                  editing.imageScale && editing.imageScale !== 100
                    ? { transform: `scale(${editing.imageScale / 100})` }
                    : undefined
                }
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0b] via-black/40 to-transparent" />
              <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-black/70 px-3 py-2 backdrop-blur">
                  <ImageIcon size={12} className="shrink-0 text-[#ffd444]" />
                  <input
                    value={editing.image}
                    onChange={(e) => setEditing({ ...editing, image: e.target.value })}
                    className="min-w-0 flex-1 bg-transparent text-[10px] text-white/80 outline-none placeholder:text-white/30"
                    placeholder="/images/… or https://…"
                  />
                  <MediaLibraryButton
                    preferFolder="news"
                    onSelect={(picked) => setEditing({ ...editing, image: picked.url })}
                  />
                </label>
                <button
                  onClick={() => setEditing(null)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/25 bg-black/60 backdrop-blur"
                  aria-label="Close editor"
                >
                  <X size={15} />
                </button>
              </div>
              {/* Headline — edited in place over the cover */}
              <textarea
                rows={2}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="absolute inset-x-4 bottom-4 resize-none bg-transparent font-display text-2xl font-semibold leading-tight tracking-[-0.02em] text-white outline-none placeholder:text-white/40 sm:text-3xl"
                placeholder="Story headline"
              />
            </div>

            {/* Body */}
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
                <button
                  onClick={() => setEditing({ ...editing, featured: !editing.featured })}
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                    editing.featured
                      ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                      : "border-white/12 text-white/45 hover:text-white"
                  }`}
                >
                  <Star size={11} className={editing.featured ? "fill-current" : ""} />
                  Featured
                </button>
                <button
                  onClick={() => setEditing({ ...editing, isNew: !editing.isNew })}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                    editing.isNew
                      ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                      : "border-white/12 text-white/45 hover:text-white"
                  }`}
                >
                  NEW badge
                </button>
              </div>

              {/* ── v2.8.80.0 — scheduled publishing ─────────────────── */}
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-white/40">
                    Go live
                  </span>
                  <button
                    onClick={() => setEditing({ ...editing, scheduledAt: null })}
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      !editing.scheduledAt
                        ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    Publish now
                  </button>
                  <button
                    onClick={() =>
                      setEditing({
                        ...editing,
                        scheduledAt: editing.scheduledAt || defaultScheduleIso(),
                      })
                    }
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-medium uppercase tracking-[0.14em] transition-colors ${
                      editing.scheduledAt
                        ? "border-transparent bg-[#ffd444] text-[#0b0b0a]"
                        : "border-white/12 text-white/45 hover:text-white"
                    }`}
                  >
                    Schedule
                  </button>
                  {editing.scheduledAt && (
                    <label className="ml-auto flex items-center gap-2">
                      <input
                        type="datetime-local"
                        value={isoToColomboInput(editing.scheduledAt)}
                        onChange={(e) => {
                          const iso = colomboInputToIso(e.target.value);
                          if (iso) setEditing({ ...editing, scheduledAt: iso });
                        }}
                        className="rounded-lg border border-white/12 bg-white/[0.05] px-2.5 py-1.5 text-[11.5px] text-white outline-none focus:border-[#ffd444] [color-scheme:dark]"
                      />
                      <span className="text-[10px] text-white/35">Sri Lanka time</span>
                    </label>
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-white/35">
                  {editing.scheduledAt
                    ? `Hidden from the public site until ${formatScheduleLabel(editing.scheduledAt)} — it appears automatically then, everywhere news shows.`
                    : "Live immediately on save — or schedule it and the site shows it at exactly that moment."}
                </p>
              </div>

              <textarea
                rows={3}
                value={editing.excerpt}
                onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
                className={`${input} mt-5 resize-none border-l-2 border-l-[#ffd444] bg-transparent py-2 font-display text-lg leading-relaxed`}
                placeholder="Standfirst — one or two lines that sell the story…"
              />

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">Location</span>
                  <input value={editing.location} onChange={(e) => setEditing({ ...editing, location: e.target.value })} className={`${input} h-10 text-[12px]`} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">Author</span>
                  <input value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} className={`${input} h-10 text-[12px]`} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[9px] uppercase tracking-[0.18em] text-white/35">Read time (min)</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={editing.readMinutes}
                    onChange={(e) => setEditing({ ...editing, readMinutes: Number(e.target.value) })}
                    className={`${input} h-10 text-[12px]`}
                  />
                </label>
              </div>

              {/* Cover zoom — realtime preview on the cover above */}
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-white/40">
                  <span>Cover zoom — watch the cover above update live</span>
                  <span className="font-display text-[12px] font-semibold text-white">{editing.imageScale ?? 100}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={240}
                  step={5}
                  value={editing.imageScale ?? 100}
                  onChange={(e) => setEditing({ ...editing, imageScale: Number(e.target.value) })}
                  aria-label="Cover zoom"
                  className="mt-2 w-full accent-[#ffd444]"
                />
              </div>

              <div className="mt-6">
                <span className="mb-2 block text-[9px] uppercase tracking-[0.18em] text-white/35">Story body</span>
                <textarea
                  rows={12}
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                  className={`${input} resize-y py-4 text-[14px] leading-[1.85]`}
                  placeholder="Write the story. Separate paragraphs with a blank line."
                />
                <p className="mt-2 text-[10px] text-white/25">
                  {editing.body.split(/\s+/).filter(Boolean).length} words · blank lines separate paragraphs
                </p>
              </div>

              {/* ── Attachments — tick what this story uses ────────── */}
              <div className="mt-7 border-t border-white/10 pt-6">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">Attachments — tick what this story includes</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      ["Images", (editing.extraImages ?? []).length > 0],
                      ["Links", (editing.links ?? []).length > 0],
                      ["Videos", (editing.videos ?? []).length > 0],
                    ] as const
                  ).map(([label, active]) => (
                    <button
                      key={label}
                      onClick={() => {
                        if (label === "Images") {
                          setEditing({
                            ...editing,
                            // Ticking opens up to 5 photo slots; unticking removes them all.
                            extraImages: active ? [] : [""],
                          });
                        } else if (label === "Links") {
                          setEditing({ ...editing, links: active ? [] : [{ label: "", url: "" }] });
                        } else {
                          setEditing({ ...editing, videos: active ? [] : [""] });
                        }
                      }}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                        active
                          ? "border-[#ffd444] bg-[#ffd444]/15 text-[#ffd444]"
                          : "border-white/12 text-white/45 hover:text-white"
                      }`}
                    >
                      <span
                        className={`grid h-3.5 w-3.5 place-items-center rounded-[4px] border ${
                          active ? "border-[#ffd444] bg-[#ffd444] text-[#0b0b0a]" : "border-white/30"
                        }`}
                      >
                        {active && <Check size={10} strokeWidth={3.5} />}
                      </span>
                      {label}
                      {active && (label === "Images" ? (editing.extraImages ?? []).length : label === "Links" ? (editing.links ?? []).length : (editing.videos ?? []).length) > 0 && (
                        <span className="rounded-full bg-black/30 px-1.5 text-[9px]">
                          {label === "Images" ? (editing.extraImages ?? []).length : label === "Links" ? (editing.links ?? []).length : (editing.videos ?? []).length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Story photos — up to 5 */}
                {(editing.extraImages ?? []).length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Story photos</p>
                      <span className="text-[9px] text-white/30">{(editing.extraImages ?? []).length} / 5</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {(editing.extraImages ?? []).map((url, index) => (
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
                              const next = [...(editing.extraImages ?? [])];
                              next[index] = e.target.value;
                              setEditing({ ...editing, extraImages: next });
                            }}
                            placeholder="/images/… or https://…"
                            className={`${input} h-10 min-w-0 flex-1 text-[11px]`}
                          />
                          <MediaLibraryButton
                            preferFolder="news"
                            onSelect={(picked) => {
                              const next = [...(editing.extraImages ?? [])];
                              next[index] = picked.url;
                              setEditing({ ...editing, extraImages: next });
                            }}
                          />
                          <button
                            onClick={() => setEditing({ ...editing, extraImages: (editing.extraImages ?? []).filter((_, i) => i !== index) })}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/12 text-white/40 hover:border-red-400/40 hover:text-red-400"
                            aria-label="Remove photo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {(editing.extraImages ?? []).length < 5 && (
                      <button
                        onClick={() => setEditing({ ...editing, extraImages: [...(editing.extraImages ?? []), ""] })}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                      >
                        <Plus size={11} /> Add photo
                      </button>
                    )}
                  </div>
                )}

                {/* Links */}
                {(editing.links ?? []).length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Related links</p>
                    <div className="mt-3 space-y-2.5">
                      {(editing.links ?? []).map((link, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            value={link.label}
                            onChange={(e) => {
                              const next = [...(editing.links ?? [])];
                              next[index] = { ...next[index], label: e.target.value };
                              setEditing({ ...editing, links: next });
                            }}
                            placeholder="Link label"
                            className={`${input} h-10 w-40 shrink-0 text-[11px] sm:w-52`}
                          />
                          <input
                            value={link.url}
                            onChange={(e) => {
                              const next = [...(editing.links ?? [])];
                              next[index] = { ...next[index], url: e.target.value };
                              setEditing({ ...editing, links: next });
                            }}
                            placeholder="https://…"
                            className={`${input} h-10 min-w-0 flex-1 text-[11px]`}
                          />
                          <button
                            onClick={() => setEditing({ ...editing, links: (editing.links ?? []).filter((_, i) => i !== index) })}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/12 text-white/40 hover:border-red-400/40 hover:text-red-400"
                            aria-label="Remove link"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setEditing({ ...editing, links: [...(editing.links ?? []), { label: "", url: "" }] })}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                    >
                      <Plus size={11} /> Add link
                    </button>
                  </div>
                )}

                {/* Videos */}
                {(editing.videos ?? []).length > 0 && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Videos</p>
                    <p className="mt-0.5 text-[9.5px] text-white/30">YouTube watch/short links or direct https video files.</p>
                    <div className="mt-3 space-y-2.5">
                      {(editing.videos ?? []).map((url, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            value={url}
                            onChange={(e) => {
                              const next = [...(editing.videos ?? [])];
                              next[index] = e.target.value;
                              setEditing({ ...editing, videos: next });
                            }}
                            placeholder="https://youtube.com/watch?v=… or https://…/clip.mp4"
                            className={`${input} h-10 min-w-0 flex-1 text-[11px]`}
                          />
                          <button
                            onClick={() => setEditing({ ...editing, videos: (editing.videos ?? []).filter((_, i) => i !== index) })}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/12 text-white/40 hover:border-red-400/40 hover:text-red-400"
                            aria-label="Remove video"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setEditing({ ...editing, videos: [...(editing.videos ?? []), ""] })}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#ffd444]/40 bg-[#ffd444]/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffd444] hover:bg-[#ffd444]/20"
                    >
                      <Plus size={11} /> Add video
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-[#0d0d0b] px-5 py-4">
              <button
                onClick={() => remove(editing.id)}
                className="inline-flex items-center gap-2 text-[11px] text-red-400 hover:bg-red-500/10 rounded-full px-3 py-2"
              >
                <Trash2 size={13} /> Delete
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-[11px] font-semibold text-white/60 hover:text-white">
                  <ArrowLeft size={13} /> Cancel
                </button>
                <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#ffd444] px-6 py-3 text-[11px] font-semibold text-[#0b0b0a] disabled:opacity-60">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save & publish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Collection Modal */}
      {newCatModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121210] p-6 text-white shadow-2xl">
            <h3 className="font-display text-lg font-semibold">New Story Collection</h3>
            <p className="mt-1 text-[12px] text-white/50">
              Create a custom category for stories and articles.
            </p>
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Science Fair, Old Boys News…"
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
