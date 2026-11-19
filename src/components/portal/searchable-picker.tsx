"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/**
 * v2.9.12.4 — SEARCHABLE PICKER (owner request on the timetable editor:
 * "dropdown eken hoyanna giyoth amarui … teacher id eka or name eka search
 * karalla gannath puluwan widiyata hadanawada. subject select karana
 * ekedith ehemmama karanna. classes selection ekedith ehema karanna.
 * dropdown list nathuwa").
 *
 * A trigger button (styled like the editor's other inputs) that opens a
 * panel with a SEARCH box and a GROUPED list — no native <select> anywhere.
 * Search matches the option label AND its sub-line (the teacher's staff
 * code "T-115", a subject code, a year…), case-insensitive.
 *
 * v2.9.12.6 — TWO PANEL MODES (owner: "teachersla select karana popup ekai
 * subject select karana popup ekai page eke center wenna dammoth hodai.
 * moka dan thiyana widiyata poddak amarui userta view karanna"):
 * · popover (default) — anchored under the trigger; the CLASS picker keeps
 *   this (it sits at the top of the card with room to open);
 * · `centered` — a full-screen scrim with the panel as a CENTERED modal
 *   (max-w-md, capped at 78dvh) — the SUBJECT and TEACHER pickers use this,
 *   because they open from the editor strip near the page bottom where the
 *   anchored popover clipped against the viewport edge.
 * The modal closes on backdrop click / Escape / the ✕ button, locks the
 * page scroll while open, and the keyboard-highlighted option is kept in
 * view (the whole-staff register is a long list).
 *
 * Shared by the teacher portal and the LMS studio timetable editor (the
 * --pt-* palette both sides mount — the studio aliases it onto --la-*).
 * The floating panel also carries a solid hex fallback so it can never
 * render transparent over the grid again (v2.9.12.5, owner: "popup eka
 * transparent ne. e nisa okkoma eka uda penne").
 *
 * v2.9.14.0 — the sub-line clamps at TWO lines instead of truncating to
 * one: the LMS studio seat pickers append "Class teacher of 10-C ·
 * Assistant, 8-A" marks to the staff sub-line and the owner reads them
 * without opening each row (short subs render exactly as before).
 */

export type PickerOption = {
  /** The value handed back through onChange (string — callers Number() it). */
  value: string;
  /** Primary line, e.g. "R.S. Kumara" or "Mathematics". */
  label: string;
  /** Secondary line — the staff code, subject code, year… also searched. */
  sub?: string;
};

export type PickerGroup = {
  heading: string;
  options: PickerOption[];
};

export function SearchablePicker({
  ariaLabel,
  value,
  display,
  groups,
  onChange,
  disabled = false,
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  centered = false,
}: {
  ariaLabel: string;
  /** The currently-selected value ("" = none). */
  value: string;
  /** What the trigger shows when the picker is closed. */
  display: string;
  groups: PickerGroup[];
  onChange: (value: string) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  /** true → fullscreen scrim + centered modal panel (subject/teacher);
      false → popover anchored under the trigger (class selector). */
  centered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  /* Close on outside pointer-down — popover mode only. The centered modal
     closes on backdrop click instead (the panel itself lives inside this
     root in the React tree, so containment can't tell scrim from panel). */
  useEffect(() => {
    if (!open || centered) return;
    function onDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, centered]);

  /* Focus the search when the panel opens — the reset of the query/active
     index happens in the toggle handler (no setState inside effects). */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => searchRef.current?.focus(), 20);
    return () => clearTimeout(t);
  }, [open]);

  /* Centered modal: lock the page scroll while the scrim is up. */
  useEffect(() => {
    if (!open || !centered) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, centered]);

  const flat = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        options: q
          ? g.options.filter(
              (o) =>
                o.label.toLowerCase().includes(q) ||
                (o.sub ?? "").toLowerCase().includes(q),
            )
          : g.options,
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, query]);

  const allOptions = useMemo(() => flat.flatMap((g) => g.options), [flat]);

  /* Keep the keyboard-highlighted option visible while arrowing through a
     long list (the whole-staff register). block:"nearest" is a no-op when
     the hovered/active row is already on screen. */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, flat]);

  function pick(o: PickerOption) {
    onChange(o.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, allOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = allOptions[active];
      if (o) pick(o);
    }
  }

  /* The search row is identical in both modes. */
  const searchRow = (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--pt-border)] px-3 py-2">
      <Search size={14} aria-hidden="true" className="shrink-0 text-[var(--pt-muted)]" />
      <input
        ref={searchRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        placeholder={searchPlaceholder}
        aria-label={`Search ${ariaLabel}`}
        className="min-h-9 w-full bg-transparent text-[13px] text-[var(--pt-heading)] outline-none placeholder:text-[var(--pt-placeholder)]"
      />
      {query ? (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-panel-soft)] hover:text-[var(--pt-heading)]"
        >
          <X size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  /* The grouped listbox is identical in both modes — only the scroll
     container differs (popover caps at 18rem; the modal flexes to the
     panel's 78dvh cap). */
  const listNode = (className: string) => (
    <div id={listId} role="listbox" aria-label={ariaLabel} className={className}>
      {allOptions.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-[var(--pt-muted)]">
          {emptyText}
        </p>
      ) : (
        flat.map((g) => (
          <div key={g.heading}>
            <p className="sticky top-0 z-10 bg-[var(--pt-panel,#101116)] px-4 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
              {g.heading}
            </p>
            {g.options.map((o) => {
              const selected = o.value === value;
              const idx = allOptions.indexOf(o);
              return (
                <button
                  key={`${g.heading}::${o.value}`}
                  ref={idx === active ? activeRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => pick(o)}
                  onMouseEnter={() => setActive(idx)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors ${
                    idx === active
                      ? "bg-[var(--pt-panel-soft)]"
                      : "hover:bg-[var(--pt-panel-soft)]"
                  } ${selected ? "text-[var(--pt-heading)]" : "text-[var(--pt-body)]"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">
                      {o.label}
                    </span>
                    {o.sub ? (
                      <span className="block line-clamp-2 text-[11.5px] text-[var(--pt-muted)]">
                        {o.sub}
                      </span>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check
                      size={15}
                      aria-hidden="true"
                      className="shrink-0 text-[var(--pt-accent)]"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => {
          if (!open) {
            /* Fresh panel state on every open. */
            setQuery("");
            setActive(0);
          }
          setOpen((o) => !o);
        }}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[13px] outline-none transition-colors focus:border-[var(--pt-accent)] ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] text-[var(--pt-heading)]`}
      >
        <span className="truncate">{display}</span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`shrink-0 text-[var(--pt-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        centered ? (
          /* ── CENTERED MODAL (subject / teacher) ─────────────────────── */
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] sm:p-6"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${ariaLabel} — options`}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[min(78dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--pt-border,#2a2b33)] bg-[var(--pt-panel,#101116)] shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--pt-border)] pb-1 pl-4 pr-2 pt-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--pt-muted)]">
                  {ariaLabel}
                </p>
                <button
                  type="button"
                  aria-label={`Close the ${ariaLabel.toLowerCase()} picker`}
                  onClick={() => setOpen(false)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--pt-muted)] transition-colors hover:bg-[var(--pt-panel-soft)] hover:text-[var(--pt-heading)]"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              {searchRow}
              {listNode("min-h-0 flex-1 overflow-y-auto overscroll-contain py-1")}
            </div>
          </div>
        ) : (
          /* ── ANCHORED POPOVER (class selector) ──────────────────────── */
          <div
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-[var(--pt-border,#2a2b33)] bg-[var(--pt-panel,#101116)] shadow-xl shadow-black/10"
            role="dialog"
            aria-label={`${ariaLabel} — options`}
          >
            {searchRow}
            {listNode("max-h-72 overflow-y-auto overscroll-contain py-1")}
          </div>
        )
      ) : null}
    </div>
  );
}
