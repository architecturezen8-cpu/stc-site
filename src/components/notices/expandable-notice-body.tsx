"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Notice body text — short notices render in full; long ones clamp to four
 * lines with an accessible expand/collapse control (the button only exists
 * when the text is actually long, so short notices carry no dead UI).
 */
export function ExpandableNoticeBody({
  body,
  clampLines = 4,
  threshold = 180,
}: {
  body: string;
  clampLines?: number;
  threshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = body.trim().length > threshold;

  if (!isLong) {
    return (
      <p className="text-[14.5px] leading-relaxed whitespace-pre-line text-fg/65">
        {body}
      </p>
    );
  }

  return (
    <div>
      <p
        className={`text-[14.5px] leading-relaxed whitespace-pre-line text-fg/65 ${
          expanded ? "" : "line-clamp-4"
        }`}
      >
        {body}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] text-gold transition-colors hover:text-fg"
      >
        {expanded ? "Show less" : "Read full notice"}
        <ChevronDown
          size={13}
          className={`transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
    </div>
  );
}
