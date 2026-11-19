import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, onlineResources } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  RESOURCE_LINK_TYPES,
  RESOURCE_MEDIUMS,
  listOnlineResources,
} from "@/lib/resources";

export const dynamic = "force-dynamic";

function safeUrl(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!text.startsWith("/") && !text.startsWith("https://") && !text.startsWith("http://")) {
    return null;
  }
  return text.slice(0, 2000);
}

export async function GET() {
  const admin = await guardApi("resources", "read");
  if (admin instanceof NextResponse) return admin;
  const items = await listOnlineResources();
  return NextResponse.json({
    items,
    linkTypes: RESOURCE_LINK_TYPES,
    mediums: RESOURCE_MEDIUMS,
  });
}

export async function POST(req: Request) {
  const admin = await guardApi("resources", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const url = safeUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { error: "URL must be an http(s) link." },
        { status: 400 },
      );
    }
    const [created] = await db
      .insert(onlineResources)
      .values({
        title: String(body.title ?? "").trim() || "New resource",
        description: String(body.description ?? "").trim(),
        category:
          typeof body.category === "string" && body.category.trim()
            ? body.category.trim().slice(0, 80)
            : "Student Tools",
        url,
        linkType: RESOURCE_LINK_TYPES.includes(body.linkType)
          ? body.linkType
          : "link",
        medium: RESOURCE_MEDIUMS.includes(body.medium) ? body.medium : "All",
        createdBy: admin.id,
      })
      .returning();
    revalidatePath("/resources");
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_resource",
      entity: "online_resource",
      entityId: String(created.id),
      details: { category: created.category },
    });
    return NextResponse.json({ item: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add the resource." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("resources", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();

    // Reorder — ids arrive in their new order.
    if (Array.isArray(body.order)) {
      const ids: number[] = body.order
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value));
      await Promise.all(
        ids.map((id, index) =>
          db
            .update(onlineResources)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(eq(onlineResources.id, id)),
        ),
      );
      revalidatePath("/resources");
      return NextResponse.json({ success: true });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid resource." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === "string") patch.description = body.description.trim();
    if (typeof body.category === "string" && body.category.trim()) {
      patch.category = body.category.trim().slice(0, 80);
    }
    if (typeof body.medium === "string" && RESOURCE_MEDIUMS.includes(body.medium)) {
      patch.medium = body.medium;
    }
    if (typeof body.linkType === "string" && RESOURCE_LINK_TYPES.includes(body.linkType)) {
      patch.linkType = body.linkType;
    }
    if (typeof body.featured === "boolean") patch.featured = body.featured;
    if (body.url !== undefined) {
      const url = safeUrl(body.url);
      if (!url) {
        return NextResponse.json(
          { error: "URL must be an http(s) link." },
          { status: 400 },
        );
      }
      patch.url = url;
    }

    const [updated] = await db
      .update(onlineResources)
      .set(patch)
      .where(eq(onlineResources.id, id))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }
    revalidatePath("/resources");
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_resource",
      entity: "online_resource",
      entityId: String(id),
    });
    return NextResponse.json({ item: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the resource." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("resources", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await req.json();
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      return NextResponse.json({ error: "Invalid resource." }, { status: 400 });
    }
    await db.delete(onlineResources).where(eq(onlineResources.id, numeric));
    revalidatePath("/resources");
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "delete_resource",
      entity: "online_resource",
      entityId: String(numeric),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the resource." },
      { status: 400 },
    );
  }
}
