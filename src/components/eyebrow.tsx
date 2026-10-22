import type { ReactNode } from "react";

export function Eyebrow({
  children,
  tone = "dark",
}: {
  children: ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-gold" aria-hidden="true" />
      <span
        className={`font-sans text-[11px] uppercase tracking-[0.35em] ${
          tone === "light" ? "text-white/60" : "text-fg/50"
        }`}
      >
        {children}
      </span>
    </div>
  );
}
