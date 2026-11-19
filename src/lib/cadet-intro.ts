import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cadetIntroOverrides } from "@/db/schema";
import { getSiteSettings } from "@/lib/cms";
import type { Unit } from "@/lib/units";

/**
 * Per-unit cinematic preloader resolution.
 *
 * Every cadeting unit page has its own preloader, so each field resolves in
 * three steps: the unit's own override row → the global cadetIntro* settings
 * → the unit's built-in crest / tagline.
 */

export type ResolvedCadetIntro = {
  enabled: boolean;
  holdMs: number;
  logoSrc?: string;
  logoScale?: number;
  tagline: string;
};

export async function resolveCadetIntro(
  unit: Unit,
  unitLogo?: { src: string; scale?: number },
): Promise<ResolvedCadetIntro> {
  const settings = await getSiteSettings("published");

  let row: typeof cadetIntroOverrides.$inferSelect | undefined;
  try {
    [row] = await db
      .select()
      .from(cadetIntroOverrides)
      .where(eq(cadetIntroOverrides.unitSlug, unit.slug))
      .limit(1);
  } catch (error) {
    // Table not ready yet (or transient DB failure) — fall back to globals,
    // but never silently: a swallowed DB error here looks like "override lost".
    console.error("[cadet-intro] override lookup failed:", error);
    row = undefined;
  }

  const globalEnabled = settings.cadetIntroEnabled !== "false";
  const enabled =
    row?.enabled === "true" ? true : row?.enabled === "false" ? false : globalEnabled;

  const globalHold = Number(settings.cadetIntroHold) || 2400;
  const holdMs = typeof row?.holdMs === "number" && row.holdMs >= 0 ? row.holdMs : globalHold;

  const globalLogo = (settings.cadetIntroLogo ?? "").trim();
  const logoSrc = (row?.logoSrc ?? "").trim() || globalLogo || unitLogo?.src || undefined;

  const logoScale = (row?.logoSrc ?? "").trim()
    ? Math.min(240, Math.max(40, row?.logoScale ?? 100))
    : globalLogo
      ? Math.min(240, Math.max(40, Number(settings.cadetIntroLogoScale) || 100))
      : unitLogo?.scale;

  const tagline =
    (row?.tagline ?? "").trim() || (settings.cadetIntroTagline ?? "").trim() || unit.tagline;

  return { enabled, holdMs, logoSrc, logoScale, tagline };
}

/** All override rows — for the admin Preloaders manager. */
export async function listCadetIntroOverrides() {
  await ensureCadetIntroTable();
  return db.select().from(cadetIntroOverrides).orderBy(cadetIntroOverrides.unitSlug);
}

async function ensureCadetIntroTable() {
  const { ensureSchemaExtras } = await import("@/lib/schema-extras");
  await ensureSchemaExtras();
}
