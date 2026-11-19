"use client";

import type { ReactNode } from "react";

/**
 * v2.8.87.0 — the SHARED visual language of the two form editors
 * (Form Builder questions + Customize Fixed Forms cards).
 *
 * The owner's review of v2.8.86.0: "form builder ekei form editor ekei
 * editing fields okkoma ekagaode wage thiyenne — user kenekta tikak complex
 * therun ganna. eka lassanata align karala hadanna" — every editable field
 * used to be one long wrapping flex row (badge + inputs + toggles + buttons
 * all inline), which only ever lined up by accident on desktop. Both editors
 * now draw the SAME card anatomy instead:
 *
 *   · a header row — identity badge + status chips + the row actions;
 *   · a labelled control grid (`grid sm:grid-cols-2`, one concern per cell,
 *     small-caps label above each input) that is aligned by construction;
 *   · SwitchCell — a real toggle for every on/off setting, 44px touch-safe.
 *
 * Mobile keeps the single-column stack the owner already liked.
 */

export const ffInput =
  "w-full rounded-lg border border-white/12 bg-white/[0.05] px-3.5 py-2.5 text-[13px] text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#ffd444] disabled:cursor-not-allowed disabled:opacity-40";
export const ffTextarea = `${ffInput} resize-none leading-relaxed`;

/** Small-caps label + input slot — one labelled cell of the control grid. */
export function FieldBox({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-white/40">
          {label}
        </span>
        {hint && <span className="text-[9px] font-medium text-white/25">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * Bordered on/off toggle cell — a setting that reads as a setting, not a
 * stray checkbox floating in a row. 44px min height (touch-safe), the knob
 * is a real switch.
 */
export function SwitchCell({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3.5 py-2 transition-colors ${
        disabled
          ? "cursor-default border-white/8 bg-transparent opacity-45"
          : checked
            ? "cursor-pointer border-[#ffd444]/40 bg-[#ffd444]/[0.07]"
            : "cursor-pointer border-white/12 bg-white/[0.05] hover:border-white/25"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-white/80">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[10px] leading-snug text-white/35">{description}</span>
        )}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[#ffd444]" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full shadow transition-all ${
            checked ? "left-[18px] bg-[#0b0b0a]" : "left-0.5 bg-white/70"
          }`}
        />
      </span>
    </label>
  );
}

/** The numbered identity badge of an editable row (①, ②, …). */
export function FieldIndexBadge({ index }: { index: number }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10 text-[11px] font-bold text-white/60">
      {index}
    </span>
  );
}

/** A small status chip (Required / Hidden / Edited / the field type…). */
export function FieldChip({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "gold" | "dim";
}) {
  const tones = {
    muted: "bg-white/[0.07] text-white/50",
    gold: "bg-[#ffd444]/15 text-[#ffd444]",
    dim: "bg-white/[0.04] text-white/30",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** The shared icon-button row (↑ ↓ 🗑) of an editable question card. */
export function FieldActions({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-1.5">{children}</div>;
}

export const fieldIconButton =
  "grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-30";
export const fieldIconDelete =
  "grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/50 transition-colors hover:border-red-400/50 hover:text-red-300";
