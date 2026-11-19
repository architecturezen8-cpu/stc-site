import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { siteNavLinks, type SiteNavLinkRow } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { DEFAULT_NAV_LINKS, type NavItem, type NavLeaf } from "@/lib/site-nav-defs";

/* ── v2.9.0.0 — Admin-managed main navigation ───────────────────────────
   The navbar renders from the site_nav_links table. One seeded copy of the
   original menu means the office's first edit continues from what the site
   already showed; the visual editor writes THROUGH to these same rows
   (data-nav-id), so Admin Studio and the visual editor share one source of
   truth and can never corrupt each other. */

let seeding: Promise<void> | null = null;

/* v2.9.7.0 — PERF: the root layout reads the nav tree on EVERY page render
   (one remote Supabase round trip each). 5 s in-process cache for the
   published tree; every admin nav write route calls invalidateNavTreeCache()
   so edits appear on the next render. */
const NAV_TTL_MS = 5_000;

const globalForNav = globalThis as typeof globalThis & {
  __stcNavTreePub?: { at: number; tree: NavItem[] };
};

export function invalidateNavTreeCache() {
  globalForNav.__stcNavTreePub = undefined;
}

/** One-time seed: fills the nav table from the original hardcoded menu. */
export function ensureNavSeed() {
  if (!seeding) {
    seeding = runNavSeed().catch((error) => {
      seeding = null;
      throw error;
    });
  }
  return seeding;
}

async function runNavSeed() {
  await ensureSchemaExtras();
  const [count] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(siteNavLinks);
  if ((count?.count ?? 0) > 0) return;

  for (let top = 0; top < DEFAULT_NAV_LINKS.length; top++) {
    const item = DEFAULT_NAV_LINKS[top];
    const [parent] = await db
      .insert(siteNavLinks)
      .values({
        label: item.label,
        href: item.href,
        parentId: null,
        sortOrder: (top + 1) * 10,
      })
      .returning();
    if (!parent || !item.children?.length) continue;
    await db.insert(siteNavLinks).values(
      item.children.map((child, index) => ({
        label: child.label,
        href: child.href,
        parentId: parent.id,
        sortOrder: (index + 1) * 10,
      })),
    );
  }
}

function leafOf(row: SiteNavLinkRow): NavLeaf {
  return { id: row.id, label: row.label, href: row.href };
}

/**
 * The published navigation tree — top-level items with their submenu
 * children, in admin-defined order. Falls back to the hardcoded menu when
 * the table is empty or the database hiccups, so the site always boots.
 */
export async function getNavTree(): Promise<NavItem[]> {
  const cached = globalForNav.__stcNavTreePub;
  if (cached && Date.now() - cached.at < NAV_TTL_MS) return cached.tree;

  try {
    await ensureNavSeed();
    const rows = await db
      .select()
      .from(siteNavLinks)
      .orderBy(
        asc(siteNavLinks.sortOrder),
        asc(siteNavLinks.id),
      );

    const tops = rows.filter((row) => row.parentId === null);
    if (tops.length === 0) return DEFAULT_NAV_LINKS;

    const tree: NavItem[] = tops.map((top) => {
      const children = rows.filter((row) => row.parentId === top.id);
      const item: NavItem = leafOf(top);
      if (children.length > 0) item.children = children.map(leafOf);
      return item;
    });

    globalForNav.__stcNavTreePub = { at: Date.now(), tree };
    return tree;
  } catch {
    return DEFAULT_NAV_LINKS;
  }
}

/** Flat rows for the admin manager (parents + children with parent ids). */
export async function getNavRows(): Promise<SiteNavLinkRow[]> {
  await ensureNavSeed();
  return db
    .select()
    .from(siteNavLinks)
    .orderBy(asc(siteNavLinks.sortOrder), asc(siteNavLinks.id));
}
