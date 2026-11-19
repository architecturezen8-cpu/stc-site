import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { guardApi } from "@/lib/admin-auth";
import { VISUAL_BLOCK_DEFS, blockDef } from "@/lib/visual-block-defs";
import {
  createVisualBlock,
  deleteVisualBlock,
  getVisualBlocks,
  updateVisualBlock,
} from "@/lib/visual-blocks-server";

function validPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("/admin") &&
    !value.startsWith("/api") &&
    value.length <= 240
  );
}

export async function GET(req: Request) {
  const admin = await guardApi("pages", "read");
  if (admin instanceof NextResponse) return admin;
  const path = new URL(req.url).searchParams.get("path") || "/";
  if (!validPath(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  const blocks = await getVisualBlocks(path, "draft");
  return NextResponse.json({
    blocks,
    definitions: VISUAL_BLOCK_DEFS.map((def) => ({
      type: def.type,
      label: def.label,
      description: def.description,
      category: def.category,
      fields: def.fields,
    })),
  });
}

export async function POST(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { pagePath, blockType, position } = await req.json();
    if (!validPath(pagePath)) throw new Error("Invalid page path.");
    if (!blockDef(String(blockType))) throw new Error("Unknown block type.");
    const created = await createVisualBlock({
      pagePath,
      blockType: String(blockType),
      // v2.8.98.0 — owner-chosen landing spot ("top" under the navbar,
      // "bottom" above the footer).
      position,
      userId: admin.id,
    });
    revalidatePath(pagePath);
    return NextResponse.json({ block: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to add block." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new Error("Invalid block.");
    const updated = await updateVisualBlock({
      id,
      input: {
        data: body.data,
        hidden: body.hidden,
        sortOrder: body.sortOrder,
        position: body.position,
      },
      userId: admin.id,
    });
    revalidatePath(updated.pagePath);
    return NextResponse.json({ block: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save block." },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const admin = await guardApi("pages", "edit");
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await req.json();
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) throw new Error("Invalid block.");
    await deleteVisualBlock(numeric, admin.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete block." },
      { status: 400 },
    );
  }
}
