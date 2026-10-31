import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, customFormSubmissions, customForms } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import {
  slugifyFormTitle,
  validateFieldList,
} from "@/lib/form-builder";
import { colomboInputToIso } from "@/lib/post-visibility";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — ADMIN Form Builder API (one form).
 *
 * GET    /api/admin/forms/builder/[id]  → the row
 * PUT    /api/admin/forms/builder/[id]  → full update (fields re-validated)
 * DELETE /api/admin/forms/builder/[id]  → cascade: submissions rows gone,
 *          their storage objects deleted best-effort (a storage hiccup must
 *          never block the delete — the bytes are orphaned, not the UI).
 */

function badId(rawId: string): number | null {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function safeWindow(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const iso = colomboInputToIso(value);
  return iso ? new Date(iso) : null;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const { id: rawId } = await ctx.params;
  const id = badId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid form id." }, { status: 400 });
  }
  const [form] = await db.select().from(customForms).where(eq(customForms.id, id)).limit(1);
  if (!form) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  return NextResponse.json({ form });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const { id: rawId } = await ctx.params;
  const id = badId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid form id." }, { status: 400 });
  }

  try {
    const [existing] = await db.select().from(customForms).where(eq(customForms.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Form not found." }, { status: 404 });

    const body = (await req.json()) as {
      title?: unknown;
      slug?: unknown;
      description?: unknown;
      published?: unknown;
      receiptEmail?: unknown;
      officeNotify?: unknown;
      openAt?: unknown;
      closeAt?: unknown;
      fields?: unknown;
    };

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.title === "string" && body.title.trim()) {
      patch.title = body.title.trim().slice(0, 200);
    }
    if (typeof body.description === "string") {
      patch.description = body.description.trim().slice(0, 1000);
    }
    if (typeof body.published === "boolean") patch.published = body.published;
    if (typeof body.receiptEmail === "boolean") patch.receiptEmail = body.receiptEmail;
    if (typeof body.officeNotify === "boolean") patch.officeNotify = body.officeNotify;

    if (body.openAt !== undefined) {
      const openAt = safeWindow(body.openAt);
      if (openAt !== undefined) patch.openAt = openAt;
    }
    if (body.closeAt !== undefined) {
      const closeAt = safeWindow(body.closeAt);
      if (closeAt !== undefined) patch.closeAt = closeAt;
    }

    if (body.fields !== undefined) {
      const fieldsCheck = validateFieldList(body.fields);
      if (!fieldsCheck.ok) {
        return NextResponse.json({ error: fieldsCheck.errors.join(" ") }, { status: 400 });
      }
      patch.fields = fieldsCheck.fields;
    }

    /* Slug: normalise what the admin typed; uniqueness checked against the
       OTHER rows. Empty input keeps the existing slug. */
    if (typeof body.slug === "string") {
      const wanted = slugifyFormTitle(body.slug || String(patch.title ?? existing.title));
      if (wanted !== existing.slug) {
        const [taken] = await db
          .select({ id: customForms.id })
          .from(customForms)
          .where(and(eq(customForms.slug, wanted), ne(customForms.id, id)))
          .limit(1);
        if (taken) {
          return NextResponse.json(
            { error: `The address "forms/${wanted}" is already used by another form.` },
            { status: 400 },
          );
        }
        patch.slug = wanted;
      }
    }

    const [updated] = await db
      .update(customForms)
      .set(patch)
      .where(eq(customForms.id, id))
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "update_custom_form",
      entity: "custom_form",
      entityId: String(id),
      details: { keys: Object.keys(patch) },
    });

    return NextResponse.json({ form: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save the form." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const { id: rawId } = await ctx.params;
  const id = badId(rawId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid form id." }, { status: 400 });
  }

  const [existing] = await db.select().from(customForms).where(eq(customForms.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  /* Best-effort storage cleanup for every submission file of this form. */
  const submissions = await db
    .select({ files: customFormSubmissions.files })
    .from(customFormSubmissions)
    .where(eq(customFormSubmissions.formId, id));
  const keys = submissions.flatMap((row) => row.files.map((f) => f.key));
  if (keys.length) {
    const storage = getStorage();
    await Promise.allSettled(keys.map((key) => storage.deleteObject(key)));
  }

  await db.delete(customFormSubmissions).where(eq(customFormSubmissions.formId, id));
  await db.delete(customForms).where(eq(customForms.id, id));

  await db.insert(adminAuditLogs).values({
    userId: admin.id,
    action: "delete_custom_form",
    entity: "custom_form",
    entityId: String(id),
    details: { slug: existing.slug, submissions: submissions.length, files: keys.length },
  });

  return NextResponse.json({ ok: true });
}
