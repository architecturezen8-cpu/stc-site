import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { colomboInputToIso } from "@/lib/post-visibility";
import { createNotice, getAllNotices } from "@/lib/notice-board";

export const dynamic = "force-dynamic";

/* ── v2.8.85.0 — Public Notice Board (admin API) ─────────────────────────
   GET  /api/admin/notices      — every notice, drafts + expired included.
   POST /api/admin/notices      — create (title + body required). */

const TITLE_MAX = 200;
const BODY_MAX = 8000;
const CATEGORY_MAX = 40;
const IMAGE_MAX = 2000;

/** Notice artwork — local /paths or HTTPS URLs, empty = no image. */
function safeImage(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!text.startsWith("/") && !text.startsWith("https://")) return null;
  return text.slice(0, IMAGE_MAX);
}

/**
 * Optional auto-hide deadline. "" / null clears; a datetime-local value
 * (Sri Lanka wall time, same convention as news scheduling) becomes the
 * stored instant; anything unparseable is treated as empty.
 */
function safeExpiry(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const iso = colomboInputToIso(value);
  return iso ? new Date(iso) : null;
}

function revalidateNotices() {
  revalidatePath("/notices");
  revalidatePath("/");
}

export async function GET() {
  const admin = await guardApi("news", "read");
  if (admin instanceof NextResponse) return admin;
  const rows = await getAllNotices();
  return NextResponse.json({ notices: rows });
}

export async function POST(req: Request) {
  const admin = await guardApi("news", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    await ensureSchemaExtras();
    const body = await req.json();

    const title = String(body.title ?? "").trim().slice(0, TITLE_MAX);
    if (!title) {
      return NextResponse.json(
        { error: "A notice title is required." },
        { status: 400 },
      );
    }

    const text = String(body.body ?? "").trim().slice(0, BODY_MAX);
    if (!text) {
      return NextResponse.json(
        { error: "The notice body is required." },
        { status: 400 },
      );
    }

    const category =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim().slice(0, CATEGORY_MAX)
        : "General";

    const created = await createNotice({
      title,
      body: text,
      category,
      image: safeImage(body.image),
      pinned: Boolean(body.pinned),
      published: Boolean(body.published),
      expiresAt: safeExpiry(body.expiresAt),
      createdBy: admin.id,
    });

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_notice",
      entity: "notice",
      entityId: String(created.id),
    });
    revalidateNotices();
    return NextResponse.json({ notice: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the notice." },
      { status: 400 },
    );
  }
}
