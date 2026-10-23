import type { ReactNode } from "react";

import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";
import { PortalBrandProvider } from "@/components/portal/portal-brand";

/**
 * principal portal root layout — v2.8.63.0. Delivers the portal's BRAND
 * LOGO to PortalShell from the server: its own `portal-logo-principal`
 * registry entry (Admin → Logos & Crests) with the College Crest as the
 * fallback — the same pattern as the teacher/student/parent layouts.
 */
export default async function principalPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const brand = await getPortalBrandLogo("principal").catch(() => null);
  const value = brand && brand.src
    ? { src: stampLogoUrl(brand), scale: brand.scale, version: brand.version }
    : null;
  return (
    <PortalBrandProvider brand={value}>{children}</PortalBrandProvider>
  );
}
