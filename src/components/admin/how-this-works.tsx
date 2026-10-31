import { Check, Lightbulb } from "lucide-react";

/**
 * v2.9.3.0 — the owner loved the "How this works" card in Admin →
 * Navigation and asked for the same card on the OTHER admin sections too:
 * "e wage anith sections walatath ewa work karana kohomada kiyala card ekak
 * danawada — eke technical details one na. user kenekta mokadda meken
 * wenne kiyala idea ekak ganna thibbanam athi."
 * One shared component, one consistent style, zero technical jargon — every
 * card simply answers: what happens on the site when I use this section?
 */
export function HowThisWorks({
  points,
  tip,
  className = "mt-8",
}: {
  /** Plain-language points — what this section does for the website. */
  points: string[];
  /** Optional one-line "good to know" note. */
  tip?: string;
  className?: string;
}) {
  return (
    <aside className={`${className} rounded-2xl border border-white/10 bg-[#0d0d0b] p-6`}>
      <p className="text-[9px] uppercase tracking-[0.25em] text-[#ffd444]">
        How this works
      </p>
      <ul className="mt-4 space-y-3 text-[12px] leading-relaxed text-white/50">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5">
            <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      {tip && (
        <div className="mt-5 rounded-xl border border-[#ffd444]/25 bg-[#ffd444]/[0.06] p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#ffd444]">
            <Lightbulb size={12} /> Good to know
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/50">{tip}</p>
        </div>
      )}
    </aside>
  );
}
