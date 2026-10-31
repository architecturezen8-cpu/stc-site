import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, siteNavLinks } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { invalidateNavTreeCache } from "@/lib/site-nav";
import { isNavHref } from "@/lib/site-nav-defs";

/* ── v2.9.0.0 — Admin Studio → Navigation ────────────────────────────────
   CRUD over the site_nav_links table (navbar + mobile menu). The visual
   editor writes through to these SAME rows via data-nav-id, so there is
   exactly one source of truth for menu text and destinations. */

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

async function logAudit(
  adminId: number,
  action: string,
  entityId: number | string,
  details: Record<string, unknown>,
) {
  await db.insert(adminAuditLogs).values({
    userId: adminId,
    action,
    entity: "site_nav_link",
    entityId: String(entityId),
    details,
  });
}

/** Any nav change re-renders the root layout (server-delivered tree). */
function bustLayout() {
  revalidatePath("/", "layout");
  /* v2.9.7.0 — the layout's nav tree is now served from a 5 s process
     cache; every nav write must bust it or the menu lags up to 5 s. */
  invalidateNavTreeCache();
}

export async function GET(req: Request) {
  const admin = await guardApi("navigation", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();
  const rows = await db
    .select()
    .from(siteNavLinks)
    .orderBy(asc(siteNavLinks.sortOrder), asc(siteNavLinks.id));
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const admin = await guardApi("navigation", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const body = await req.json();
    const label = text(body.label).slice(0, 120);
    const href = text(body.href).slice(0, 2000);
    if (!label || !href) {
      return NextResponse.json({ error: "Label and link are required." }, { status: 400 });
    }
    if (!isNavHref(href)) {
      return NextResponse.json(
        { error: "Link must be a local path, anchor or HTTPS URL." },
        { status: 400 },
      );
    }
    const parentId = Number(body.parentId) || null;
    if (parentId) {
      const [parent] = await db
        .select({ id: siteNavLinks.id })
        .from(siteNavLinks)
        .where(eq(siteNavLinks.id, parentId))
        .limit(1);
      if (!parent) {
        return NextResponse.json({ error: "Parent menu item not found." }, { status: 400 });
      }
    }
    const sortOrder = Number.isFinite(Number(body.sortOrder))
      ? Math.round(Number(body.sortOrder))
      : 100;

    const [created] = await db
      .insert(siteNavLinks)
      .values({ label, href, parentId, sortOrder, updatedBy: admin.id })
      .returning();
    await logAudit(admin.id, "nav_add", created.id, { label, href, parentId });
    bustLayout();
    return NextResponse.json({ item: created });
  } catch (error) {
    console.error("[navigation] POST failed:", error);
    return NextResponse.json({ error: "Could not add the menu item." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("navigation", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: "Menu item id is required." }, { status: 400 });
    const item = body.item ?? {};

    const patch: Partial<typeof siteNavLinks.$inferInsert> = { updatedBy: admin.id };
    if (item.label !== undefined) {
      const label = text(item.label).slice(0, 120);
      if (!label) return NextResponse.json({ error: "Label cannot be empty." }, { status: 400 });
      patch.label = label;
    }
    if (item.href !== undefined) {
      const href = text(item.href).slice(0, 2000);
      if (!isNavHref(href)) {
        return NextResponse.json(
          { error: "Link must be a local path, anchor or HTTPS URL." },
          { status: 400 },
        );
      }
      patch.href = href;
    }
    if (item.sortOrder !== undefined && Number.isFinite(Number(item.sortOrder))) {
      patch.sortOrder = Math.round(Number(item.sortOrder));
    }

    const [updated] = await db
      .update(siteNavLinks)
      .set(patch)
      .where(eq(siteNavLinks.id, id))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Menu item not found." }, { status: 404 });
    }
    await logAudit(admin.id, "nav_update", id, patch);
    bustLayout();
    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("[navigation] PATCH failed:", error);
    return NextResponse.json({ error: "Could not update the menu item." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("navigation", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "Menu item id is required." }, { status: 400 });

    const [existing] = await db
      .select()
      .from(siteNavLinks)
      .where(eq(siteNavLinks.id, id))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Menu item not found." }, { status: 404 });
    }
    // A top-level item takes its submenu with it.
    const childIds = existing.parentId
      ? []
      : (
          await db
            .select({ id: siteNavLinks.id })
            .from(siteNavLinks)
            .where(eq(siteNavLinks.parentId, id))
        ).map((row) => row.id);
    const removeIds = [id, ...childIds];
    await db.delete(siteNavLinks).where(inArray(siteNavLinks.id, removeIds));
    await logAudit(admin.id, "nav_delete", id, {
      label: existing.label,
      withChildren: childIds.length,
    });
    bustLayout();
    return NextResponse.json({ ok: true, removed: removeIds.length });
  } catch (error) {
    console.error("[navigation] DELETE failed:", error);
    return NextResponse.json({ error: "Could not remove the menu item." }, { status: 500 });
  }
}
