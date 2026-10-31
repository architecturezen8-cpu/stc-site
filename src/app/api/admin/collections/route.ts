import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  contentCollections,
  events,
  galleryItems,
  onlineResources,
  posts,
  staff,
} from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureResourcesSchema } from "@/lib/resources";
import { ensureSchemaExtras } from "@/lib/schema-extras";

const DEFAULTS: Record<string, string[]> = {
  news: [
    "Achievements",
    "Sports",
    "Culture",
    "Academics",
    "Ceremony",
    "Notice",
    "Announcements",
  ],
  gallery: ["Campus", "Academics", "Sports", "Arts & Culture", "Ceremonies"],
  event: ["Sports", "Culture", "Ceremony", "Admissions", "Academic"],
  resources: [
    "Past Papers & Answers",
    "Syllabus & Curriculum",
    "Video Lessons",
    "Reference & Libraries",
    "Exam Information",
    "Student Tools",
  ],
  staff: [
    "Leadership",
    "Science & ICT",
    "Mathematics",
    "Commerce",
    "Humanities & Languages",
    "Sports & Cadeting",
    "Primary & Middle School",
  ],
};

/** The content table each collection type filters. */
const TYPE_TABLES = {
  news: posts.category,
  gallery: galleryItems.category,
  event: events.category,
  resources: onlineResources.category,
  staff: staff.department,
} as const;

type CollectionType = keyof typeof TYPE_TABLES;

const isType = (value: unknown): value is CollectionType =>
  typeof value === "string" && Object.keys(TYPE_TABLES).includes(value);

/** Per-category usage counts for one type. */
async function usageCounts(type: CollectionType): Promise<Map<string, number>> {
  const column = TYPE_TABLES[type];
  const rows = await db
    .select({ value: column, count: sql<number>`count(*)::int` })
    .from(column.table)
    .groupBy(column);
  return new Map(rows.map((r) => [r.value, r.count]));
}

/** Managed category list: defaults (minus hidden) ∪ content values ∪ custom. */
function buildManaged(
  type: CollectionType,
  counts: Map<string, number>,
  rows: (typeof contentCollections.$inferSelect)[],
): Array<{ name: string; count: number; source: "default" | "custom" | "content" }> {
  const hidden = new Set(
    rows.filter((r) => r.type === type && r.hidden).map((r) => r.name),
  );
  const customNames = new Set(
    rows.filter((r) => r.type === type && !r.hidden).map((r) => r.name),
  );
  const names: Array<{ name: string; source: "default" | "custom" | "content" }> = [];
  const seen = new Set<string>();
  const push = (name: string, source: "default" | "custom" | "content") => {
    if (!name || seen.has(name) || hidden.has(name)) return;
    seen.add(name);
    names.push({ name, source });
  };
  for (const name of DEFAULTS[type]) push(name, "default");
  for (const name of customNames) push(name, "custom");
  for (const name of Array.from(counts.keys()).sort()) push(name, "content");
  return names.map((n) => ({ ...n, count: counts.get(n.name) ?? 0 }));
}

export async function GET() {
  const admin = await guardApi("filters", "read");
  if (admin instanceof NextResponse) return admin;

  await ensureResourcesSchema().catch(() => undefined);
  await ensureSchemaExtras().catch(() => undefined);

  const rows = await db
    .select()
    .from(contentCollections)
    .orderBy(asc(contentCollections.name));

  const managed: Record<string, Array<{ name: string; count: number; source: string }>> = {};
  for (const type of Object.keys(TYPE_TABLES) as CollectionType[]) {
    const counts = await usageCounts(type);
    managed[type] = buildManaged(type, counts, rows);
  }

  return NextResponse.json({
    /* Legacy flat fields — pickers inside the content managers. */
    newsCategories: managed.news.map((c) => c.name),
    galleryCategories: managed.gallery.map((c) => c.name),
    eventCategories: managed.event.map((c) => c.name),
    staffDepartments: managed.staff.map((c) => c.name),
    resourceCategories: managed.resources.map((c) => c.name),
    customCollections: rows.filter((r) => !r.hidden),
    /* Full managed detail for the Filters admin. */
    managed,
    defaults: DEFAULTS,
  });
}

