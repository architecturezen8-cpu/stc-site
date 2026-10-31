import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormBuilderEditor, type BuilderEditorForm } from "@/components/admin/form-builder-editor";
import { requirePermission } from "@/lib/admin-auth";
import { FORM_FIELD_TYPE_LABELS, FORM_FIELD_TYPES } from "@/lib/form-builder";
import { isoToColomboInput } from "@/lib/post-visibility";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { db } from "@/db";
import { customForms } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — ADMIN Form Builder editor page. Loads the row server-side
 * (datetimes converted to Sri Lanka datetime-local values, the same
 * convention the posts scheduler uses) and hands it to the client editor.
 */
export default async function AdminFormBuilderEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requirePermission("forms", "edit");
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await ensureSchemaExtras();
  const [form] = await db.select().from(customForms).where(eq(customForms.id, id)).limit(1);
  if (!form) notFound();

  const initial: BuilderEditorForm = {
    id: form.id,
    slug: form.slug,
    title: form.title,
    description: form.description,
    published: form.published,
    receiptEmail: form.receiptEmail,
    officeNotify: form.officeNotify,
    openAtInput: isoToColomboInput(form.openAt ? form.openAt.toISOString() : null),
    closeAtInput: isoToColomboInput(form.closeAt ? form.closeAt.toISOString() : null),
    fields: form.fields,
  };

  return (
    <AdminShell
      user={admin}
      title={form.title}
      subtitle="Form Builder · edit the form, its questions and its collection window"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/forms/builder/${form.id}/submissions`}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
          >
            Submissions
          </Link>
          <Link
            href="/admin/forms/builder"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
          >
            All forms
          </Link>
        </div>
      }
    >
      <FormBuilderEditor
        initial={initial}
        typeOptions={FORM_FIELD_TYPES.map((value) => ({ value, label: FORM_FIELD_TYPE_LABELS[value] }))}
      />
    </AdminShell>
  );
}
