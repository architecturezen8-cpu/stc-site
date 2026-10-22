import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, galleryItems } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  clearEntityMediaUsage,
  syncEntityMediaUsage,
} from "@/lib/media-usage";

const CATEGORIES = ["Campus", "Academics", "Sports", "Arts & Culture"];
const ASPECTS = ["landscape", "portrait", "square"];

function safeImage(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!text.startsWith("/") && !text.startsWith("https://")) return null;
  return text;
}

export async function GET() {
  const admin = await guardApi("gallery", "read");
  if (admin instanceof NextResponse) return admin;
  const items = await db
    .select()
    .from(galleryItems)
    .orderBy(asc(galleryItems.sortOrder), asc(galleryItems.id));
  return NextResponse.json({ items, categories: CATEGORIES, aspects: ASPECTS });
}

export async function POST(req: Request) {
  const admin = await guardApi("gallery", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const image = safeImage(body.image);
    if (!image) {
      return NextResponse.json(
        { error: "Image must be a local /path or an HTTPS URL." },
        { status: 400 },
      );
    }

    const [created] = await db
      .insert(galleryItems)
      .values({
        title: String(body.title ?? "").trim() || "Untitled frame",
        category:
          typeof body.category === "string" && body.category.trim()
            ? body.category.trim().slice(0, 40)
            : "Campus",
        image,
        caption: String(body.caption ?? "").trim() || "Add a caption…",
        year: String(body.year ?? "").trim() || String(new Date().getFullYear()),
        location: String(body.location ?? "").trim() || "College Campus",
        aspect: ASPECTS.includes(body.aspect) ? body.aspect : "landscape",
      })
      .returning();

    revalidatePath("/gallery");
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_gallery_item",
      entity: "gallery_item",
      entityId: String(created.id),
    });
    await syncEntityMediaUsage({
      entityType: "gallery",
      entityId: created.id,
      fieldName: "image",
      urls: [created.image],
    });
    return NextResponse.json({ item: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add the frame." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("gallery", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid frame." }, { status: 400 });
    }

    // Reordering — ids arrive in their new order.
    if (Array.isArray(body.order)) {
      const ids: number[] = body.order
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value));
      const existing = await db.select({ id: galleryItems.id }).from(galleryItems);
      if (ids.length !== existing.length) {
        return NextResponse.json({ error: "Order does not match the gallery." }, { status: 400 });
      }
      await Promise.all(
        ids.map((itemId, index) =>
          db
            .update(galleryItems)
            .set({ sortOrder: index })
            .where(eq(galleryItems.id, itemId)),
        ),
      );
      revalidatePath("/gallery");
      return NextResponse.json({ success: true });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.caption === "string") patch.caption = body.caption.trim();
    if (typeof body.year === "string" && body.year.trim()) patch.year = body.year.trim();
    if (typeof body.location === "string") patch.location = body.location.trim();
    if (typeof body.category === "string" && body.category.trim()) {
      patch.category = body.category.trim().slice(0, 40);
    }
    if (ASPECTS.includes(body.aspect)) patch.aspect = body.aspect;
    if (body.image !== undefined) {
      const image = safeImage(body.image);
      if (!image) {
        return NextResponse.json(
          { error: "Image must be a local /path or an HTTPS URL." },
          { status: 400 },
        );
      }
      patch.image = image;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const [updated] = await db
      .update(galleryItems)
      .set(patch)
      .where(eq(galleryItems.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Frame not found." }, { status: 404 });

    revalidatePath("/gallery");
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_gallery_item",
      entity: "gallery_item",
      entityId: String(id),
    });
    await syncEntityMediaUsage({
      entityType: "gallery",
      entityId: id,
      fieldName: "image",
      urls: [updated.image],
    });
    return NextResponse.json({ item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the frame." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("gallery", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await req.json();
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      return NextResponse.json({ error: "Invalid frame." }, { status: 400 });
    }
    await db.delete(galleryItems).where(eq(galleryItems.id, numeric));
    await clearEntityMediaUsage("gallery", numeric);
    revalidatePath("/gallery");
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "delete_gallery_item",
      entity: "gallery_item",
      entityId: String(numeric),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the frame." },
      { status: 400 },
    );
  }
}
