"use client";

import { type MouseEvent, type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Navigates to a cadet unit page.
 *
 * v2.8.20 — the cinematic play now happens EXACTLY ONCE per navigation:
 * only the destination page's own intro card runs. The old "exit card +
 * enter card" pair was removed because visitors saw two identical
 * preloaders back-to-back (leave + enter) for a single click.
 *
 * The link prefetches on mount so the handoff to the destination page —
 * and its single preloader — is instant.
 */
export function CadetExploreLink({
  href,
  children,
  className = "",
}: {
  href: string;
  /** Kept for call-site compatibility (no longer rendered anywhere). */
  unitName?: string;
  crest?: string;
  tagline?: string;
  logoSrc?: string;
  logoScale?: number;
  logoId?: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  // Prefetch early so clicking feels instant even on dynamic unit pages.
  useEffect(() => {
    router.prefetch(href);
  }, [href, router]);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    router.push(href);
  };

  return (
    <a href={href} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
