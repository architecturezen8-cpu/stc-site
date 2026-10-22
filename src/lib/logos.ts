import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logoAssets, type LogoAsset } from "@/db/schema";
import { COLLEGE_CLUBS, clubSlug } from "@/lib/clubs";
import { UNITS } from "@/lib/units";

/**
 * Central logo registry.
 *
 * Every crest/logo on the site is identified by a stable `logoKey`:
 *   · `school-crest`            — the college crest (navbar, footer, branding)
 *   · `club-crest-<slug>`       — one per club/society
 *   · `cadet-crest-<unit-slug>` — one per cadeting unit (shared by the
 *                                 list page, detail page and cine intro)
 *   · `honour-crest-<slug>`     — achievements trophy-wall crests
 *
 * Every rendered instance READS this table, so changing a logo once —
 * from the admin Logos manager or the visual editor — automatically
 * syncs every page that displays it. No per-page re-editing, ever.
 */

export type LogoValue = { src: string; scale: number };

export type LogoMap = Record<string, LogoValue>;

/* ── Runtime schema guard ────────────────────────────────────────────────
   The sandbox database is created by scripts/db-setup.mjs from the
   generated migrations. For databases created before logo_assets existed,
   these idempotent statements create the missing table on first use —
   no manual migration step required. */
let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "logo_assets" (
          "id" serial PRIMARY KEY,
          "logo_key" varchar(120) NOT NULL UNIQUE,
          "label" text DEFAULT '' NOT NULL,
          "group" varchar(40) DEFAULT 'general' NOT NULL,
          "draft_src" text DEFAULT '' NOT NULL,
          "published_src" text DEFAULT '' NOT NULL,
          "draft_scale" integer DEFAULT 100 NOT NULL,
          "published_scale" integer DEFAULT 100 NOT NULL,
          "updated_by" integer,
          "updated_at" timestamp DEFAULT now() NOT NULL
        )
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Known logo identities, pre-seeded so the manager is never empty. */
export const LOGO_IDENTITIES: Array<{
  logoKey: string;
  label: string;
  group: string;
}> = [
  /* v2.8.60.0 — the BRAND group: ONE registry place for every college-level
     logo (the owner: "logo & crest section eken site eke, student, parent,
     teachers, login portals walata … logo danna puluwan wenna damu"). Each
     surface falls back to the College Crest when its own entry is empty. */
  { logoKey: "school-crest", label: "College Crest (whole site)", group: "brand" },
  { logoKey: "portal-logo-student", label: "Student Portal logo", group: "brand" },
  { logoKey: "portal-logo-teacher", label: "Teacher Portal logo", group: "brand" },
  { logoKey: "portal-logo-parent", label: "Parent Portal logo", group: "brand" },
  { logoKey: "portal-logo-login", label: "Login & Register portals logo", group: "brand" },
  { logoKey: "portal-logo-admin", label: "Admin Studio logo (synced)", group: "brand" },
  ...COLLEGE_CLUBS.map((club) => ({
    logoKey: `club-crest-${clubSlug(club.name)}`,
    label: club.name,
    group: "clubs",
  })),
  ...UNITS.map((unit) => ({
    logoKey: `cadet-crest-${unit.slug}`,
    label: unit.name,
    group: "cadeting",
  })),
];

export const LOGO_GROUPS: Array<{ id: string; label: string }> = [
  { id: "brand", label: "School & Portals" },
  { id: "clubs", label: "Clubs & Societies" },
  { id: "cadeting", label: "Cadeting Units" },
  { id: "general", label: "Other" },
];

/** The brand logo keys — saves on these go LIVE immediately (no draft step). */
export const BRAND_LOGO_KEYS: ReadonlySet<string> = new Set([
  "school-crest",
  "portal-logo-student",
  "portal-logo-teacher",
  "portal-logo-parent",
  "portal-logo-login",
  "portal-logo-admin",
]);

/** All registry rows, creating missing known identities on the way. */
export async function listLogoAssets(): Promise<LogoAsset[]> {
  await ensureSchema();
  const rows = await db.select().from(logoAssets).orderBy(logoAssets.id);
  const known = new Set(rows.map((row) => row.logoKey));
  const missing = LOGO_IDENTITIES.filter((identity) => !known.has(identity.logoKey));
  if (missing.length > 0) {
    await db.insert(logoAssets).values(missing).onConflictDoNothing();
  }
  /* v2.8.60.0 — the school crest now lives in the BRAND group with the
     portal logos; older rows carry group='school' (a tab that no longer
     exists), so fold them over once. */
  await db
    .update(logoAssets)
    .set({ group: "brand" })
    .where(sql`${logoAssets.group} = 'school'`);
  return db.select().from(logoAssets).orderBy(logoAssets.id);
}