export async function POST(req: Request) {
  const admin = await guardApi("filters", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const type = String(body.type ?? "").trim();
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
    if (!isType(type)) {
      return NextResponse.json({ error: "Invalid collection type." }, { status: 400 });
    }
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json(
        { error: "Collection name must contain 2–100 characters." },
        { status: 400 },
      );
    }

    await ensureSchemaExtras().catch(() => undefined);

    const existing = await db
      .select()
      .from(contentCollections)
      .where(and(eq(contentCollections.type, type), eq(contentCollections.name, name)))
      .limit(1);

    let collection = existing[0];
    if (collection) {
      /* Re-adding a previously removed (hidden) default unhides it. */
      if (collection.hidden) {
        [collection] = await db
          .update(contentCollections)
          .set({ hidden: false })
          .where(eq(contentCollections.id, collection.id))
          .returning();
      }
    } else {
      [collection] = await db
        .insert(contentCollections)
        .values({ type, name, createdBy: admin.id })
        .returning();
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_collection",
      entity: "content_collection",
      entityId: String(collection.id),
      details: { type, name },
    });

    return NextResponse.json({ success: true, collection, name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add collection." },
      { status: 400 },
    );
  }
}

/** Rename a filter category everywhere — custom row, content rows, and the
 *  built-in default bookkeeping (old name hidden, new name restored). */
export async function PATCH(req: Request) {
  const admin = await guardApi("filters", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const type = String(body.type ?? "").trim();
    const from = String(body.from ?? "").trim();
    const to = String(body.to ?? "").trim().replace(/\s+/g, " ");
    if (!isType(type)) {
      return NextResponse.json({ error: "Invalid collection type." }, { status: 400 });
    }
    if (!from || to.length < 2 || to.length > 100) {
      return NextResponse.json({ error: "Provide a valid new name (2–100 chars)." }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ success: true, moved: 0 });
    }

    await ensureSchemaExtras().catch(() => undefined);

    const counts = await usageCounts(type);
    if (counts.has(to)) {
      return NextResponse.json(
        { error: `"${to}" is already a category in this section.` },
        { status: 400 },
      );
    }

    const column = TYPE_TABLES[type];
    let moved = 0;
    if (counts.has(from)) {
      const updated = await db
        .update(column.table)
        .set({ [column.name]: to })
        .where(eq(column, from))
        .returning();
      moved = updated.length;
    }

    const rows = await db
      .select()
      .from(contentCollections)
      .where(eq(contentCollections.type, type));
    const customRow = rows.find((r) => r.name === from && !r.hidden);
    const hiddenFrom = rows.find((r) => r.name === from && r.hidden);
    const hiddenTo = rows.find((r) => r.name === to && r.hidden);

    if (customRow) {
      await db
        .update(contentCollections)
        .set({ name: to })
        .where(eq(contentCollections.id, customRow.id));
    }
    /* A renamed built-in default must be hidden so it disappears from the
       merge; the target name may itself be a previously-hidden default. */
    if (DEFAULTS[type].includes(from) && !customRow && !hiddenFrom) {
      await db
        .insert(contentCollections)
        .values({ type, name: from, hidden: true, createdBy: admin.id });
    }
    if (DEFAULTS[type].includes(to) && hiddenTo) {
      await db
        .update(contentCollections)
        .set({ hidden: false })
        .where(eq(contentCollections.id, hiddenTo.id));
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "rename_collection",
      entity: "content_collection",
      entityId: type,
      details: { from, to, moved },
    });

    return NextResponse.json({ success: true, moved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to rename category." },
      { status: 400 },
    );
  }
}

/** Delete a filter category. In-use categories must provide a `moveTo`
 *  target — every content row is reassigned before the filter disappears. */
export async function DELETE(req: Request) {
  const admin = await guardApi("filters", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const type = String(body.type ?? "").trim();
    const name = String(body.name ?? "").trim();
    const moveTo = String(body.moveTo ?? "").trim();
    if (!isType(type) || !name) {
      return NextResponse.json({ error: "Invalid collection." }, { status: 400 });
    }

    await ensureSchemaExtras().catch(() => undefined);

    const counts = await usageCounts(type);
    const inUse = counts.get(name) ?? 0;

    if (inUse > 0) {
      if (!moveTo) {
        return NextResponse.json(
          { error: "in_use", count: inUse },
          { status: 409 },
        );
      }
      if (moveTo === name) {
        return NextResponse.json({ error: "Pick a different target category." }, { status: 400 });
      }
      const column = TYPE_TABLES[type];
      await db
        .update(column.table)
        .set({ [column.name]: moveTo })
        .where(eq(column, name));
    }

    await db
      .delete(contentCollections)
      .where(and(eq(contentCollections.type, type), eq(contentCollections.name, name)));

    /* Removing a built-in default needs a hidden marker, or the default
       merge would resurrect it on the next read. */
    if (DEFAULTS[type].includes(name)) {
      await db
        .insert(contentCollections)
        .values({ type, name, hidden: true, createdBy: admin.id });
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "delete_collection",
      entity: "content_collection",
      entityId: type,
      details: { name, moved: inUse > 0 ? moveTo : null, count: inUse },
    });

    return NextResponse.json({ success: true, moved: inUse > 0 ? moveTo : null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete category." },
      { status: 400 },
    );
  }
}
