import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getLmsAdminSession } from "@/lib/lms-admin-auth";
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
 * v2.9.15.0 — the ONLY door to a PRIVATE LMS-admin profile photo's bytes
 * (clone of /api/admin/avatar/[id] v2.8.87.0 for the studio's own team).
 *
 * GET /api/lms-admin/avatar/[id] streams the avatar stored under
 * lms-admin-avatars/ in the storage layer. Every <img> that shows an
 * uploaded LMS-admin photo points here (same-origin, so the LMS-admin
 * session cookie rides along). Gate: ANY live LMS-admin session — it is a
 * small staff studio and the drawer chip legitimately shows fellow LMS
 * admins' faces; no one else (no student/teacher/parent portal session,
 * no website-admin-only session, no anonymous caller) can resolve the
 * bytes: 404, with no existence leak.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getLmsAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 404 });
  }
  await ensureSchemaExtras();

  const accountId = Number((await ctx.params).id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const [row] = await db
      .select({ avatarKey: lmsPortalAccounts.avatarKey })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, accountId))
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
        "cache-control": "private, max-age=60",
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
