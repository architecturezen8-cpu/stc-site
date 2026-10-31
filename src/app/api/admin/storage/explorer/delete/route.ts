import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { deleteStorageObject } from "@/lib/storage-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — Storage Explorer delete: removes ONE object by key. Guarded at
 * the "storage" EDIT level (read-level roles never see the button). Deleting
 * is idempotent through the MediaStorage contract, the explorer caches are
 * invalidated so the next listing is truthful, and the action is audited.
 */
export async function POST(req: Request) {
  const session = await guardApi("storage", "edit");
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  if (!key.trim()) {
    return NextResponse.json(
      { ok: false, error: "Missing key." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    await deleteStorageObject(key);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not delete the object.",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    await db.insert(adminAuditLogs).values({
      userId: session.id,
      action: "storage_object_deleted",
      entity: "media_object",
      entityId: key,
    });
  } catch {
    // Audit logging must never block the delete itself.
  }

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
