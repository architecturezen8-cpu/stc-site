import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, events } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";

export async function GET() {
  const admin = await guardApi("events", "read");
  if (admin instanceof NextResponse) return admin;

  const rows = await db.select().from(events).orderBy(asc(events.startsAt));
  return NextResponse.json({ events: rows });
}

export async function POST(req: Request) {
  const admin = await guardApi("events", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Event title is required." }, { status: 400 });
    }

    const [created] = await db
      .insert(events)
      .values({
        title,
        description: String(body.description ?? "").trim() || "Event description…",
        category: String(body.category ?? "Ceremony").trim(),
        startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
        timeLabel: String(body.timeLabel ?? "").trim() || "8.00 a.m.",
        location: String(body.location ?? "").trim() || "College Grounds",
        isNew: Boolean(body.isNew),
      })
      .returning();

    revalidatePath("/news");
    revalidatePath("/");

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_event",
      entity: "event",
      entityId: String(created.id),
    });

    return NextResponse.json({ event: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create event." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("events", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === "string") patch.description = body.description.trim();
    if (typeof body.category === "string" && body.category.trim()) patch.category = body.category.trim();
    if (typeof body.timeLabel === "string" && body.timeLabel.trim()) patch.timeLabel = body.timeLabel.trim();
    if (typeof body.location === "string" && body.location.trim()) patch.location = body.location.trim();
    if (body.startsAt) patch.startsAt = new Date(body.startsAt);
    if (body.isNew !== undefined) patch.isNew = Boolean(body.isNew);

    const [updated] = await db.update(events).set(patch).where(eq(events.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Event not found." }, { status: 404 });

    revalidatePath("/news");
    revalidatePath("/");

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_event",
      entity: "event",
      entityId: String(id),
    });

    return NextResponse.json({ event: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update event." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("events", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await req.json();
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
    }

    await db.delete(events).where(eq(events.id, numeric));

    revalidatePath("/news");
    revalidatePath("/");

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "delete_event",
      entity: "event",
      entityId: String(numeric),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete event." },
      { status: 400 },
    );
  }
}
