import type { ReactNode } from "react";

import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";
import {
  PortalBrandProvider,
} from "@/components/portal/portal-brand";

/**
 * parent portal root layout — v2.8.60.0. Delivers the portal's BRAND LOGO to
 * PortalShell from the server: its own `portal-logo-parent` registry entry
 * (Admin → Logos & Crests) with the College Crest as the fallback, complete
 * with the white-circle fill scale and a freshness stamp — the header paints
 * the right logo, at the right size, on the first payload.
 */
export default async function parentPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const brand = await getPortalBrandLogo("parent").catch(() => null);
  const value = brand && brand.src
    ? { src: stampLogoUrl(brand), scale: brand.scale, version: brand.version }
    : null;
  return (
    <PortalBrandProvider brand={value}>{children}</PortalBrandProvider>
  );
}