/** Published values — used by every public page render. */
export async function getPublishedLogoMap(): Promise<LogoMap> {
  const rows = await listLogoAssets();
  const map: LogoMap = {};
  for (const row of rows) {
    if (row.publishedSrc) {
      map[row.logoKey] = { src: row.publishedSrc, scale: row.publishedScale };
    }
  }
  return map;
}

/** Draft values — used by the visual editor preview. */
export async function getDraftLogoMap(): Promise<LogoMap> {
  const rows = await listLogoAssets();
  const map: LogoMap = {};
  for (const row of rows) {
    if (row.draftSrc) {
      map[row.logoKey] = { src: row.draftSrc, scale: row.draftScale };
    }
  }
  return map;
}

function safeSrc(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!text.startsWith("/") && !text.startsWith("https://")) return null;
  return text.slice(0, 2000);
}

function safeScale(value: unknown, fallback = 100): number {
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return fallback;
  return Math.max(40, Math.min(240, num));
}

/** Create or update one registry entry. */
export async function upsertLogoAsset({
  logoKey,
  label,
  group,
  src,
  scale,
  publish,
  userId,
}: {
  logoKey: string;
  label?: string;
  group?: string;
  src?: string | null;
  scale?: number;
  publish?: boolean;
  userId?: number;
}): Promise<LogoAsset> {
  await ensureSchema();
  const key = logoKey.trim().slice(0, 120);
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error("Invalid logo key.");

  const [existing] = await db
    .select()
    .from(logoAssets)
    .where(sql`${logoAssets.logoKey} = ${key}`)
    .limit(1);

  const image = src === undefined ? undefined : safeSrc(src) ?? "";

  /* v2.8.59.1 — ACCIDENT-PROOF SAVES. The Logos manager's editor always
     posts {src, scale}; when the URL box arrives empty while the entry
     still holds an image, that save was almost certainly meant to change
     the size only (the owner hit Save with the box cleared — the live
     crest was wiped exactly this way, scale 70→40, src→""). A save that
     carries a scale therefore KEEPS the existing draft image; only the
     explicit Remove button (which posts src:"" with NO scale) may blank
     it. Publishing still mirrors whatever the draft holds, so clearing
     remains a two deliberate steps: Remove, then Publish. */
  const keepExistingImage =
    image === "" &&
    scale !== undefined &&
    Boolean(existing) &&
    Boolean(existing?.draftSrc || existing?.publishedSrc);

  const values = {
    label: (label ?? existing?.label ?? "").slice(0, 300),
    group: (group ?? existing?.group ?? "general").slice(0, 40),
    ...(image !== undefined && !keepExistingImage ? { draftSrc: image } : {}),
    ...(scale !== undefined ? { draftScale: safeScale(scale) } : {}),
    updatedBy: userId ?? existing?.updatedBy ?? null,
    updatedAt: new Date(),
  };

  if (!existing) {
    const [created] = await db
      .insert(logoAssets)
      .values({
        logoKey: key,
        draftSrc: image ?? "",
        publishedSrc: publish ? image ?? "" : "",
        draftScale: safeScale(scale),
        publishedScale: publish ? safeScale(scale) : 100,
        ...values,
      })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(logoAssets)
    .set({
      ...values,
      ...(publish
        ? {
            /* v2.8.60.0 — a scale-only publish must mirror the KEPT image,
               not the empty url box (QA-60 caught the published crest
               blanking while the draft survived). */
            publishedSrc:
              image !== undefined && !keepExistingImage
                ? image
                : existing.draftSrc || existing.publishedSrc,
            publishedScale: safeScale(scale ?? existing.draftScale),
          }
        : {}),
    })
    .where(sql`${logoAssets.id} = ${existing.id}`)
    .returning();
  return updated;
}

/** Discard a single logo draft — back to the published value. */
export async function revertLogoAsset(logoKey: string): Promise<LogoAsset | null> {
  await ensureSchema();
  const [existing] = await db
    .select()
    .from(logoAssets)
    .where(sql`${logoAssets.logoKey} = ${logoKey}`)
    .limit(1);
  if (!existing) return null;
  const [updated] = await db
    .update(logoAssets)
    .set({
      draftSrc: existing.publishedSrc,
      draftScale: existing.publishedScale,
      updatedAt: new Date(),
    })
    .where(sql`${logoAssets.id} = ${existing.id}`)
    .returning();
  return updated;
}

/** Publish a single logo row (draft → published). */
export async function publishLogoAsset(logoKey: string, userId?: number): Promise<LogoAsset | null> {
  await ensureSchema();
  const [existing] = await db
    .select()
    .from(logoAssets)
    .where(sql`${logoAssets.logoKey} = ${logoKey}`)
    .limit(1);
  if (!existing) return null;
  const [updated] = await db
    .update(logoAssets)
    .set({
      publishedSrc: existing.draftSrc,
      publishedScale: existing.draftScale,
      updatedBy: userId ?? null,
      updatedAt: new Date(),
    })
    .where(sql`${logoAssets.id} = ${existing.id}`)
    .returning();
  return updated;
}

/** Promote every draft logo to published (global sync). */
export async function publishAllLogoDrafts(userId?: number): Promise<number> {
  await ensureSchema();
  const rows = await db.select().from(logoAssets);
  let count = 0;
  for (const row of rows) {
    if (row.draftSrc !== row.publishedSrc || row.draftScale !== row.publishedScale) {
      await db
        .update(logoAssets)
        .set({
          publishedSrc: row.draftSrc,
          publishedScale: row.draftScale,
          updatedBy: userId ?? null,
          updatedAt: new Date(),
        })
        .where(sql`${logoAssets.id} = ${row.id}`);
      count += 1;
    }
  }
  return count;
}

/** Number of registry entries with unpublished changes. */
export async function countPendingLogoDrafts(): Promise<number> {
  await ensureSchema();
  const rows = await db.select().from(logoAssets);
  return rows.filter(
    (row) => row.draftSrc !== row.publishedSrc || row.draftScale !== row.publishedScale,
  ).length;
}

/** The school crest image (published) — merged into site settings. */
export async function getSchoolCrestSrc(): Promise<string> {
  await ensureSchema().catch(() => undefined);
  try {
    const [row] = await db
      .select({ src: logoAssets.publishedSrc })
      .from(logoAssets)
      .where(sql`${logoAssets.logoKey} = 'school-crest'`)
      .limit(1);
    return row?.src ?? "";
  } catch {
    return "";
  }
}

/* ── v2.8.60.0 — BRAND LOGO READERS ────────────────────────────────────────
   Every college-level surface (portals, login screens, Admin Studio) reads
   its OWN registry entry — falling back to the College Crest — and carries
   BOTH the white-circle fill scale AND a version stamp, so the browser can
   never show a stale image after a change (the media byte route is served
   with a 1-year immutable cache; `?v=` busts it when an entry is updated). */

export type BrandLogo = { src: string; scale: number; version: number };

function toBrandLogo(row: LogoAsset | undefined): BrandLogo {
  const version = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  return {
    src: row?.publishedSrc ?? "",
    scale: row?.publishedScale ?? 100,
    version: Number.isFinite(version) ? version : 0,
  };
}

/** Append a freshness stamp — identical URLs re-fetch after a replace. */
export function stampLogoUrl(logo: BrandLogo): string {
  if (!logo.src || logo.src.startsWith("data:")) return logo.src;
  const joiner = logo.src.includes("?") ? "&" : "?";
  return `${logo.src}${joiner}v=${logo.version || logo.scale}`;
}

/** One brand entry (published) — src may be "" when nothing is set. */
export async function getBrandLogoValue(logoKey: string): Promise<BrandLogo> {
  await ensureSchema().catch(() => undefined);
  try {
    const [row] = await db
      .select()
      .from(logoAssets)
      .where(sql`${logoAssets.logoKey} = ${logoKey}`)
      .limit(1);
    return toBrandLogo(row);
  } catch {
    return { src: "", scale: 100, version: 0 };
  }
}

export type BrandSurface =
  | "student"
  | "teacher"
  | "parent"
  | "principal"
  | "login"
  | "admin";

/**
 * The logo for ONE surface: its own `portal-logo-<surface>` entry when set,
 * otherwise the College Crest (`school-crest`) — so setting ONE crest logo
 * dresses the whole college, and each portal can still be overridden.
 */
export async function getPortalBrandLogo(
  surface: BrandSurface,
): Promise<BrandLogo> {
  const own = await getBrandLogoValue(`portal-logo-${surface}`);
  if (own.src) return own;
  return getBrandLogoValue("school-crest");
}

/** The College Crest with its scale + version (site navbar/footer/maintenance). */
export async function getSchoolCrestValue(): Promise<BrandLogo> {
  return getBrandLogoValue("school-crest");
}
