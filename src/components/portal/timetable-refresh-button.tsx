"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * v2.8.55.0 (owner item 1) — the student timetable's refresh icon, matching
 * the teacher page's: the icon itself spins 650ms while router.refresh()
 * re-runs the server page and lands fresh slots (same animation contract
 * the chat surfaces use — fast fetches never show a spinner swap).
 */
export function TimetableRefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        setSpinning(true);
        setTimeout(() => setSpinning(false), 650);
        router.refresh();
      }}
      disabled={spinning}
      aria-label="Refresh the timetable"
      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] text-[var(--pt-body)] transition-colors hover:border-[var(--pt-border-strong)] hover:text-[var(--pt-heading)] disabled:opacity-60"
    >
      <RefreshCw size={15} className={spinning ? "animate-spin" : ""} aria-hidden="true" />
    </button>
  );
}
