import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { FormBuilderList } from "@/components/admin/form-builder-list";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * v2.8.85.0 — ADMIN Form Builder hub. Every admin-built custom form with
 * its status chips and submission count; "New form" creates a draft and
 * drops the admin straight into the editor.
 */
export default async function AdminFormBuilderPage() {
  const admin = await requirePermission("forms", "edit");

  return (
    <AdminShell
      user={admin}
      title="Form Builder"
      subtitle="Custom forms · build online forms, collect answers, export to Excel"
      actions={
        <Link
          href="/admin/forms/contacts"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          Fixed form inboxes
        </Link>
      }
    >
      <FormBuilderList />
    </AdminShell>
  );
}
