import { NextResponse } from "next/server";
import { guardApi } from "@/lib/admin-auth";
import { previewLegacyMigration, runLegacyMigration } from "@/lib/media-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 36 sequential imports (download + Sharp WebP variants) can take a while. */
export const maxDuration = 300;

/**
 * Phase 2.9 — legacy media migration endpoints.
 *
 * GET  → preview report (source/reference counts, zero writes)
 * POST → run the full migration (idempotent; re-runs only process leftovers)
 */
export async function GET() {
  const admin = await guardApi("media", "read");
  if (admin instanceof NextResponse) return admin;

  try {
    const preview = await previewLegacyMigration();
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to inspect legacy media." },
      { status: 500 },
    );
  }
}

export async function POST() {
  const admin = await guardApi("media", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const report = await runLegacyMigration(admin.id);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The migration failed." },
      { status: 500 },
    );
  }
}
