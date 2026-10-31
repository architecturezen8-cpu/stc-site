import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminAuditLogs,
  cmsSections,
  posts,
  siteSettings,
  visualPatchRevisions,
  visualPatches,
} from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { syncPageMediaUsage } from "@/lib/media-usage";
import {
  publishAllLogoDrafts,
  upsertLogoAsset,
} from "@/lib/logos";
import {
  discardVisualBlockDrafts,
  publishVisualBlocks,
} from "@/lib/visual-blocks-server";

/* v2.8.93.0 — the site crest (navbar + footer emblem) is ONE element
   rendered on EVERY page: its patches are stored under the wildcard
   pagePath "*" so a hide/replacement is global, never page-scoped
   (worklog Task 97, A4 — "emblem hide doesn't work"). */
const SITE_CREST_SELECTOR = '[data-visual-key="site-crest"]';
const GLOBAL_PATH = "*";

function validPath(path: unknown): path is string {
  if (path === GLOBAL_PATH) return true;
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("/admin") &&
    !path.startsWith("/api") &&
    path.length <= 240
  );
}

function cleanData(value: unknown) {
  const input = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const data: {
    text?: string;
    href?: string;
    src?: string;
    alt?: string;
    hidden?: boolean;
    textMode?: "direct" | "full";
    backgroundImage?: string;
    backgroundColor?: string;
    logoScale?: number;
    videoAutoplay?: boolean;
    videoLoop?: boolean;
    videoMuted?: boolean;
    videoControls?: boolean;
  } = {};
  if (typeof input.text === "string") data.text = input.text.slice(0, 20000);
  if (typeof input.alt === "string") data.alt = input.alt.slice(0, 1000);
  if (typeof input.hidden === "boolean") data.hidden = input.hidden;
  if (input.textMode === "direct" || input.textMode === "full") {
    data.textMode = input.textMode;
  }
  for (const key of ["href", "src", "backgroundImage"] as const) {
    if (typeof input[key] === "string") {
      const url = input[key].trim();
      // "none" (computed style of an unbranded element) means “clear”.
      if (!url || url === "none") {
        data[key] = "";
        continue;
      }
      if (!url.startsWith("/") && !url.startsWith("https://") && !url.startsWith("#")) {
        throw new Error(`${key} must be a local path, anchor or HTTPS URL.`);
      }
      data[key] = url.slice(0, 2000);
    }
  }
  if (typeof input.backgroundColor === "string") {
    const color = input.backgroundColor.trim();
    if (
      color &&
      !/^#[0-9a-f]{3,8}$/i.test(color) &&
      !/^rgba?\([0-9., %]+\)$/i.test(color)
    ) {
      throw new Error("Background colour must be a HEX, rgb or rgba value.");
    }
    data.backgroundColor = color.slice(0, 80);
  }
  // v2.9.8.0 — video render options (img→video replacements + native videos).
  for (const key of [
    "videoAutoplay",
    "videoLoop",
    "videoMuted",
    "videoControls",
  ] as const) {
    if (typeof input[key] === "boolean") data[key] = input[key];
  }
  if (input.logoScale !== undefined && input.logoScale !== null) {
    const scale = Math.round(Number(input.logoScale));
    if (!Number.isFinite(scale)) throw new Error("Invalid logo size.");
    data.logoScale = Math.max(40, Math.min(240, scale));
  }
  return data;
}

export async function GET(req: Request) {
  const admin = await guardApi("pages", "read");
  if (admin instanceof NextResponse) return admin;
  const path = new URL(req.url).searchParams.get("path") || "/";
  if (!validPath(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });

  /* Global (*) rows ride along on every page so the editor sees — and can
     undo — the site-wide crest edits from anywhere. */
  const patches = await db
    .select()
    .from(visualPatches)
    .where(inArray(visualPatches.pagePath, [path, GLOBAL_PATH]))
    .orderBy(asc(visualPatches.id));
  const revisions = await db
    .select({ id: visualPatchRevisions.id, createdAt: visualPatchRevisions.createdAt })
    .from(visualPatchRevisions)
    .where(eq(visualPatchRevisions.pagePath, path))
    .orderBy(asc(visualPatchRevisions.id));

  const hasDraftChanges = patches.some(
    (patch) => JSON.stringify(patch.draftData) !== JSON.stringify(patch.publishedData),
  );
  return NextResponse.json({ patches, revisions, hasDraftChanges });
}

