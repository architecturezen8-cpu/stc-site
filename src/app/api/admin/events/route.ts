import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, events } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { colomboInputToIso } from "@/lib/post-visibility";

export async function GET() {
  const admin = await guardApi("events", "read");
  if (admin instanceof NextResponse) return admin;

  const rows = await db.select().from(events).orderBy(asc(events.startsAt));
  return NextResponse.json({ events: rows });
}

/**
 * v2.8.89.0 — schedule field (mirrors posts safeSchedule, v2.8.80.0):
 * "" / null clears (publish now); a datetime-local value (Sri Lanka wall
 * time) becomes the stored instant. Anything else → null.
 */
function safeSchedule(value: unknown): Date | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  /* v2.8.89.0 — a full ISO instant (a row round-tripped from GET) is used
     as-is; only a bare datetime-local value is Sri Lanka wall time.
     Without this branch every re-save of an already-scheduled row drifted
     -5:30 (the posts route carried the same latent bug since v2.8.80.0 —
     fixed there in the same commit). */
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = colomboInputToIso(trimmed);
  return iso ? new Date(iso) : null;
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
        /* v2.8.89.0 — scheduled auto-publish (NULL = live now). */
        scheduledAt: safeSchedule(body.scheduledAt),
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
    /* v2.8.89.0 — undefined = untouched; ""/null = clear the schedule. */
    if (body.scheduledAt !== undefined) patch.scheduledAt = safeSchedule(body.scheduledAt);

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
