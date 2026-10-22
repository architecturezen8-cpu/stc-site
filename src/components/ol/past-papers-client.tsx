"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  FileText,
  Filter,
  FolderOpen,
  Layers,
  Search,
} from "lucide-react";
import {
  MEDIUMS,
  OL_SUBJECTS,
  PAPER_YEARS,
  PAPERWIKI,
  resolvePaperLink,
  type Medium,
} from "@/lib/ol";

type SubjectFilter = "all" | string;

export function PastPapersClient() {
  const [medium, setMedium] = useState<Medium>("Sinhala");
  const [subject, setSubject] = useState<SubjectFilter>("all");
  const [query, setQuery] = useState("");

  const activeMedium = MEDIUMS.find((m) => m.id === medium)!;

  const subjects = useMemo(() => {
    const base =
      subject === "all"
        ? OL_SUBJECTS
        : OL_SUBJECTS.filter((s) => s.id === subject);
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.native.includes(query.trim()),
    );
  }, [subject, query]);

  return (
    <>
      {/* ——— Medium selector ——— */}
      <div>
        <p className="flex items-center gap-2.5 font-sans text-[10px] uppercase tracking-[0.3em] text-fg/45">
          <Layers size={13} className="text-gold" />
          Step 1 · Choose your medium
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {MEDIUMS.map((m) => {
            const isActive = m.id === medium;
            return (
              <button
                key={m.id}
                onClick={() => setMedium(m.id)}
                className={`group min-w-0 rounded-xl border p-5 text-left transition-all duration-300 active:scale-[0.98] ${
                  isActive
                    ? "border-transparent bg-card text-white shadow-lift"
                    : "border-fg/12 bg-surface hover:-translate-y-0.5 hover:border-gold/60"
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span
                    className={`font-display text-lg font-semibold tracking-[-0.01em] ${
                      isActive ? "text-white" : ""
                    }`}
                  >
                    {m.label}
                  </span>
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-300 ${
                      isActive
                        ? "bg-gold"
                        : "bg-fg/15 group-hover:bg-gold/60"
                    }`}
                  />
                </span>
                <span
                  className={`mt-1.5 block break-words text-[13px] ${
                    isActive ? "text-white/55" : "text-fg/50"
                  }`}
                >
                  {m.native}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ——— Subject + search ——— */}
      <div className="mt-12">
        <p className="flex items-center gap-2.5 font-sans text-[10px] uppercase tracking-[0.3em] text-fg/45">
          <Filter size={13} className="text-gold" />
          Step 2 · Filter by subject
        </p>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSubject("all")}
              className={`rounded-full border px-4 py-2.5 font-sans text-[10px] uppercase tracking-[0.18em] transition-all duration-300 active:scale-95 ${
                subject === "all"
                  ? "border-transparent bg-fg text-surface"
                  : "border-fg/15 text-fg/60 hover:border-fg hover:text-fg"
              }`}
            >
              All Subjects
            </button>
            {OL_SUBJECTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSubject(s.id)}
                className={`rounded-full border px-4 py-2.5 font-sans text-[10px] uppercase tracking-[0.18em] transition-all duration-300 active:scale-95 ${
                  subject === s.id
                    ? "border-transparent bg-fg text-surface"
                    : "border-fg/15 text-fg/60 hover:border-fg hover:text-fg"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-64">
            <Search
              size={14}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg/40"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subject…"
              aria-label="Search subject"
              className="h-11 w-full rounded-full border border-fg/15 bg-surface pl-10 pr-4 text-[13px] text-fg transition-colors duration-300 placeholder:text-fg/35 hover:border-fg/40 focus:border-gold focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ——— Results ——— */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-fg/10 pt-6">
        <p className="font-display text-lg font-medium tracking-[-0.01em] text-fg/70">
          {subjects.length} subject{subjects.length === 1 ? "" : "s"}
          <span className="text-gold"> · </span>
          <span className="text-fg/45">{activeMedium.label}</span>
        </p>
        <a
          href={PAPERWIKI}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.2em] text-fg/55 transition-colors hover:text-gold"
        >
          Browse everything on Past Papers WiKi
          <ExternalLink size={12} className="shrink-0" />
        </a>
      </div>

      <div key={`${medium}-${subject}`} className="mt-7 space-y-5">
        {subjects.map((s, i) => (
          <article
            key={s.id}
            className="g-tile min-w-0 overflow-hidden rounded-xl border border-fg/10 bg-surface"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            {/* Subject header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-fg/10 bg-surface-2 p-5 sm:p-6">
              <div className="min-w-0">
                <h3 className="break-words font-display text-xl font-semibold tracking-[-0.01em] sm:text-2xl">
                  {s.name}
                </h3>
                <p className="mt-1 break-words text-[12.5px] text-fg/50">
                  {s.native}
                </p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-fg/15 px-2.5 py-1 font-sans text-[8.5px] uppercase tracking-[0.18em] text-fg/50">
                  <span className="h-1 w-1 rounded-full bg-gold" />
                  {activeMedium.label}
                </p>
              </div>
              <a
                href={s.wiki.hub.url}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-[12px] font-medium text-ink transition-colors duration-300 hover:bg-fg hover:text-surface"
              >
                {s.wiki.hub.label}
                <ExternalLink size={12} className="shrink-0" />
              </a>
            </div>

            {/* Year links */}
            <div className="grid grid-cols-2 gap-px bg-fg/10 sm:grid-cols-3 lg:grid-cols-5">
              {PAPER_YEARS.map((y) => {
                const link = resolvePaperLink(s, medium, y);
                const Icon = link.direct ? FileText : FolderOpen;
                return (
                  <a
                    key={y}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={link.description}
                    className="group flex min-w-0 items-center gap-2.5 bg-surface px-4 py-4 transition-colors duration-300 hover:bg-surface-2"
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-300 ${
                        link.direct
                          ? "bg-gold/15 text-gold group-hover:bg-gold group-hover:text-ink"
                          : "bg-fg/5 text-fg/40 group-hover:bg-fg group-hover:text-surface"
                      }`}
                    >
                      <Icon size={13} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-[15px] font-semibold tracking-[-0.01em]">
                        {y}
                      </span>
                      <span className="block font-sans text-[8px] uppercase tracking-[0.16em] text-fg/40">
                        {link.direct ? "Past Paper" : link.label}
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>
          </article>
        ))}

        {subjects.length === 0 && (
          <div className="rounded-xl border border-dashed border-fg/20 px-5 py-14 text-center">
            <p className="text-[14px] text-fg/50">
              No subject matches “{query}”.
            </p>
            <button
              onClick={() => {
                setQuery("");
                setSubject("all");
              }}
              className="mt-4 rounded-full border border-fg/15 px-5 py-2.5 font-sans text-[10px] uppercase tracking-[0.2em] text-fg/60 transition-colors hover:border-fg hover:text-fg"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </>
  );
}
