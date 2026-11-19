import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { createMaterial, getTeacherMaterials } from "@/lib/portal-classroom";

export const dynamic = "force-dynamic";

/**
 * PHASE 3.1-e — teacher materials (notes / worksheets / videos handed out
 * to a class×subject).
 * GET  → every material the teacher has posted (with file counts).
 * POST → create one: { classSubjectId, title, linkUrl?, files? } — files
 *        arrive as lms-work/ refs uploaded through
 *        /api/portal/assignment-files (the shared classroom uploader).
 */
export async function GET() {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const materials = await getTeacherMaterials(session.accountId);
    return NextResponse.json({ ok: true, materials });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not load materials." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await getPortalSession("teacher");
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        classSubjectId?: number;
        title?: string;
        linkUrl?: string;
        files?: unknown;
      }
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await createMaterial(session.accountId, body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not save the material." },
      { status: 500 },
    );
  }
}
