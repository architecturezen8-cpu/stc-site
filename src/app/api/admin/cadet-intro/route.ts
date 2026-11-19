import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, cadetIntroOverrides } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { listCadetIntroOverrides } from "@/lib/cadet-intro";
import { UNITS } from "@/lib/units";

export const dynamic = "force-dynamic";

const UNIT_SLUGS = new Set(UNITS.map((u) => u.slug));

function bustCadeting() {
  revalidatePath("/cadeting", "layout");
}

export async function GET() {
  const admin = await guardApi("preloaders", "read");
  if (admin instanceof NextResponse) return admin;
  const overrides = await listCadetIntroOverrides();
  return NextResponse.json({ overrides });
}

export async function PUT(req: Request) {
  const admin = await guardApi("preloaders", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const unitSlug = String(body.unitSlug ?? "").trim();
    if (!UNIT_SLUGS.has(unitSlug)) {
      return NextResponse.json({ error: "Unknown cadeting unit." }, { status: 400 });
    }

    const enabledRaw = String(body.enabled ?? "");
    const enabled = ["", "true", "false"].includes(enabledRaw) ? enabledRaw : "";
    const holdMsRaw = body.holdMs;
    const holdMs =
      holdMsRaw === null || holdMsRaw === undefined || holdMsRaw === ""
        ? null
        : Math.min(8000, Math.max(0, Math.round(Number(holdMsRaw))));
    const logoSrc = String(body.logoSrc ?? "").trim();
    const logoScale = Math.min(240, Math.max(40, Math.round(Number(body.logoScale) || 100)));
    const tagline = String(body.tagline ?? "").trim().slice(0, 160);

    const [row] = await db
      .insert(cadetIntroOverrides)
      .values({
        unitSlug,
        enabled,
        holdMs,
        logoSrc,
        logoScale,
        tagline,
        updatedBy: admin.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: cadetIntroOverrides.unitSlug,
        set: { enabled, holdMs, logoSrc, logoScale, tagline, updatedBy: admin.id, updatedAt: new Date() },
      })
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_cadet_intro",
      entity: "cadet_intro",
      entityId: unitSlug,
      details: { enabled, holdMs, logoSrc, logoScale, tagline },
    });

    bustCadeting();
    return NextResponse.json({ override: row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the preloader." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("preloaders", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const unitSlug = new URL(req.url).searchParams.get("unitSlug")?.trim() ?? "";
    if (!UNIT_SLUGS.has(unitSlug)) {
      return NextResponse.json({ error: "Unknown cadeting unit." }, { status: 400 });
    }
    await db.delete(cadetIntroOverrides).where(eq(cadetIntroOverrides.unitSlug, unitSlug));
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "reset_cadet_intro",
      entity: "cadet_intro",
      entityId: unitSlug,
    });
    bustCadeting();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reset the preloader." },
      { status: 400 },
    );
  }
}
