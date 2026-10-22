import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, liveStreams, type LiveStreamLink } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";

/** Live stream CRUD — the "Live" channel under News & Events. */

const PLATFORMS = ["youtube", "facebook", "instagram", "tiktok", "other"];

function parseLinks(raw: unknown): LiveStreamLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const label = String((item as { label?: unknown })?.label ?? "").trim().slice(0, 60);
      const url = String((item as { url?: unknown })?.url ?? "").trim().slice(0, 500);
      return label && url ? { label, url } : null;
    })
    .filter((x): x is LiveStreamLink => Boolean(x))
    .slice(0, 8);
}

export async function GET() {
  const admin = await guardApi("live", "read");
  if (admin instanceof NextResponse) return admin;

  const rows = await db
    .select()
    .from(liveStreams)
    .orderBy(desc(liveStreams.liveMode), asc(liveStreams.sortOrder), desc(liveStreams.id));
  return NextResponse.json({ streams: rows });
}

export async function POST(req: Request) {
  const admin = await guardApi("live", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const url = String(body.url ?? "").trim();
    if (!title || !url) {
      return NextResponse.json(
        { error: "Stream title and URL are required." },
        { status: 400 },
      );
    }

    const platform = PLATFORMS.includes(body.platform) ? body.platform : "other";
    const links = parseLinks(body.links);

    const [created] = await db
      .insert(liveStreams)
      .values({
        title,
        description: String(body.description ?? "").trim() || null,
        platform,
        url,
        embedUrl: String(body.embedUrl ?? "").trim() || null,
        bannerUrl: String(body.bannerUrl ?? "").trim() || null,
        links,
        liveMode: body.liveMode === true,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        sortOrder: Math.max(0, Math.min(999, Number(body.sortOrder) || 100)),
      })
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_live_stream",
      entity: "live_stream",
      entityId: String(created.id),
    });

    return NextResponse.json({ stream: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the stream." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("live", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid stream ID." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.description === "string") patch.description = body.description.trim() || null;
    if (PLATFORMS.includes(body.platform)) patch.platform = body.platform;
    if (typeof body.url === "string" && body.url.trim()) patch.url = body.url.trim();
    if (typeof body.embedUrl === "string") patch.embedUrl = body.embedUrl.trim() || null;
    if (typeof body.bannerUrl === "string") patch.bannerUrl = body.bannerUrl.trim() || null;
    if (body.links !== undefined) patch.links = parseLinks(body.links);
    if (typeof body.liveMode === "boolean") patch.liveMode = body.liveMode;
    if (body.scheduledAt !== undefined) {
      patch.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }
    if (body.sortOrder !== undefined) {
      patch.sortOrder = Math.max(0, Math.min(999, Number(body.sortOrder) || 100));
    }

    const [updated] = await db
      .update(liveStreams)
      .set(patch)
      .where(eq(liveStreams.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: "Stream not found." }, { status: 404 });

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_live_stream",
      entity: "live_stream",
      entityId: String(id),
      details: patch as unknown,
    });

    return NextResponse.json({ stream: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update the stream." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("live", "edit");
  if (admin instanceof NextResponse) return admin;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid stream ID." }, { status: 400 });
  }

  const [deleted] = await db.delete(liveStreams).where(eq(liveStreams.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: "Stream not found." }, { status: 404 });

  await db.insert(adminAuditLogs).values({
    userId: admin.id,
    action: "delete_live_stream",
    entity: "live_stream",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
