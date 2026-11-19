import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * v2.9.15.6 — the ONLY door to an ACCOUNT-level custom profile photo
 * (parent / principal uploads — lms-admins keep their own
 * /api/lms-admin/avatar/[id] door).
 *
 * GET /api/portal/my-avatar streams the signed-in portal account's own
 * avatar_key bytes (portal-avatars/ prefix). Same-origin <img> tags ride
 * the session cookie; anonymous callers get 404 with no existence leak.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 404 });
  }

  try {
    const [row] = await db
      .select({ avatarKey: lmsPortalAccounts.avatarKey })
      .from(lmsPortalAccounts)
      .where(eq(lmsPortalAccounts.id, session.accountId))
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
