import { NextResponse } from "next/server";
import { getPortalSessionForRequest } from "@/lib/portal-auth";
import { getSignatureBytes, isSignatureKind } from "@/lib/portal-signature";

export const dynamic = "force-dynamic";

/**
 * v2.8.63.0 — serves the signed-in teacher/principal their OWN stamp bytes
 * (the preview inside the signature studio / profile). Every other pair of
 * eyes gets stamps only through /api/portal/report-card-signature, which
 * re-checks authorisation for THAT certified card.
 */
export async function GET(req: Request) {
  const session = await getPortalSessionForRequest(req, ["teacher", "principal"]);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher" && session.role !== "principal") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const kind = new URL(req.url).searchParams.get("kind");
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
