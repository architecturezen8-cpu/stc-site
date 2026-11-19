"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  MapPin,
  X,
} from "lucide-react";
import type { GalleryItem } from "@/db/schema";

/**
 * Layout classes — asymmetric editorial grid.
 * Below lg every tile keeps an aspect ratio (uniform rows);
 * at lg the fixed 264px auto-rows size every tile by row-span,
 * so nothing can overlap or misalign.
 */
function tileClasses(item: GalleryItem, i: number): string {
  if (item.aspect === "portrait") {
    return "aspect-[16/11] sm:col-span-2 lg:col-span-1 lg:row-span-2 lg:aspect-auto";
  }
  // Feature the first frame of every filter view
  if (i === 0) {
    return "aspect-[16/10] sm:col-span-2 lg:aspect-auto";
  }
  return "aspect-[16/11] lg:aspect-auto";
}

export function GalleryClient({ items }: { items: GalleryItem[] }) {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((it) => map.set(it.category, (map.get(it.category) ?? 0) + 1));
    return map;
  }, [items]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  );

  const filtered =
    activeCategory === "All"
      ? items
      : items.filter((item) => item.category === activeCategory);

  const selectedItem =
    selectedIndex !== null ? (filtered[selectedIndex] ?? null) : null;

  const handlePrev = () => {
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex - 1 + filtered.length) % filtered.length);
  };

  const handleNext = () => {
    if (selectedIndex === null) return;
    setSelectedIndex((selectedIndex + 1) % filtered.length);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "Escape") setSelectedIndex(null);
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    if (selectedIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedIndex]);

  return (
    <>
      {/* Category rails — sliding indicator + live counts */}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2.5">
          {categories.map((cat) => {
            const isActive = cat === activeCategory;
            const count =
              cat === "All" ? items.length : (counts.get(cat) ?? 0);
            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setSelectedIndex(null);
                }}
                className={`group relative overflow-hidden rounded-full border px-5 py-2.5 font-sans text-[10px] uppercase tracking-[0.22em] transition-all duration-400 ease-out active:scale-95 ${
                  isActive
                    ? "border-transparent bg-fg text-surface shadow-lift"
                    : "border-fg/15 text-fg/60 hover:-translate-y-0.5 hover:border-fg hover:text-fg"
                }`}
              >
                <span className="relative z-10 flex items-center gap-2">
                  {cat}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8.5px] leading-none tracking-normal transition-colors duration-300 ${
                      isActive
                        ? "bg-gold text-ink"
                        : "bg-fg/10 text-fg/50 group-hover:bg-fg group-hover:text-surface"
                    }`}
                  >
                    {count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p
          key={activeCategory}
          className="cal-item mt-5 font-display text-lg font-medium tracking-[-0.01em] text-fg/70"
        >
          {filtered.length} frame{filtered.length === 1 ? "" : "s"}
          <span className="text-gold"> · </span>
          <span className="text-fg/40">
            {activeCategory === "All" ? "the full archive" : activeCategory}
          </span>
        </p>
      </div>

      {/* Asymmetric grid — re-animates on every filter change */}
      <div
        key={activeCategory}
        data-structured-content className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[264px] lg:grid-flow-dense md:gap-6"
      >
        {filtered.map((item, i) => (
          <article
            key={item.id}
            onClick={() => setSelectedIndex(i)}
            className={`g-tile group relative cursor-pointer overflow-hidden rounded-2xl bg-card ${tileClasses(item, i)}`}
            style={{ animationDelay: `${Math.min(i, 10) * 75}ms` }}
          >
            <Image
              src={item.image}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.07]"
            />

            {/* Image stays clean — a whisper of a gradient only on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
            {/* Gold corner hairline on hover */}
            <span className="pointer-events-none absolute inset-3 rounded-[1rem] border border-gold/0 transition-all duration-500 group-hover:border-gold/60" />

            {/* Tiny category pill — the only resting chrome */}
            <span className="absolute left-4 top-4 rounded-full bg-ink/70 px-3 py-1.5 font-sans text-[8px] uppercase tracking-[0.25em] text-white/80 backdrop-blur-sm transition-opacity duration-500 group-hover:opacity-0">
              {item.category}
            </span>

            {/* Expand affordance */}
            <span className="absolute right-4 top-4 grid h-10 w-10 -rotate-45 place-items-center rounded-full bg-gold text-ink opacity-0 transition-all duration-500 group-hover:rotate-0 group-hover:opacity-100">
              <Expand size={15} />
            </span>

            {/* Title only — appears on hover, small and unobtrusive */}
            <div className="absolute inset-x-5 bottom-4 translate-y-2.5 text-white opacity-0 transition-all duration-500 ease-out group-hover:translate-y-0 group-hover:opacity-100">
              <h3 className="font-display text-[15px] font-semibold leading-snug tracking-[-0.01em]">
                {item.title}
              </h3>
              <span className="mt-1.5 block h-px w-0 bg-gold transition-all duration-700 ease-out group-hover:w-12" />
            </div>
          </article>
        ))}
      </div>

      {/* Lightbox — animated panel, cinematic image swap */}
      {selectedItem && (
        <div
          onClick={() => setSelectedIndex(null)}
          className="g-fade fixed inset-0 z-[100] flex items-center justify-center bg-ink/96 p-3 backdrop-blur-sm md:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="g-panel relative flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-card text-white shadow-2xl"
          >
            {/* Top bar */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-gold px-3 py-1 font-sans text-[9px] uppercase tracking-[0.25em] text-ink">
                  {selectedItem.category}
                </span>
                <span className="flex items-center gap-1.5 font-sans text-[10px] uppercase tracking-[0.2em] text-white/50">
                  {selectedItem.year}
                  <span className="text-white/25">·</span>
                  <MapPin size={11} className="text-gold" />
                  {selectedItem.location}
                </span>
              </div>
              <button
                onClick={() => setSelectedIndex(null)}
                aria-label="Close image"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/20 text-white transition-all duration-300 hover:rotate-90 hover:bg-white hover:text-ink active:scale-90"
              >
                <X size={18} />
              </button>
            </div>

            {/* Main image — keyed swap animation */}
            <div className="relative min-h-[200px] w-full flex-1 overflow-hidden bg-ink">
              <Image
                key={selectedItem.id}
                src={selectedItem.image}
                alt={selectedItem.title}
                fill
                priority
                sizes="100vw"
                className="g-img-swap object-contain"
              />

              {/* Floating edge arrows (desktop) */}
              <button
                onClick={handlePrev}
                aria-label="Previous image"
                className="absolute left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-gold hover:bg-gold hover:text-ink active:scale-95 md:grid"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={handleNext}
                aria-label="Next image"
                className="absolute right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-ink/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110 hover:border-gold hover:bg-gold hover:text-ink active:scale-95 md:grid"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Bottom info — title/caption swap with the image */}
            <div
              key={`info-${selectedItem.id}`}
              className="flex shrink-0 flex-col gap-4 border-t border-white/10 p-6 md:flex-row md:items-center md:justify-between"
            >
              <div className="cal-item">
                <h2 className="font-display text-2xl font-semibold tracking-[-0.01em]">
                  {selectedItem.title}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/65">
                  {selectedItem.caption}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrev}
                  aria-label="Previous image"
                  className="flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium transition-all duration-300 hover:border-gold hover:bg-gold hover:text-ink active:scale-95"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>
                <span className="font-sans text-xs tabular-nums text-white/40">
                  {String((selectedIndex ?? 0) + 1).padStart(2, "0")} /{" "}
                  {String(filtered.length).padStart(2, "0")}
                </span>
                <button
                  onClick={handleNext}
                  aria-label="Next image"
                  className="flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-medium transition-all duration-300 hover:border-gold hover:bg-gold hover:text-ink active:scale-95"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Film-strip progress dots */}
            <div className="flex shrink-0 items-center justify-center gap-1.5 pb-4">
              {filtered.map((f, i) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedIndex(i)}
                  aria-label={`Go to image ${i + 1}`}
                  className={`h-1 rounded-full transition-all duration-400 ${
                    i === selectedIndex
                      ? "w-7 bg-gold"
                      : "w-1.5 bg-white/25 hover:bg-white/55"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
