import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guardApi } from "@/lib/admin-auth";
import {
  getCmsPage,
  reorderDraftSections,
  updateDraftSection,
} from "@/lib/cms";
import { getCmsPageDefinition } from "@/lib/cms-defaults";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const admin = await guardApi("pages", "read");
  if (admin instanceof NextResponse) return admin;
  const { slug } = await params;
  const page = await getCmsPage(slug, "draft");
  const definition = getCmsPageDefinition(slug);
  if (!page || !definition) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  return NextResponse.json({ page, definition });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  const { slug } = await params;
  const definition = getCmsPageDefinition(slug);
  if (!definition) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  try {
    const body = await req.json();
    if (body.action === "reorder") {
      const valid = new Set(definition.sections.map((s) => s.key));
      const keys = Array.isArray(body.keys)
        ? body.keys.filter((key: unknown): key is string => typeof key === "string" && valid.has(key))
        : [];
      if (keys.length !== definition.sections.length) {
        return NextResponse.json({ error: "Invalid section order." }, { status: 400 });
      }
      await reorderDraftSections({ pageSlug: slug, keys, userId: admin.id });
      revalidatePath(definition.path);
      return NextResponse.json({ success: true });
    }

    const section = definition.sections.find((s) => s.key === body.sectionKey);
    if (!section) return NextResponse.json({ error: "Unknown section." }, { status: 400 });

    const clean: Record<string, string> = {};
    for (const field of section.fields) {
      const value = body.data?.[field.key];
      let text = typeof value === "string" ? value.slice(0, 10000) : "";
      if ((field.type === "url" || field.type === "image") && text) {
        const safe = text.startsWith("/") || text.startsWith("https://");
        if (!safe) {
          return NextResponse.json(
            { error: `${field.label} must be a local /path or an HTTPS URL.` },
            { status: 400 },
          );
        }
      }
      clean[field.key] = text;
    }
    await updateDraftSection({
      pageSlug: slug,
      sectionKey: section.key,
      data: clean,
      hidden: Boolean(body.hidden),
      userId: admin.id,
    });
    revalidatePath(definition.path);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save draft." },
      { status: 400 },
    );
  }
}
