import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  cmsPages,
  cmsRevisions,
  cmsSections,
  siteSettings,
} from "@/db/schema";
import {
  CMS_PAGES,
  SITE_SETTINGS_DEFAULTS,
  getCmsPageDefinition,
} from "@/lib/cms-defaults";

export type CmsSectionView = {
  id: number;
  key: string;
  label: string;
  type: string;
  data: Record<string, string>;
  hidden: boolean;
  order: number;
};

export type CmsPageView = {
  slug: string;
  title: string;
  description: string;
  path: string;
  status: string;
  updatedAt: string;
  hasDraftChanges: boolean;
  sections: CmsSectionView[];
};

/* v2.9.7.0 — PERF: the public site re-reads the same published rows on every
   render (root layout + page + visual blocks), and each read is a remote
   Supabase round trip. Hot PUBLISHED reads now sit behind a tiny in-process
   TTL cache (5 s — every admin write path busts it via the invalidate
   helpers below). DRAFT/admin reads stay uncached so editors always see
   fresh data. Same pattern the maintenance gate already uses (3 s). */
const PUB_TTL_MS = 5_000;

const globalForCms = globalThis as typeof globalThis & {
  __stcCmsSettingsPub?: { at: number; value: Record<string, string> };
  __stcCmsPagePub?: Map<string, { at: number; value: CmsPageView }>;
};

export function invalidateSiteSettingsCache() {
  globalForCms.__stcCmsSettingsPub = undefined;
}

export function invalidateCmsPageCache(slug?: string) {
  if (slug) globalForCms.__stcCmsPagePub?.delete(slug);
  else globalForCms.__stcCmsPagePub = undefined;
}

let seeded: Promise<void> | null = null;

async function runCmsSeed() {
  const existingSettings = await db
    .select({ id: siteSettings.id })
    .from(siteSettings)
    .where(eq(siteSettings.key, "site_identity"))
    .limit(1);
  if (existingSettings.length === 0) {
    await db.insert(siteSettings).values({
      key: "site_identity",
      draftValue: SITE_SETTINGS_DEFAULTS,
      publishedValue: SITE_SETTINGS_DEFAULTS,
    });
  }

  for (const page of CMS_PAGES) {
    const existingPage = await db
      .select({ id: cmsPages.id })
      .from(cmsPages)
      .where(eq(cmsPages.slug, page.slug))
      .limit(1);

    if (existingPage.length === 0) {
      await db.insert(cmsPages).values({
        slug: page.slug,
        title: page.title,
        description: page.description,
        status: "published",
      });
    }

    for (let i = 0; i < page.sections.length; i++) {
      const section = page.sections[i];
      const existingSection = await db
        .select({ id: cmsSections.id })
        .from(cmsSections)
        .where(
          and(
            eq(cmsSections.pageSlug, page.slug),
            eq(cmsSections.sectionKey, section.key),
          ),
        )
        .limit(1);

      if (existingSection.length === 0) {
        await db.insert(cmsSections).values({
          pageSlug: page.slug,
          sectionKey: section.key,
          label: section.label,
          sectionType: section.type,
          draftData: section.data,
          publishedData: section.data,
          draftOrder: i,
          publishedOrder: i,
          draftHidden: false,
          publishedHidden: false,
        });
      }
    }
  }
}

export async function ensureCmsSeed() {
  if (!seeded) {
    seeded = runCmsSeed().catch((error) => {
      seeded = null;
      throw error;
    });
  }
  return seeded;
}

function changed(row: typeof cmsSections.$inferSelect) {
  return (
    JSON.stringify(row.draftData) !== JSON.stringify(row.publishedData) ||
    row.draftHidden !== row.publishedHidden ||
    row.draftOrder !== row.publishedOrder
  );
}

