"use client";

import { useState } from "react";

const CUSTOM_VALUE = "__custom__";

/**
 * v2.8.69.0 — pick from the known list OR type a brand-new value. A native
 * <select> always opens on every device (the old datalist fields never did
 * on mobile); choosing "Custom…" swaps in a text field for a new folder or
 * category, and it auto-collapses once the value matches the known list.
 * v2.9.8.0 — extracted from media-library.tsx so the media picker's upload
 * strip and the asset drawer share the exact same control (one behaviour,
 * no drift) — the owner's "choose an existing folder or create a new one"
 * upload requirement.
 */
export function PickOrType({
  label,
  value,
  onChange,
  options,
  customPlaceholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  customPlaceholder: string;
}) {
  const [typing, setTyping] = useState(value !== "" && !options.includes(value));
  const selectClass =
    "h-11 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3.5 text-[12px] text-white outline-none focus:border-[#ffd444]";
  /* A typed-but-unknown value can't be shown by the <select> — the Custom
     row carries it visually until a known option is chosen again. */
  const selectValue = typing
    ? CUSTOM_VALUE
    : value === "" || options.includes(value)
      ? value
      : CUSTOM_VALUE;
  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={(event) => {
          if (event.target.value === CUSTOM_VALUE) {
            setTyping(true);
            /* Switching from a known pick to typing starts empty; re-opening
               the editor on an existing custom value keeps it for editing. */
            if (value !== "" && options.includes(value)) onChange("");
          } else {
            setTyping(false);
            onChange(event.target.value);
          }
        }}
        className={selectClass}
        aria-label={label}
      >
        <option value="" className="bg-[#141412]">
          — Choose {label.toLowerCase()} —
        </option>
        {options.map((option) => (
          <option key={option} value={option} className="bg-[#141412]">
            {option}
          </option>
        ))}
        <option value={CUSTOM_VALUE} className="bg-[#141412]">
          Custom…
        </option>
      </select>
      {typing ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={customPlaceholder}
            className={selectClass}
            aria-label={`Custom ${label.toLowerCase()}`}
          />
          <button
            type="button"
            onClick={() => setTyping(false)}
            className="h-11 shrink-0 rounded-xl border border-white/15 px-4 text-[11px] font-semibold text-white/70 transition-colors hover:text-white"
          >
            Done
          </button>
        </div>
      ) : null}
    </div>
  );
}
