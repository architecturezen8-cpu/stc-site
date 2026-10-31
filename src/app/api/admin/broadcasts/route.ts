import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import {
  createBroadcast,
  isBroadcastAudience,
  isBroadcastKind,
  listBroadcastsForAdmin,
} from "@/lib/school-broadcasts";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.0 — the writing side of SCHOOL BROADCASTS. The owner's ask:
 * the MAIN admin posts things like "the site will be down for maintenance
 * at this time", and the LMS admin can post school notices too. Both land
 * through the shared dual guard (site_admin with the portal module, or an
 * lms_admin session) and both are audited.
 *
 * GET  → the sent list with read counts (the composer's history).
 * POST → { title, body, kind, audience, linkUrl?, scheduledAt? }.
 */
export async function GET() {
  const admin = await guardPortalOrLmsAdmin("read");
  if (admin instanceof NextResponse) return admin;

  try {
    const items = await listBroadcastsForAdmin();
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the sent notifications." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const admin = await guardPortalOrLmsAdmin("edit");
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    body?: unknown;
    kind?: unknown;
    audience?: unknown;
    linkUrl?: unknown;
    scheduledAt?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const kind = isBroadcastKind(body.kind) ? body.kind : "general";
  const audience = isBroadcastAudience(body.audience) ? body.audience : "all";
  const linkUrl = typeof body.linkUrl === "string" ? body.linkUrl.trim() : "";

  if (title.length < 3 || title.length > 160) {
    return NextResponse.json(
      { ok: false, error: "Give the notification a title (3–160 characters)." },
      { status: 400 },
    );
  }
  if (text.length < 3 || text.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "Write the message (3–4000 characters)." },
      { status: 400 },
    );
  }
  if (linkUrl.length > 500) {
    return NextResponse.json(
      { ok: false, error: "The link is too long." },
      { status: 400 },
    );
  }
  /* v2.8.89.0 — scheduled auto-publish: the composer sends a full ISO
     instant (or null = publish now). Anything else non-null is refused. */
  let scheduledAt: string | null = null;
  if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
    const date = new Date(body.scheduledAt.trim());
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json(
        { ok: false, error: "The scheduled time could not be understood." },
        { status: 400 },
      );
    }
    scheduledAt = date.toISOString();
  }

  try {
    const row = await createBroadcast({
      title,
      body: text,
      kind,
      audience,
      authorVia: admin.via,
      authorId: admin.id,
      authorName: admin.name,
      linkUrl: linkUrl || null,
      scheduledAt,
    });
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "post_broadcast",
      entity: "lms_broadcast",
      entityId: String(row?.id ?? ""),
    });
    return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not post the notification." },
      { status: 500 },
    );
  }
}
