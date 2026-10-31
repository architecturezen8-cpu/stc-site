import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormSubmissionsViewer } from "@/components/admin/form-submissions-viewer";
import { requirePermission } from "@/lib/admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";
import { db } from "@/db";
import { customForms } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — ADMIN submissions explorer for one custom form: the table,
 * the Excel export and the per-submission file downloads.
 */
export default async function AdminFormSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requirePermission("forms", "read");
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  await ensureSchemaExtras();
  const [form] = await db.select().from(customForms).where(eq(customForms.id, id)).limit(1);
  if (!form) notFound();

  return (
    <AdminShell
      user={admin}
      title={`Submissions — ${form.title}`}
      subtitle="Form Builder · every answer set with its SF reference and files"
      actions={
        <Link
          href={`/admin/forms/builder/${form.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          Edit form
        </Link>
      }
    >
      <FormSubmissionsViewer
        formId={form.id}
        formSlug={form.slug}
        formTitle={form.title}
        fields={form.fields}
      />
    </AdminShell>
  );
}
