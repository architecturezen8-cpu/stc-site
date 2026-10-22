import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { hasLiveLmsAdminSession, LMS_ADMIN_SESSION_COOKIE_NAME } from "@/lib/maintenance";
import { getAdminSession } from "@/lib/admin-auth";
import {
  getPersonPhotoRow,
  type PersonPhotoKind,
} from "@/lib/person-photo";
import { getPrivateStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; id: string }> };

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * v2.8.59.0 — the ONLY door to a register photo's bytes.
 *
 * GET /api/portal/person-photo/[kind]/[id] streams the profile photo of a
 * student/teacher REGISTER row. Every <img> that shows a register photo
 * points here (same-origin, so the session cookie rides along).
 *
 * Gate: ANY live portal session (student / teacher / parent — the portals
 * all display these photos), OR a live lms-admin session, OR a live main
 * admin session. Anonymous callers get 404 with no existence leak.
 */
export async function GET(req: Request, ctx: Ctx) {
  const portalSession = await getPortalSessionForRequest(req);
  let authorized = Boolean(portalSession);

  if (!authorized) {
    const jar = await cookies();
    const lmsToken = jar.get(LMS_ADMIN_SESSION_COOKIE_NAME)?.value;
    if (lmsToken && (await hasLiveLmsAdminSession(lmsToken))) {
      authorized = true;
    }
  }
  if (!authorized) {
    authorized = Boolean(await getAdminSession());
  }
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 404 });
  }

  const kindRaw = (await ctx.params).kind;
  const kind: PersonPhotoKind | null =
    kindRaw === "student" || kindRaw === "teacher" ? kindRaw : null;
  const rowId = Number((await ctx.params).id);
  if (!kind || !Number.isInteger(rowId) || rowId <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const row = await getPersonPhotoRow(kind, rowId);
    if (!row || !row.photoKey) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    let bytes: Buffer;
    try {
      bytes = await getPrivateStorage().getObject(row.photoKey);
    } catch {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const ext = row.photoKey.split(".").pop()?.toLowerCase() ?? "";
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
