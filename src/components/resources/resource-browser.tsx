"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, FileText, Film, Globe, Search, Star } from "lucide-react";
import { Reveal } from "@/components/reveal";

export type PublicResource = {
  id: number;
  title: string;
  description: string;
  category: string;
  url: string;
  linkType: string;
  medium: string;
  featured: boolean;
};

const TYPE_ICON: Record<string, typeof Globe> = {
  link: Globe,
  paper: FileText,
  document: FileText,
  video: Film,
};

const MEDIUMS = ["All", "Sinhala", "Tamil", "English"] as const;

export function ResourceBrowser({ resources }: { resources: PublicResource[] }) {
  const [category, setCategory] = useState("All");
  const [medium, setMedium] = useState<(typeof MEDIUMS)[number]>("All");
  const [query, setQuery] = useState("");

  const categories = useMemo(
    () => Array.from(new Set(resources.map((r) => r.category))),
    [resources],
  );

  const filtered = useMemo(
    () =>
      resources.filter(
        (r) =>
          (category === "All" || r.category === category) &&
          (medium === "All" || r.medium === medium || r.medium === "All") &&
          (!query ||
            r.title.toLowerCase().includes(query.toLowerCase()) ||
            r.description.toLowerCase().includes(query.toLowerCase())),
      ),
    [resources, category, medium, query],
  );

  return (
    <section className="bg-surface py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        {/* Filters */}
        <Reveal>
          <div className="flex flex-col gap-4 rounded-2xl border border-fg/10 bg-surface-2 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-1.5">
              {["All", ...categories].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`rounded-full border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    category === cat
                      ? "border-transparent bg-gold text-ink"
                      : "border-fg/15 text-fg/55 hover:border-fg/35 hover:text-fg"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-fg/40">
                  Medium
                </span>
                {MEDIUMS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMedium(m)}
                    className={`rounded-full border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                      medium === m
                        ? "border-transparent bg-fg text-surface"
                        : "border-fg/15 text-fg/50 hover:text-fg"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="ml-auto flex h-10 w-full items-center gap-2 rounded-full border border-fg/15 px-4 sm:w-72">
                <Search size={14} className="shrink-0 text-fg/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search resources…"
                  aria-label="Search resources"
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg/35"
                />
              </label>
            </div>
          </div>
        </Reveal>

        {/* Cards */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((resource, i) => {
            const Icon = TYPE_ICON[resource.linkType] ?? Globe;
            return (
              <Reveal key={resource.id} delay={(i % 3) * 80} className="h-full">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex h-full flex-col rounded-2xl border border-fg/10 bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-fg/25 hover:shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-gold">
                      <Icon size={17} />
                    </span>
                    {resource.featured && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-ink">
                        <Star size={9} fill="currentColor" /> Featured
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 font-display text-[1.3rem] font-semibold leading-snug tracking-[-0.01em]">
                    {resource.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 text-[13.5px] leading-relaxed text-fg/55">
                    {resource.description}
                  </p>
                  <div className="mt-auto flex items-center justify-between border-t border-fg/10 pt-4 mt-6">
                    <span className="rounded-full bg-fg/5 px-2.5 py-1 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-fg/50">
                      {resource.category}
                      {resource.medium !== "All" ? ` · ${resource.medium}` : ""}
                    </span>
                    <ArrowUpRight
                      size={15}
                      className="text-fg/30 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold"
                    />
                  </div>
                </a>
              </Reveal>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="mt-14 rounded-2xl border border-fg/10 bg-surface-2 p-10 text-center text-[13.5px] text-fg/50">
            No resources match your filters — try another category or medium.
          </p>
        )}
      </div>
    </section>
  );
}
