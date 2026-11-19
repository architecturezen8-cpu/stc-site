import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, popups } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";

/** Announcement popup CRUD — events, live sessions and special messages. */

const KINDS = ["event", "live", "message"];
const FREQUENCIES = ["once", "session", "always"];
const PLATFORMS = ["youtube", "facebook", "instagram", "tiktok", "other"];

function safeLinks(value: unknown): { label: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((l) => ({
      label: String((l as { label?: unknown })?.label ?? "").trim(),
      url: String((l as { url?: unknown })?.url ?? "").trim(),
    }))
    .filter((l) => l.url && (l.url.startsWith("/") || l.url.startsWith("http")))
    .slice(0, 12);
}

export async function GET() {
  const admin = await guardApi("popups", "read");
  if (admin instanceof NextResponse) return admin;

  const rows = await db.select().from(popups).orderBy(desc(popups.updatedAt));
  return NextResponse.json({ popups: rows });
}

export async function POST(req: Request) {
  const admin = await guardApi("popups", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!title || !message) {
      return NextResponse.json(
        { error: "Popup title and message are required." },
        { status: 400 },
      );
    }

    const kind = KINDS.includes(body.kind) ? body.kind : "message";
    const frequency = FREQUENCIES.includes(body.frequency) ? body.frequency : "session";

    const [created] = await db
      .insert(popups)
      .values({
        title,
        message,
        kind,
        frequency,
        bannerUrl: String(body.bannerUrl ?? "").trim() || null,
        linkUrl: String(body.linkUrl ?? "").trim() || null,
        linkLabel: String(body.linkLabel ?? "").trim() || null,
        enabled: body.enabled !== false,
        delayMs: Math.max(0, Math.min(30000, Number(body.delayMs) || 1500)),
        startAt: body.startAt ? new Date(body.startAt) : null,
        endAt: body.endAt ? new Date(body.endAt) : null,
        eventAt: body.eventAt ? new Date(body.eventAt) : null,
        platform:
          body.kind === "live" && PLATFORMS.includes(body.platform) ? body.platform : null,
        links: safeLinks(body.links),
      })
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_popup",
      entity: "popup",
      entityId: String(created.id),
    });

    return NextResponse.json({ popup: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create popup." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("popups", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid popup ID." }, { status: 400 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
    if (typeof body.message === "string" && body.message.trim()) patch.message = body.message.trim();
    if (KINDS.includes(body.kind)) patch.kind = body.kind;
    if (FREQUENCIES.includes(body.frequency)) patch.frequency = body.frequency;
    if (typeof body.bannerUrl === "string") patch.bannerUrl = body.bannerUrl.trim() || null;
    if (typeof body.linkUrl === "string") patch.linkUrl = body.linkUrl.trim() || null;
    if (typeof body.linkLabel === "string") patch.linkLabel = body.linkLabel.trim() || null;
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.delayMs !== undefined) {
      patch.delayMs = Math.max(0, Math.min(30000, Number(body.delayMs) || 1500));
    }
    if (body.startAt !== undefined) patch.startAt = body.startAt ? new Date(body.startAt) : null;
    if (body.endAt !== undefined) patch.endAt = body.endAt ? new Date(body.endAt) : null;
    if (body.eventAt !== undefined) patch.eventAt = body.eventAt ? new Date(body.eventAt) : null;
    if (body.platform !== undefined) {
      patch.platform =
        (patch.kind ?? "live") === "live" && PLATFORMS.includes(body.platform)
          ? body.platform
          : null;
    }
    if (body.links !== undefined) patch.links = safeLinks(body.links);

    const [updated] = await db.update(popups).set(patch).where(eq(popups.id, id)).returning();
    if (!updated) return NextResponse.json({ error: "Popup not found." }, { status: 404 });

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_popup",
      entity: "popup",
      entityId: String(id),
      details: patch as unknown,
    });

    return NextResponse.json({ popup: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update popup." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("popups", "edit");
  if (admin instanceof NextResponse) return admin;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid popup ID." }, { status: 400 });
  }

  const [deleted] = await db.delete(popups).where(eq(popups.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: "Popup not found." }, { status: 404 });

  await db.insert(adminAuditLogs).values({
    userId: admin.id,
    action: "delete_popup",
    entity: "popup",
    entityId: String(id),
  });

  return NextResponse.json({ ok: true });
}
