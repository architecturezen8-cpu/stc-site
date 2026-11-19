import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getAdminSession } from "@/lib/admin-auth";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type Ctx = { params: Promise<{ id: string }> };

/**
 * v2.8.87.0 — the ONLY door to a PRIVATE admin profile photo's bytes.
 *
 * GET /api/admin/avatar/[id] streams the avatar stored under
 * admin-avatars/ in the storage layer. Every <img> that shows an uploaded
 * admin photo points here (same-origin, so the admin session cookie rides
 * along). Gate: ANY live main-admin session — the Role Management wall and
 * the sidebar legitimately show fellow admins' faces, and no one else (no
 * portal session, no anonymous caller) can resolve the bytes: 404, with no
 * existence leak.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 404 });
  }
  await ensureSchemaExtras();

  const userId = Number((await ctx.params).id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const [row] = await db
      .select({ avatarKey: adminUsers.avatarKey })
      .from(adminUsers)
      .where(eq(adminUsers.id, userId))
      .limit(1);
    if (!row?.avatarKey) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    let bytes: Buffer;
    try {
      bytes = await getStorage().getObject(row.avatarKey);
    } catch {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const ext = row.avatarKey.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": MIME_BY_EXT[ext] ?? "application/octet-stream",
        "cache-control": "private, max-age=300",
        "content-length": String(bytes.length),
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load the photo." },
      { status: 500 },
    );
  }
}
