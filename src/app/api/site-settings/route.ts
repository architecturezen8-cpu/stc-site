import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/cms";
import {
  getBrandLogoValue,
  getPortalBrandLogo,
  stampLogoUrl,
} from "@/lib/logos";

export const dynamic = "force-dynamic";

/**
 * PUBLIC brand payload (v2.8.60.0) — one call, everything a client surface
 * needs to draw the college identity:
 *  · schoolLogo / schoolLogoScale — the COLLEGE CREST registry entry
 *    (version-stamped so a replaced image can never render stale), the
 *    navbar + footer fall back to their initials disc when empty.
 *  · adminLogo / adminLogoScale  — the Admin Studio logo (its own registry
 *    entry, falling back to the crest) so the studio emblem syncs by ID.
 * The published-value pipeline stays the same for every other setting.
 */
export async function GET() {
  const settings = await getSiteSettings("published");
  const [crest, adminLogo] = await Promise.all([
    getBrandLogoValue("school-crest").catch(() => ({ src: "", scale: 100, version: 0 })),
    getPortalBrandLogo("admin").catch(() => ({ src: "", scale: 100, version: 0 })),
  ]);
  return NextResponse.json(
    {
      ...settings,
      /* The registry is the ONE crest source — an empty crest MUST blank the
         legacy settings value so surfaces fall back honestly. */
      schoolLogo: stampLogoUrl(crest),
      schoolLogoScale: crest.scale,
      adminLogo: stampLogoUrl(adminLogo),
      adminLogoScale: adminLogo.scale,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