export async function getCmsPage(
  slug: string,
  mode: "draft" | "published" = "published",
): Promise<CmsPageView | null> {
  /* v2.9.7.0 — published page views are the hottest read on the site. */
  if (mode === "published") {
    const cached = globalForCms.__stcCmsPagePub?.get(slug);
    if (cached && Date.now() - cached.at < PUB_TTL_MS) return cached.value;
  }

  await ensureCmsSeed();
  const definition = getCmsPageDefinition(slug);
  if (!definition) return null;

  const [page] = await db
    .select()
    .from(cmsPages)
    .where(eq(cmsPages.slug, slug))
    .limit(1);
  if (!page) return null;

  const rows = await db
    .select()
    .from(cmsSections)
    .where(eq(cmsSections.pageSlug, slug))
    .orderBy(
      mode === "draft" ? asc(cmsSections.draftOrder) : asc(cmsSections.publishedOrder),
    );

  const view: CmsPageView = {
    slug,
    title: page.title,
    description: page.description ?? definition.description,
    path: definition.path,
    status: page.status,
    updatedAt: page.updatedAt.toISOString(),
    hasDraftChanges: rows.some(changed),
    sections: rows.map((row) => ({
      id: row.id,
      key: row.sectionKey,
      label: row.label,
      type: row.sectionType,
      data: mode === "draft" ? row.draftData : row.publishedData,
      hidden: mode === "draft" ? row.draftHidden : row.publishedHidden,
      order: mode === "draft" ? row.draftOrder : row.publishedOrder,
    })),
  };

  if (mode === "published") {
    (globalForCms.__stcCmsPagePub ??= new Map()).set(slug, {
      at: Date.now(),
      value: view,
    });
  }
  return view;
}

export async function getPageContent(
  slug: string,
  mode: "draft" | "published" = "published",
) {
  const page = await getCmsPage(slug, mode);
  if (!page) return {};
  return Object.fromEntries(
    page.sections.map((section) => [section.key, section.data]),
  ) as Record<string, Record<string, string>>;
}

export async function updateDraftSection({
  pageSlug,
  sectionKey,
  data,
  hidden,
  userId,
}: {
  pageSlug: string;
  sectionKey: string;
  data: Record<string, string>;
  hidden: boolean;
  userId: number;
}) {
  const [updated] = await db
    .update(cmsSections)
    .set({
      draftData: data,
      draftHidden: hidden,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(cmsSections.pageSlug, pageSlug),
        eq(cmsSections.sectionKey, sectionKey),
      ),
    )
    .returning();

  if (!updated) throw new Error("Section not found");

  invalidateCmsPageCache(pageSlug);

  await db
    .update(cmsPages)
    .set({ status: "draft", updatedBy: userId, updatedAt: new Date() })
    .where(eq(cmsPages.slug, pageSlug));

  await db.insert(adminAuditLogs).values({
    userId,
    action: "save_draft",
    entity: "cms_section",
    entityId: `${pageSlug}:${sectionKey}`,
    details: { fields: Object.keys(data), hidden },
  });
  return updated;
}

export async function reorderDraftSections({
  pageSlug,
  keys,
  userId,
}: {
  pageSlug: string;
  keys: string[];
  userId: number;
}) {
  await Promise.all(
    keys.map((key, index) =>
      db
        .update(cmsSections)
        .set({ draftOrder: index, updatedBy: userId, updatedAt: new Date() })
        .where(
          and(eq(cmsSections.pageSlug, pageSlug), eq(cmsSections.sectionKey, key)),
        ),
    ),
  );
  await db
    .update(cmsPages)
    .set({ status: "draft", updatedBy: userId, updatedAt: new Date() })
    .where(eq(cmsPages.slug, pageSlug));
}

