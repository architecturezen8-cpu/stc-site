import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, unitGalleryItems } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { UNITS } from "@/lib/units";
import {
  clearEntityMediaUsage,
  syncEntityMediaUsage,
} from "@/lib/media-usage";

const UNIT_SLUGS = new Set(UNITS.map((unit) => unit.slug));

function safeUnit(value: unknown) {
  const slug = String(value ?? "").trim();
  return UNIT_SLUGS.has(slug) ? slug : null;
}

function safeImage(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!text.startsWith("/") && !text.startsWith("https://")) return null;
  return text;
}

export async function GET(req: Request) {
  const admin = await guardApi("unit-gallery", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();
  const unit = new URL(req.url).searchParams.get("unit") || "";
  const items = await db
    .select()
    .from(unitGalleryItems)
    .where(eq(unitGalleryItems.unitSlug, unit))
    .orderBy(asc(unitGalleryItems.sortOrder), asc(unitGalleryItems.id));
  return NextResponse.json({
    items,
    units: UNITS.map((unitRow) => ({ slug: unitRow.slug, name: unitRow.name })),
  });
}

export async function POST(req: Request) {
  const admin = await guardApi("unit-gallery", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const unitSlug = safeUnit(body.unitSlug);
    if (!unitSlug) throw new Error("Choose a valid cadet unit.");
    const image = safeImage(body.image);
    if (!image) throw new Error("Image must be a local /path or an HTTPS URL.");

    const [created] = await db
      .insert(unitGalleryItems)
      .values({
        unitSlug,
        title: String(body.title ?? "").trim() || "Untitled photo",
        caption: String(body.caption ?? "").trim() || "",
        image,
        zoom: Math.min(240, Math.max(50, Math.round(Number(body.zoom) || 100))),
        aspect: ["landscape", "portrait", "square"].includes(body.aspect)
          ? body.aspect
          : "landscape",
        sortOrder: Number(body.sortOrder) || 100,
      })
      .returning();

    revalidatePath(`/cadeting/${unitSlug}`);
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_unit_gallery_item",
      entity: "unit_gallery_item",
      entityId: String(created.id),
    });
    await syncEntityMediaUsage({
      entityType: "gallery",
      entityId: `unit-${created.id}`,
      fieldName: "image",
      urls: [created.image],
    });
    return NextResponse.json({ item: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add photo." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("unit-gallery", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new Error("Invalid photo.");

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.caption === "string") patch.caption = body.caption.trim();
    if (["landscape", "portrait", "square"].includes(body.aspect)) patch.aspect = body.aspect;
    if (body.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder) || 100;
    if (body.zoom !== undefined) patch.zoom = Math.min(240, Math.max(50, Math.round(Number(body.zoom) || 100)));
    if (body.image !== undefined) {
      const image = safeImage(body.image);
      if (!image) throw new Error("Image must be a local /path or an HTTPS URL.");
      patch.image = image;
    }

    const [updated] = await db
      .update(unitGalleryItems)
      .set(patch)
      .where(eq(unitGalleryItems.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

    revalidatePath(`/cadeting/${updated.unitSlug}`);
    await syncEntityMediaUsage({
      entityType: "gallery",
      entityId: `unit-${id}`,
      fieldName: "image",
      urls: [updated.image],
    });
    return NextResponse.json({ item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save photo." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("unit-gallery", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await req.json();
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) throw new Error("Invalid photo.");
    const [removed] = await db
      .delete(unitGalleryItems)
      .where(eq(unitGalleryItems.id, numeric))
      .returning();
    if (removed) revalidatePath(`/cadeting/${removed.unitSlug}`);
    await clearEntityMediaUsage("gallery", `unit-${numeric}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove photo." },
      { status: 400 },
    );
  }
}
