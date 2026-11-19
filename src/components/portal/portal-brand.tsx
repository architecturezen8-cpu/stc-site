"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The SCHOOL LOGO, delivered server-side.
 *
 * v2.8.60.0 — the payload now carries the WHITE-CIRCLE FILL SCALE too (the
 * owner: "logo eke white circal eke size eka adjest karana option eka …
 * student, teachers, parents portal wala wada karanne na") plus a version
 * stamp, and each portal layout reads its OWN registry entry
 * (`portal-logo-student|teacher|parent`) with the College Crest as the
 * fallback — the same source the website header uses. One registry save in
 * Admin → Logos & Crests dresses every surface; no fetch, no flash.
 *
 * `brand === null` means "no logo set" (the STC initials disc stands in);
 * the provider is optional so pages rendered outside a portal layout can
 * still fall back to their own fetching.
 */
export type PortalBrandValue = {
  src: string;
  scale: number;
  version: number;
} | null;

const PortalBrandContext = createContext<PortalBrandValue | undefined>(
  undefined,
);

export function PortalBrandProvider({
  brand,
  children,
}: {
  brand: PortalBrandValue;
  children: ReactNode;
}) {
  return (
    <PortalBrandContext.Provider value={brand}>
      {children}
    </PortalBrandContext.Provider>
  );
}

/** The server-delivered brand logo, or undefined when no provider is present. */
export function usePortalBrand(): PortalBrandValue | undefined {
  return useContext(PortalBrandContext);
}