export async function publishCmsPage(pageSlug: string, userId: number) {
  const before = await getCmsPage(pageSlug, "published");
  if (!before) throw new Error("Page not found");

  await db.insert(cmsRevisions).values({
    pageSlug,
    snapshot: before,
    action: "publish_snapshot",
    createdBy: userId,
  });

  const rows = await db
    .select()
    .from(cmsSections)
    .where(eq(cmsSections.pageSlug, pageSlug));

  await Promise.all(
    rows.map((row) =>
      db
        .update(cmsSections)
        .set({
          publishedData: row.draftData,
          publishedHidden: row.draftHidden,
          publishedOrder: row.draftOrder,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(cmsSections.id, row.id)),
    ),
  );

  await db
    .update(cmsPages)
    .set({
      status: "published",
      updatedBy: userId,
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(cmsPages.slug, pageSlug));

  invalidateCmsPageCache(pageSlug);

  await db.insert(adminAuditLogs).values({
    userId,
    action: "publish",
    entity: "cms_page",
    entityId: pageSlug,
  });
}

export async function discardDraft(pageSlug: string, userId: number) {
  const rows = await db
    .select()
    .from(cmsSections)
    .where(eq(cmsSections.pageSlug, pageSlug));
  await Promise.all(
    rows.map((row) =>
      db
        .update(cmsSections)
        .set({
          draftData: row.publishedData,
          draftHidden: row.publishedHidden,
          draftOrder: row.publishedOrder,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(cmsSections.id, row.id)),
    ),
  );
  invalidateCmsPageCache(pageSlug);
  await db
    .update(cmsPages)
    .set({ status: "published", updatedBy: userId, updatedAt: new Date() })
    .where(eq(cmsPages.slug, pageSlug));
}

export async function listRevisions(pageSlug: string) {
  await ensureCmsSeed();
  return db
    .select()
    .from(cmsRevisions)
    .where(eq(cmsRevisions.pageSlug, pageSlug))
    .orderBy(desc(cmsRevisions.createdAt))
    .limit(12);
}

export async function restoreRevision(
  pageSlug: string,
  revisionId: number,
  userId: number,
) {
  const [revision] = await db
    .select()
    .from(cmsRevisions)
    .where(
      and(eq(cmsRevisions.id, revisionId), eq(cmsRevisions.pageSlug, pageSlug)),
    )
    .limit(1);
  if (!revision) throw new Error("Revision not found");

  const snapshot = revision.snapshot as CmsPageView;
  await Promise.all(
    snapshot.sections.map((section) =>
      db
        .update(cmsSections)
        .set({
          draftData: section.data,
          draftHidden: section.hidden,
          draftOrder: section.order,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cmsSections.pageSlug, pageSlug),
            eq(cmsSections.sectionKey, section.key),
          ),
        ),
    ),
  );
  invalidateCmsPageCache(pageSlug);
  await db
    .update(cmsPages)
    .set({ status: "draft", updatedBy: userId, updatedAt: new Date() })
    .where(eq(cmsPages.slug, pageSlug));
  await db.insert(adminAuditLogs).values({
    userId,
    action: "restore_revision",
    entity: "cms_page",
    entityId: pageSlug,
    details: { revisionId },
  });
}

export async function getSiteSettings(
  mode: "draft" | "published" = "published",
): Promise<Record<string, string>> {
  /* v2.9.7.0 — the layout + metadata + several components read this on
     every render; published values get the 5 s cache. */
  if (mode === "published") {
    const cached = globalForCms.__stcCmsSettingsPub;
    if (cached && Date.now() - cached.at < PUB_TTL_MS) return cached.value;
  }

  await ensureCmsSeed();
  const [row] = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, "site_identity"))
    .limit(1);
  if (!row) return SITE_SETTINGS_DEFAULTS;
  const merged = {
    ...SITE_SETTINGS_DEFAULTS,
    ...((mode === "draft" ? row.draftValue : row.publishedValue) as Record<
      string,
      string
    >),
  };

  if (mode === "published") {
    globalForCms.__stcCmsSettingsPub = { at: Date.now(), value: merged };
  }
  return merged;
}

/**
 * v2.8.67.0 — the settings row's updatedAt as a NUMBER stamp. The browser
 * tab icon URL carries this as ?v=… so EVERY assignment produces a NEW
 * icon URL — browsers (Chrome/Edge keep per-page favicon results in a
 * disk DB) must re-fetch instead of showing a stale default disc forever.
 * Any settings save/publish bumps it; DB trouble degrades to 0.
 */
export async function getSiteSettingsStamp(): Promise<number> {
  try {
    const [row] = await db
      .select({ updatedAt: siteSettings.updatedAt })
      .from(siteSettings)
      .where(eq(siteSettings.key, "site_identity"))
      .limit(1);
    return row?.updatedAt ? row.updatedAt.getTime() : 0;
  } catch {
    return 0;
  }
}

export async function updateSiteSettings({
  data,
  publish,
  userId,
}: {
  data: Record<string, string>;
  publish: boolean;
  userId: number;
}) {
  const clean = Object.fromEntries(
    Object.keys(SITE_SETTINGS_DEFAULTS).map((key) => [
      key,
      typeof data[key] === "string" ? data[key].slice(0, 2000) : "",
    ]),
  );
  await db
    .update(siteSettings)
    .set({
      draftValue: clean,
      ...(publish ? { publishedValue: clean } : {}),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(siteSettings.key, "site_identity"));
  invalidateSiteSettingsCache();
  await db.insert(adminAuditLogs).values({
    userId,
    action: publish ? "publish_settings" : "save_settings_draft",
    entity: "site_settings",
    entityId: "site_identity",
  });
}

export async function cmsDashboardStats() {
  await ensureCmsSeed();
  const pages = await db.select().from(cmsPages).orderBy(asc(cmsPages.id));
  const [{ revisions }] = await db
    .select({ revisions: sql<number>`count(*)::int` })
    .from(cmsRevisions);
  return { pages, revisions };
}
