import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customFormSubmissions } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — ADMIN download of ONE custom-form submission file.
 *
 * GET /api/admin/forms/builder/[id]/file?key=forms/{slug}/{uuid}-name
 *
 * Admin-only ("forms" read), and the key must live under forms/ AND belong
 * to a file this form's submissions actually reference — a guessed or
 * foreign key 404s even for a signed-in admin.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const { id: rawId } = await ctx.params;
  const formId = Number(rawId);
  if (!Number.isInteger(formId) || formId <= 0) {
    return NextResponse.json({ error: "Invalid form id." }, { status: 400 });
  }

  const key = new URL(req.url).searchParams.get("key") || "";
  if (!key.startsWith("forms/") || key.includes("..") || key.length > 300) {
    return NextResponse.json({ error: "Invalid file key." }, { status: 400 });
  }

  /* The key must be pinned by one of THIS form's submissions. */
  const rows = await db
    .select({ files: customFormSubmissions.files })
    .from(customFormSubmissions)
    .where(eq(customFormSubmissions.formId, formId));
  const pinned = rows.flatMap((r) => r.files).find((f) => f.key === key);
  if (!pinned) {
    return NextResponse.json({ error: "File not found for this form." }, { status: 404 });
  }

  try {
    const buffer = await getStorage().getObject(key);
    const fileName = pinned.fileName || key.split("/").pop() || "file";
    const safeName = fileName.replace(/[\r\n"\\]/g, "_");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": pinned.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
