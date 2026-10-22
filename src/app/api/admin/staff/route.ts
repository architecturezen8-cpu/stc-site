import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, staff } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import {
  clearEntityMediaUsage,
  syncEntityMediaUsage,
} from "@/lib/media-usage";

function safeImage(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && (text.startsWith("/") || text.startsWith("https://")) ? text : null;
}

function safeScale(value: unknown) {
  const scale = Math.round(Number(value));
  return Number.isFinite(scale) ? Math.min(240, Math.max(50, scale)) : 100;
}

export async function GET() {
  const admin = await guardApi("staff", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const rows = await db
    .select()
    .from(staff)
    .orderBy(asc(staff.sortOrder), asc(staff.id));
  return NextResponse.json({ staff: rows });
}

export async function POST(req: Request) {
  const admin = await guardApi("staff", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Staff member name is required." }, { status: 400 });
    }

    const [created] = await db
      .insert(staff)
      .values({
        name,
        role: String(body.role ?? "Teacher").trim(),
        department: String(body.department ?? "Science & ICT").trim(),
        qualification: String(body.qualification ?? "").trim() || "B.Sc · PGDE",
        image: safeImage(body.image),
        photoScale: safeScale(body.photoScale),
        featured: Boolean(body.featured),
        isNew: Boolean(body.isNew),
        sortOrder: Number(body.sortOrder) || 100,
      })
      .returning();

    revalidatePath("/staff");
    revalidatePath("/");

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_staff",
      entity: "staff",
      entityId: String(created.id),
    });
    await syncEntityMediaUsage({
      entityType: "staff",
      entityId: created.id,
      fieldName: "portrait",
      urls: [created.image],
    });

    return NextResponse.json({ staff: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add staff member." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("staff", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();

    // Reordering array
    if (Array.isArray(body.order)) {
      const ids: number[] = body.order
        .map((val: unknown) => Number(val))
        .filter((val: number) => Number.isInteger(val));

      await Promise.all(
        ids.map((id, idx) =>
          db.update(staff).set({ sortOrder: idx + 1 }).where(eq(staff.id, id)),
        ),
      );
      revalidatePath("/staff");
      return NextResponse.json({ success: true });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid staff ID." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.role === "string" && body.role.trim()) patch.role = body.role.trim();
    if (typeof body.department === "string" && body.department.trim()) patch.department = body.department.trim();
    if (typeof body.qualification === "string") patch.qualification = body.qualification.trim();
    if (body.image !== undefined) patch.image = safeImage(body.image);
    if (body.photoScale !== undefined) patch.photoScale = safeScale(body.photoScale);
    if (body.featured !== undefined) patch.featured = Boolean(body.featured);
    if (body.isNew !== undefined) patch.isNew = Boolean(body.isNew);
    if (body.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder);

    const [updated] = await db.update(staff).set(patch).where(eq(staff.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });

    revalidatePath("/staff");
    revalidatePath("/");

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_staff",
      entity: "staff",
      entityId: String(id),
    });
    await syncEntityMediaUsage({
      entityType: "staff",
      entityId: id,
      fieldName: "portrait",
      urls: [updated.image],
    });

    return NextResponse.json({ staff: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update staff member." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("staff", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await req.json();
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      return NextResponse.json({ error: "Invalid staff ID." }, { status: 400 });
    }

    await db.delete(staff).where(eq(staff.id, numeric));
    await clearEntityMediaUsage("staff", numeric);

    revalidatePath("/staff");
    revalidatePath("/");

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "delete_staff",
      entity: "staff",
      entityId: String(numeric),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete staff member." },
      { status: 400 },
    );
  }
}
