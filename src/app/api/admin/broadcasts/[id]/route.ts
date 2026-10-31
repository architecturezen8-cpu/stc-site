import { NextResponse } from "next/server";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardPortalOrLmsAdmin } from "@/lib/lms-admin-auth";
import {
  deleteBroadcastAdmin,
  isBroadcastAudience,
  isBroadcastKind,
  updateBroadcastAdmin,
} from "@/lib/school-broadcasts";

export const dynamic = "force-dynamic";

function badId(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * v2.8.71.0 — PATCH /api/admin/broadcasts/[id] — EDIT a posted notification
 * (owner item 4: until now the sent list only had delete). Title, message,
 * type, audience and link are all editable; read counts survive the edit.
 * Audited like the delete.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardPortalOrLmsAdmin("edit");
  if (admin instanceof NextResponse) return admin;

  const { id: rawId } = await ctx.params;
  const id = badId(rawId);
  if (id === null) {
    return NextResponse.json(
      { ok: false, error: "A valid notification id is required." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        title?: unknown;
        body?: unknown;
        kind?: unknown;
        audience?: unknown;
        linkUrl?: unknown;
        scheduledAt?: unknown;
      }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.body === "string" ? body.body.trim() : "";
  if (!title || title.length > 160) {
    return NextResponse.json(
      { ok: false, error: "A title (max 160 characters) is required." },
      { status: 400 },
    );
  }
  if (!message || message.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "The message (max 4000 characters) is required." },
      { status: 400 },
    );
  }
  if (!isBroadcastKind(body.kind)) {
    return NextResponse.json({ ok: false, error: "Unknown notification type." }, { status: 400 });
  }
  if (!isBroadcastAudience(body.audience)) {
    return NextResponse.json({ ok: false, error: "Unknown audience." }, { status: 400 });
  }
  const linkUrl =
    typeof body.linkUrl === "string" && body.linkUrl.trim() ? body.linkUrl.trim() : null;
  if (linkUrl && linkUrl.length > 500) {
    return NextResponse.json(
      { ok: false, error: "The link is too long (max 500 characters)." },
      { status: 400 },
    );
  }
  /* v2.8.89.0 — scheduled auto-publish: a full ISO instant, null (publish
     now) or undefined (leave untouched). Anything else is refused. */
  let scheduledAt: string | null | undefined;
  if (body.scheduledAt !== undefined) {
    if (typeof body.scheduledAt === "string" && body.scheduledAt.trim()) {
      const date = new Date(body.scheduledAt.trim());
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { ok: false, error: "The scheduled time could not be understood." },
          { status: 400 },
        );
      }
      scheduledAt = date.toISOString();
    } else if (body.scheduledAt === null || body.scheduledAt === "") {
      scheduledAt = null;
    } else {
      scheduledAt = undefined;
    }
  }

  try {
    const updated = await updateBroadcastAdmin(id, {
      title,
      body: message,
      kind: body.kind,
      audience: body.audience,
      linkUrl,
      scheduledAt,
    });
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "That notification no longer exists." },
        { status: 404 },
      );
    }
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_broadcast",
      entity: "lms_broadcast",
      entityId: String(id),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not update the notification." },
      { status: 500 },
    );
  }
}

/**
 * v2.8.70.0 — DELETE /api/admin/broadcasts/[id] — pull a posted
 * notification back (it disappears from every portal at once). Audited.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardPortalOrLmsAdmin("edit");
  if (admin instanceof NextResponse) return admin;

  const { id: rawId } = await ctx.params;
  const id = badId(rawId);
  if (id === null) {
    return NextResponse.json(
      { ok: false, error: "A valid notification id is required." },
      { status: 400 },
    );
  }

  try {
    await deleteBroadcastAdmin(id);
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "delete_broadcast",
      entity: "lms_broadcast",
      entityId: String(id),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not delete the notification." },
      { status: 500 },
    );
  }
}
