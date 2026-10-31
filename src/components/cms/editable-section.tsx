"use client";

import type { ReactNode } from "react";
import { EyeOff, MousePointer2 } from "lucide-react";

export function EditableSection({
  sectionKey,
  label,
  preview,
  editable = false,
  hidden,
  children,
}: {
  sectionKey: string;
  label: string;
  /** Draft content is being rendered (admin iframe). */
  preview: boolean;
  /** Edit mode is switched on — show selectable overlays. */
  editable?: boolean;
  hidden?: boolean;
  children: ReactNode;
}) {
  // Public visitors and "view only" previews get the untouched site.
  if (!preview) return hidden ? null : <>{children}</>;
  if (!editable) return hidden ? null : <>{children}</>;

  const select = () => {
    // Direct editor: the toolbar lives on this same public page.
    window.dispatchEvent(
      new CustomEvent("stc-cms-select", { detail: { sectionKey } }),
    );
    // Device preview: the public page lives inside the toolbar's iframe.
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "stc-cms-select", sectionKey },
        window.location.origin,
      );
    }
  };

  return (
    <div
      data-cms-section={sectionKey}
      className={`group/cms relative ${hidden ? "min-h-32 opacity-60" : ""}`}
    >
      {!hidden && children}
      {hidden && (
        <div className="grid min-h-32 place-items-center border-y border-dashed border-amber-400 bg-amber-50 text-amber-900">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <EyeOff size={16} /> {label} is hidden in this draft
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={select}
        /* data-visual-ui keeps the element-level universal editor from
           intercepting clicks on the section overlay. */
        data-visual-ui=""
        className="absolute inset-0 z-40 cursor-pointer border-2 border-transparent bg-transparent transition-colors hover:border-[#ffd444] hover:bg-[#ffd444]/5 focus:border-[#ffd444] focus:outline-none"
        aria-label={`Edit ${label}`}
      >
        <span className="absolute left-3 top-3 inline-flex translate-y-1 items-center gap-2 rounded-full bg-[#ffd444] px-3 py-2 font-sans text-[10px] font-semibold uppercase tracking-[0.15em] text-[#0b0b0a] opacity-0 shadow-xl transition-all group-hover/cms:translate-y-0 group-hover/cms:opacity-100">
          <MousePointer2 size={12} /> {label}
        </span>
      </button>
    </div>
  );
}
