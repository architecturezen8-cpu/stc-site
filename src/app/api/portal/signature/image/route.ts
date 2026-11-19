import { NextResponse } from "next/server";
import { getPortalSession, getPortalSessionForRequest } from "@/lib/portal-auth";
import { getSignatureBytes, isSignatureKind } from "@/lib/portal-signature";

export const dynamic = "force-dynamic";

/**
 * v2.8.63.0 — serves the signed-in teacher/principal their OWN stamp bytes
 * (the preview inside the signature studio / profile). Every other pair of
 * eyes gets stamps only through /api/portal/report-card-signature, which
 * re-checks authorisation for THAT certified card.
 *
 * v2.9.15.0 — THE BROKEN-PREVIEW FIX (the owner: principal signature upload
 * karama preview eke broken image ekak pennane, report eke original image
 * eka apply wenawa). An <img> tag CANNOT send the x-portal-role header, so
 * the studio's preview fell through to the role-agnostic resolver — which
 * reads cookies student → teacher → parent → principal and happily
 * resolved the WRONG session in a browser that also holds another portal's
 * cookie. The hard role gate then 403'd and the preview showed a broken
 * image while the report sheet (which authorises per-card, not per-role)
 * printed the real bytes. Fix: the studio now passes ?role=… as a URL
 * hint (same trust model as the header — it only picks WHICH cookie to
 * read) and this route resolves ONLY that role's cookie.
 *
 * v2.9.15.0 — parents may preview their own signature too (print-time-only
 * placement on their child's sheet; the parent's bytes never reach other
 * viewers).
 */
const STAMP_ROLES = ["teacher", "principal", "parent"] as const;
type StampRole = (typeof STAMP_ROLES)[number];

function isStampRole(value: string | null): value is StampRole {
  return (STAMP_ROLES as readonly string[]).includes(value ?? "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hint = url.searchParams.get("role");
  /* The URL hint picks which role's cookie to read (an <img> cannot send
     headers); without it, fall back to the header-aware resolver. */
  const session = isStampRole(hint)
    ? await getPortalSession(hint)
    : await getPortalSessionForRequest(req, STAMP_ROLES);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!isStampRole(session.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const kind = url.searchParams.get("kind");
  if (!isSignatureKind(kind)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const stamp = await getSignatureBytes(session.accountId, kind);
    if (!stamp) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const bytes = Buffer.from(stamp.data, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": stamp.mime || "image/png",
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