export async function PATCH(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await req.json();
    if (!validPath(body.pagePath)) throw new Error("Invalid page path.");
    const selector = String(body.selector ?? "").trim();
    if (!selector || selector.length > 2000) throw new Error("Invalid element selector.");
    const data = cleanData(body.data);
    /* The crest is global — a save from any page lands on the "*" row.
       v2.9.0.0 — the editor also flags header/footer (site chrome) edits
       with scope:"global": the navbar and footer render on EVERY page, so
       their patches are site-wide by nature, never page-scoped. */
    const pagePath =
      selector === SITE_CREST_SELECTOR || body.scope === "global"
        ? GLOBAL_PATH
        : (body.pagePath as string);

    /* ── Registry logo save ─────────────────────────────────────────────
       Elements carrying data-logo-id belong to the central logo registry.
       The image + size are written to the SHARED row (keyed by logo id),
       never to a page-local patch — so every page rendering this logo
       updates together. Any legacy page patch on the same element is
       removed so the registry stays the single source of truth. */
    const logoId = typeof body.logoId === "string" ? body.logoId.trim() : "";
    if (logoId && /^[a-z0-9-]{1,120}$/.test(logoId)) {
      await upsertLogoAsset({
        logoKey: logoId,
        label: String(body.label ?? "").slice(0, 300) || undefined,
        src: data.backgroundImage ?? "",
        scale: data.logoScale,
        publish: false,
        userId: admin.id,
      });
      await db
        .delete(visualPatches)
        .where(
          and(
            eq(visualPatches.pagePath, pagePath),
            eq(visualPatches.selector, selector),
          ),
        );
      await db.insert(adminAuditLogs).values({
        userId: admin.id,
        action: "save_logo_draft",
        entity: "logo_asset",
        entityId: logoId,
        details: { via: "visual-editor", pagePath: body.pagePath },
      });
      revalidatePath("/", "layout");
      return NextResponse.json({ logo: true, logoKey: logoId });
    }

    const existing = await db
      .select()
      .from(visualPatches)
      .where(
        and(
          eq(visualPatches.pagePath, pagePath),
          eq(visualPatches.selector, selector),
        ),
      )
      .limit(1);

    const patch = existing[0]
      ? (
          await db
            .update(visualPatches)
            .set({
              draftData: data,
              label: String(body.label ?? existing[0].label).slice(0, 300),
              elementType: String(body.elementType ?? existing[0].elementType).slice(0, 30),
              updatedBy: admin.id,
              updatedAt: new Date(),
            })
            .where(eq(visualPatches.id, existing[0].id))
            .returning()
        )[0]
      : (
          await db
            .insert(visualPatches)
            .values({
              pagePath,
              selector,
              label: String(body.label ?? "Page element").slice(0, 300),
              elementType: String(body.elementType ?? "text").slice(0, 30),
              draftData: data,
              publishedData: {},
              updatedBy: admin.id,
            })
            .returning()
        )[0];

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "save_visual_patch",
      entity: "visual_patch",
      entityId: String(patch.id),
      details: { pagePath, selector },
    });
    await syncPageMediaUsage(pagePath).catch(() => 0);
    if (pagePath === GLOBAL_PATH) {
      /* The crest renders in the root layout — bust every page. */
      revalidatePath("/", "layout");
    } else {
      revalidatePath(pagePath);
    }
    return NextResponse.json({ patch });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save edit." },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const { pagePath, revisionId } = body;
    const action: string = body.action ?? "publish";

    /* v2.8.94.0 — A5 reconciliation audit: does this text / URL ALSO live
       in the Admin Studio tables (site settings, page sections, news)?
       Fired when an element is selected in the visual editor; the inspector
       warns that a patch would sit on top of the managed copy. */
    if (action === "audit") {
      const text = typeof body.text === "string" ? body.text.trim().slice(0, 200) : "";
      const src = typeof body.src === "string" ? body.src.trim().slice(0, 200) : "";
      const needle = text.length >= 12 ? text : src.length >= 12 ? src : "";
      if (!needle) return NextResponse.json({ conflicts: [] });
      const like = `%${needle.replace(/[\\%_]/g, (char: string) => `\\${char}`)}%`;
      const conflicts: Array<{ source: string; label: string }> = [];
      const settings = await db
        .select({ key: siteSettings.key })
        .from(siteSettings)
        .where(
          or(
            sql`${siteSettings.draftValue}::text ILIKE ${like}`,
            sql`${siteSettings.publishedValue}::text ILIKE ${like}`,
          ),
        )
        .limit(3);
      settings.forEach((row) =>
        conflicts.push({ source: "Site settings", label: row.key }),
      );
      const sections = await db
        .select({ pageSlug: cmsSections.pageSlug, label: cmsSections.label })
        .from(cmsSections)
        .where(
          or(
            sql`${cmsSections.draftData}::text ILIKE ${like}`,
            sql`${cmsSections.publishedData}::text ILIKE ${like}`,
          ),
        )
        .limit(3);
      sections.forEach((row) =>
        conflicts.push({
          source: "Page sections",
          label: `${row.label} (${row.pageSlug})`,
        }),
      );
      const news = await db
        .select({ title: posts.title })
        .from(posts)
        .where(
          or(
            ilike(posts.title, like),
            ilike(posts.excerpt, like),
            ilike(posts.image, like),
          ),
        )
        .limit(2);
      news.forEach((row) =>
        conflicts.push({ source: "News & Stories", label: row.title }),
      );
      return NextResponse.json({ conflicts });
    }

    if (!validPath(pagePath)) throw new Error("Invalid page path.");

    if (action === "restore") {
      const [revision] = await db
        .select()
        .from(visualPatchRevisions)
        .where(
          and(
            eq(visualPatchRevisions.id, Number(revisionId)),
            eq(visualPatchRevisions.pagePath, pagePath),
          ),
        )
        .limit(1);
      if (!revision) throw new Error("Version not found.");
      const snapshot = revision.snapshot as Array<{
        selector: string;
        label: string;
        elementType: string;
        data: Record<string, unknown>;
        /* v2.9.0.0 — scope marker written at publish time. */
        global?: boolean;
      }>;
      for (const item of snapshot) {
        /* Global rows restore onto their "*" home, not the acting page.
           v2.9.0.0 — header/footer chrome rows restore globally too. */
        const itemPath =
          item.selector === SITE_CREST_SELECTOR || item.global
            ? GLOBAL_PATH
            : pagePath;
        const [existing] = await db
          .select()
          .from(visualPatches)
          .where(
            and(
              eq(visualPatches.pagePath, itemPath),
              eq(visualPatches.selector, item.selector),
            ),
          )
          .limit(1);
        if (existing) {
          await db
            .update(visualPatches)
            .set({ draftData: cleanData(item.data), updatedBy: admin.id })
            .where(eq(visualPatches.id, existing.id));
        }
      }
      await syncPageMediaUsage(pagePath).catch(() => 0);
      revalidatePath(pagePath);
      return NextResponse.json({ success: true });
    }

    const rows = await db
      .select()
      .from(visualPatches)
      .where(inArray(visualPatches.pagePath, [pagePath, GLOBAL_PATH]));

    if (action === "discard") {
      await Promise.all(
        rows.map((row) =>
          db
            .update(visualPatches)
            .set({ draftData: row.publishedData, updatedBy: admin.id })
            .where(eq(visualPatches.id, row.id)),
        ),
      );
      await discardVisualBlockDrafts(pagePath, admin.id).catch(() => 0);
      await syncPageMediaUsage(pagePath).catch(() => 0);
      revalidatePath(pagePath);
      /* v2.9.0.0 — global chrome drafts were reset too — bust the layout. */
      revalidatePath("/", "layout");
      return NextResponse.json({ success: true });
    }

    await db.insert(visualPatchRevisions).values({
      pagePath,
      snapshot: rows.map((row) => ({
        selector: row.selector,
        label: row.label,
        elementType: row.elementType,
        data: row.publishedData,
        /* v2.9.0.0 — remember each row's scope so Restore lands global
           chrome edits back on the "*" home. */
        global: row.pagePath === GLOBAL_PATH,
      })),
      createdBy: admin.id,
    });
    await Promise.all(
      rows.map((row) =>
        db
          .update(visualPatches)
          .set({
            publishedData: row.draftData,
            updatedBy: admin.id,
            updatedAt: new Date(),
          })
          .where(eq(visualPatches.id, row.id)),
      ),
    );
    // Logo drafts are global — publishing any page promotes them everywhere.
    let logosPublished = 0;
    try {
      logosPublished = await publishAllLogoDrafts(admin.id);
    } catch {
      /* logo table may not exist yet — ignore */
    }
    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "publish_visual_page",
      entity: "visual_page",
      entityId: pagePath,
    });
    await publishVisualBlocks(pagePath, admin.id).catch(() => 0);
    await syncPageMediaUsage(pagePath).catch(() => 0);
    revalidatePath(pagePath);
    /* Global crest rows were touched too — bust the layout. */
    revalidatePath("/", "layout");
    if (logosPublished > 0) revalidatePath("/", "layout");
    return NextResponse.json({ success: true, logosPublished });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to publish edits." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  const { id, pagePath } = await req.json();
  await db.delete(visualPatches).where(eq(visualPatches.id, Number(id)));
  if (validPath(pagePath)) {
    await syncPageMediaUsage(pagePath).catch(() => 0);
    revalidatePath(pagePath);
  }
  /* A deleted row may have been the global crest patch — bust the layout. */
  revalidatePath("/", "layout");
  return NextResponse.json({ success: true });
}
