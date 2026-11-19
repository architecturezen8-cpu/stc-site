import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  LOGO_GROUPS,
  countPendingLogoDrafts,
  listLogoAssets,
  publishAllLogoDrafts,
  publishLogoAsset,
  revertLogoAsset,
  upsertLogoAsset,
} from "@/lib/logos";

export const dynamic = "force-dynamic";

function bustSite() {
  // Logos render across the whole site — bust everything.
  revalidatePath("/", "layout");
}

export async function GET() {
  const admin = await guardApi("logos", "read");
  if (admin instanceof NextResponse) return admin;
  const [logos, pending] = await Promise.all([
    listLogoAssets(),
    countPendingLogoDrafts(),
  ]);
  return NextResponse.json({ logos, groups: LOGO_GROUPS, pending });
}

export async function PATCH(req: Request) {
  const admin = await guardApi("logos", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const logoKey = String(body.logoKey ?? "").trim();
    if (!/^[a-z0-9-]{1,120}$/.test(logoKey)) {
      return NextResponse.json({ error: "Invalid logo key." }, { status: 400 });
    }
    if (body.action === "revert") {
      const logo = await revertLogoAsset(logoKey);
      await db.insert(adminAuditLogs).values({
        userId: admin.id,
        action: "revert_logo",
        entity: "logo",
        entityId: logoKey,
      });
      bustSite();
      return NextResponse.json({ logo });
    }
    if (body.action === "publish") {
      const logo = await publishLogoAsset(logoKey, admin.id);
      await db.insert(adminAuditLogs).values({
        userId: admin.id,
        action: "publish_logo",
        entity: "logo",
        entityId: logoKey,
      });
      bustSite();
      return NextResponse.json({ logo });
    }

    const logo = await upsertLogoAsset({
      logoKey,
      label: typeof body.label === "string" ? body.label : undefined,
      group: typeof body.group === "string" ? body.group : undefined,
      src: body.src === undefined ? undefined : String(body.src ?? ""),
      scale: body.scale === undefined ? undefined : Number(body.scale),
      publish: Boolean(body.publish),
      userId: admin.id,
    });
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "save_logo_draft",
      entity: "logo",
      entityId: logoKey,
      details: { publish: Boolean(body.publish) },
    });
    bustSite();
    return NextResponse.json({ logo });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the logo." },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  const admin = await guardApi("logos", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { action } = await req.json();
    if (action !== "publish") throw new Error("Unknown action.");
    const count = await publishAllLogoDrafts(admin.id);
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "publish_logo",
      entity: "logo",
      details: { published: count },
    });
    bustSite();
    return NextResponse.json({ success: true, published: count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to publish." },
      { status: 400 },
    );
  }
}
