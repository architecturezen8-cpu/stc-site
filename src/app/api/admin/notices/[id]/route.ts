import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { colomboInputToIso } from "@/lib/post-visibility";
import { deleteNotice, updateNotice } from "@/lib/notice-board";

export const dynamic = "force-dynamic";

/* ── v2.8.85.0 — Public Notice Board (admin API, per-notice) ────────────
   PUT    /api/admin/notices/[id] — update any field (expiresAt ""/null clears).
   DELETE /api/admin/notices/[id] — remove permanently. */

const TITLE_MAX = 200;
const BODY_MAX = 8000;
const CATEGORY_MAX = 40;
const IMAGE_MAX = 2000;

type Ctx = { params: Promise<{ id: string }> };

function badId(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function safeImage(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!text.startsWith("/") && !text.startsWith("https://")) return null;
  return text.slice(0, IMAGE_MAX);
}

/** undefined = untouched; "" / null = clear; datetime-local string = instant. */
function safeExpiry(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const iso = colomboInputToIso(value);
  return iso ? new Date(iso) : null;
}

function revalidateNotices() {
  revalidatePath("/notices");
  revalidatePath("/");
}

export async function PUT(req: Request, ctx: Ctx) {
  const admin = await guardApi("news", "edit");
  if (admin instanceof NextResponse) return admin;

  const { id: rawId } = await ctx.params;
  const id = badId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid notice." }, { status: 400 });
  }

  try {
    await ensureSchemaExtras();
    const body = await req.json();

    const patch: Parameters<typeof updateNotice>[1] = {};

    if (body.title !== undefined) {
      const title = String(body.title ?? "").trim().slice(0, TITLE_MAX);
      if (!title) {
        return NextResponse.json(
          { error: "A notice title is required." },
          { status: 400 },
        );
      }
      patch.title = title;
    }

    if (body.body !== undefined) {
      const text = String(body.body ?? "").trim().slice(0, BODY_MAX);
      if (!text) {
        return NextResponse.json(
          { error: "The notice body is required." },
          { status: 400 },
        );
      }
      patch.body = text;
    }

    if (body.category !== undefined) {
      patch.category =
        typeof body.category === "string" && body.category.trim()
          ? body.category.trim().slice(0, CATEGORY_MAX)
          : "General";
    }

    if (body.image !== undefined) patch.image = safeImage(body.image);
    if (body.pinned !== undefined) patch.pinned = Boolean(body.pinned);
    if (body.published !== undefined) patch.published = Boolean(body.published);
    if (body.expiresAt !== undefined) {
      const expiry = safeExpiry(body.expiresAt);
      if (expiry !== undefined) patch.expiresAt = expiry;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const updated = await updateNotice(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_notice",
      entity: "notice",
      entityId: String(id),
    });
    revalidateNotices();
    return NextResponse.json({ notice: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the notice." },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const admin = await guardApi("news", "edit");
  if (admin instanceof NextResponse) return admin;

  const { id: rawId } = await ctx.params;
  const id = badId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid notice." }, { status: 400 });
  }

  try {
    await ensureSchemaExtras();
    const removed = await deleteNotice(id);
    if (!removed) {
      return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    }

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "delete_notice",
      entity: "notice",
      entityId: String(id),
    });
    revalidateNotices();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the notice." },
      { status: 400 },
    );
  }
}
