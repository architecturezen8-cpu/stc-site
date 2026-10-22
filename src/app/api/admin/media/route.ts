import { NextResponse } from "next/server";
import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  mediaAssets,
  mediaUsage,
  mediaVariants,
} from "@/db/schema";
import { PORTRAIT, SCENE } from "@/lib/media";
import { guardApi } from "@/lib/admin-auth";

const LEGACY_ASSETS = [
  { title: "Hero Campus View", url: "/images/hero.jpg", category: "Campus", folder: "site-assets" },
  { title: "Historic Quadrangle", url: "/images/about.jpg", category: "Campus", folder: "site-assets" },
  { title: "Principal Portrait", url: "/images/principal.jpg", category: "Portraits", folder: "staff" },
  { title: "Sports & Cricket", url: "/images/sports.jpg", category: "Sports", folder: "sports" },
  { title: "Big Match Matchplay", url: "/images/news-sports.jpg", category: "Sports", folder: "news" },
  { title: "Robotics & Innovation Lab", url: "/images/clubs.jpg", category: "Academics", folder: "academics" },
  { title: "Senior Science Lab", url: "/images/senior-school.jpg", category: "Academics", folder: "academics" },
  { title: "Science Fair Champions", url: "/images/news-science.jpg", category: "Academics", folder: "news" },
  { title: "Middle School Classrooms", url: "/images/middle-school.jpg", category: "Campus", folder: "academics" },
  { title: "Western & Brass Band", url: "/images/news-music.jpg", category: "Arts & Culture", folder: "news" },
];

export async function GET(req: Request) {
  const admin = await guardApi("media", "read");
  if (admin instanceof NextResponse) return admin;

  const trash = new URL(req.url).searchParams.get("view") === "trash";
  const [assets, variants, usageCounts, usageRows] = await Promise.all([
    db
      .select()
      .from(mediaAssets)
      .where(trash ? isNotNull(mediaAssets.deletedAt) : isNull(mediaAssets.deletedAt))
      .orderBy(desc(mediaAssets.createdAt)),
    db.select().from(mediaVariants),
    db
      .select({ assetId: mediaUsage.assetId, count: sql<number>`count(*)::int` })
      .from(mediaUsage)
      .groupBy(mediaUsage.assetId),
    db
      .select({
        assetId: mediaUsage.assetId,
        entityType: mediaUsage.entityType,
        entityId: mediaUsage.entityId,
        fieldName: mediaUsage.fieldName,
        pagePath: mediaUsage.pagePath,
      })
      .from(mediaUsage),
  ]);

  const uploaded = assets.map((asset) => {
    const assetVariants = variants.filter((variant) => variant.assetId === asset.id);
    const master = assetVariants.find((variant) => variant.variantName === "master");
    const thumbnail =
      assetVariants.find((variant) => variant.variantName === "thumbnail") ?? master;
    return {
      ...asset,
      source: "uploaded" as const,
      url: master?.publicUrl ?? "",
      thumbnailUrl: thumbnail?.publicUrl ?? master?.publicUrl ?? "",
      variants: assetVariants,
      usageCount:
        usageCounts.find((usage) => usage.assetId === asset.id)?.count ?? 0,
      usage: usageRows
        .filter((row) => row.assetId === asset.id)
        .map((row) => ({
          entityType: row.entityType,
          entityId: row.entityId,
          fieldName: row.fieldName,
          pagePath: row.pagePath,
        })),
    };
  });

  const legacy = trash
    ? []
    : [
        ...LEGACY_ASSETS.map((asset, index) => ({
          id: `legacy-local-${index}`,
          ...asset,
          name: asset.title,
          altText: asset.title,
          caption: null,
          provider: "legacy",
          source: "legacy" as const,
          status: "ready",
          mimeType: asset.url.endsWith(".png") ? "image/png" : "image/jpeg",
          width: null,
          height: null,
          originalSize: 0,
          dominantColor: null,
          blurDataUrl: null,
          createdAt: null,
          deletedAt: null,
          thumbnailUrl: asset.url,
          variants: [],
          usageCount: 0,
        })),
        ...Object.entries(PORTRAIT).map(([name, url]) => ({
          id: `legacy-portrait-${name}`,
          title: `Faculty Portrait (${name})`,
          name: `Faculty Portrait (${name})`,
          altText: `Faculty portrait ${name}`,
          caption: null,
          url,
          thumbnailUrl: url,
          category: "Portraits",
          folder: "staff",
          provider: "external",
          source: "legacy" as const,
          status: "ready",
          mimeType: "image/jpeg",
          width: null,
          height: null,
          originalSize: 0,
          dominantColor: null,
          blurDataUrl: null,
          createdAt: null,
          deletedAt: null,
          variants: [],
          usageCount: 0,
        })),
        ...Object.entries(SCENE).map(([name, url]) => ({
          id: `legacy-scene-${name}`,
          title: `Campus Scene (${name})`,
          name: `Campus Scene (${name})`,
          altText: `Campus scene ${name}`,
          caption: null,
          url,
          thumbnailUrl: url,
          category: "Events & Sports",
          folder: "scenes",
          provider: "external",
          source: "legacy" as const,
          status: "ready",
          mimeType: "image/jpeg",
          width: null,
          height: null,
          originalSize: 0,
          dominantColor: null,
          blurDataUrl: null,
          createdAt: null,
          deletedAt: null,
          variants: [],
          usageCount: 0,
        })),
      ];

  return NextResponse.json({
    assets: [...uploaded, ...legacy],
    uploadedCount: uploaded.length,
    legacyCount: legacy.length,
  });
}

export async function PATCH(req: Request) {
  const admin = await guardApi("media", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new Error("Only uploaded assets can be edited.");

    if (body.action === "restore") {
      const [restored] = await db
        .update(mediaAssets)
        .set({ deletedAt: null, status: "ready", updatedAt: new Date() })
        .where(eq(mediaAssets.id, id))
        .returning();
      return NextResponse.json({ asset: restored });
    }

    const [updated] = await db
      .update(mediaAssets)
      .set({
        ...(typeof body.title === "string" && body.title.trim()
          ? { title: body.title.trim().slice(0, 500) }
          : {}),
        ...(typeof body.altText === "string"
          ? { altText: body.altText.trim().slice(0, 1000) }
          : {}),
        ...(typeof body.caption === "string"
          ? { caption: body.caption.trim().slice(0, 3000) || null }
          : {}),
        ...(typeof body.folder === "string" && body.folder.trim()
          ? {
              folder: body.folder
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 120),
            }
          : {}),
        ...(typeof body.category === "string" && body.category.trim()
          ? { category: body.category.trim().slice(0, 80) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_media",
      entity: "media_asset",
      entityId: String(id),
    });
    return NextResponse.json({ asset: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update asset." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("media", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await req.json();
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) {
      throw new Error("Only uploaded assets can be moved to trash.");
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaUsage)
      .where(eq(mediaUsage.assetId, numeric));
    if (count > 0) {
      return NextResponse.json(
        { error: `This image is used in ${count} place${count === 1 ? "" : "s"} and cannot be trashed.` },
        { status: 409 },
      );
    }

    const [trashed] = await db
      .update(mediaAssets)
      .set({ deletedAt: new Date(), status: "trashed", updatedAt: new Date() })
      .where(eq(mediaAssets.id, numeric))
      .returning();
    if (!trashed) return NextResponse.json({ error: "Asset not found." }, { status: 404 });

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "trash_media",
      entity: "media_asset",
      entityId: String(numeric),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to trash asset." },
      { status: 400 },
    );
  }
}
