import { NextResponse } from "next/server";

import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { markStorageBlobDeleted } from "@/lib/storage-ledger";
import { deleteStorageObject } from "@/lib/storage-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — Storage Explorer delete: removes ONE object by key. Guarded at
 * the "storage" EDIT level (read-level roles never see the button). Deleting
 * is idempotent through the MediaStorage contract, the explorer caches are
 * invalidated so the next listing is truthful, and the action is audited.
 *
 * v2.9.15.6 — when the object is a profile photo / avatar (a ledger row
 * exists), the row is MARKED in the same breath. Before this, an explorer
 * delete emptied the bucket but left the ledger counting phantom bytes —
 * the exact "deleted but the bucket fills anyway" complaint (owner). The
 * reconciliation card shows the two numbers agreeing again.
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

  /* v2.9.15.6 — mark the ledger row (best-effort, best-effort contract). */
  try {
    await markStorageBlobDeleted(key);
  } catch {
    /* a ledger hiccup must never block the delete */
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
