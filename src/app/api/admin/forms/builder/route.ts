import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, customFormSubmissions, customForms } from "@/db/schema";
import { guardApi } from "@/lib/admin-auth";
import { slugifyFormTitle, validateFieldList } from "@/lib/form-builder";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — ADMIN Form Builder API (collection).
 *
 * GET  /api/admin/forms/builder          → every form + its submission count
 * POST /api/admin/forms/builder          → create a form (fields validated)
 *
 * Both answers carry the raw rows; the builder UI derives status chips
 * (published / window open / count) locally with the shared helpers.
 */

/** A unique slug for a new form: base, base-2, base-3 … */
async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 60; i++) {
    const [taken] = await db
      .select({ id: customForms.id })
      .from(customForms)
      .where(eq(customForms.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString().slice(-6)}`;
}

export async function GET() {
  const admin = await guardApi("forms", "read");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  const rows = await db
    .select({
      id: customForms.id,
      slug: customForms.slug,
      title: customForms.title,
      description: customForms.description,
      kind: customForms.kind,
      fields: customForms.fields,
      published: customForms.published,
      receiptEmail: customForms.receiptEmail,
      officeNotify: customForms.officeNotify,
      openAt: customForms.openAt,
      closeAt: customForms.closeAt,
      createdAt: customForms.createdAt,
      updatedAt: customForms.updatedAt,
      submissionCount: sql<number>`(
        select count(*)::int from ${customFormSubmissions}
        where ${customFormSubmissions.formId} = ${customForms.id}
      )`,
    })
    .from(customForms)
    .orderBy(desc(customForms.updatedAt));

  return NextResponse.json({ forms: rows });
}

export async function POST(req: Request) {
  const admin = await guardApi("forms", "edit");
  if (admin instanceof NextResponse) return admin;
  await ensureSchemaExtras();

  try {
    const body = (await req.json()) as {
      title?: unknown;
      description?: unknown;
      fields?: unknown;
    };
    const title = String(body.title ?? "").trim().slice(0, 200);
    if (!title) {
      return NextResponse.json({ error: "A form title is required." }, { status: 400 });
    }

    const fieldsCheck = body.fields === undefined
      ? { ok: true as const, fields: [] }
      : validateFieldList(body.fields);
    if (!fieldsCheck.ok) {
      return NextResponse.json({ error: fieldsCheck.errors.join(" ") }, { status: 400 });
    }

    const slug = await uniqueSlug(slugifyFormTitle(title));
    const [created] = await db
      .insert(customForms)
      .values({
        slug,
        title,
        description: String(body.description ?? "").trim().slice(0, 1000),
        fields: fieldsCheck.fields,
        published: false,
        createdBy: admin.id,
      })
      .returning();

    await db.insert(adminAuditLogs).values({
      userId: admin.id,
      action: "create_custom_form",
      entity: "custom_form",
      entityId: String(created.id),
      details: { slug: created.slug, title: created.title },
    });

    return NextResponse.json({ form: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the form." },
      { status: 400 },
    );
  }
}
