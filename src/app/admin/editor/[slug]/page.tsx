import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/admin-auth";
import { getCmsPageDefinition } from "@/lib/cms-defaults";

export const dynamic = "force-dynamic";

/**
 * Backwards-compatible editor route. Editing now happens directly over the
 * original public page, at full browser width — never inside the admin shell.
 */
export default async function AdminEditorRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  /* v2.9.12.3 — view access may LOOK at the page in the editor; the editor
     chrome collapses to read-only for them (no Edit Mode / Publish). */
  await requirePermission("pages", "read");
  const { slug } = await params;
  const definition = getCmsPageDefinition(slug);
  if (!definition) notFound();
  redirect(
    `${definition.path}${definition.path.includes("?") ? "&" : "?"}visualEditor=1`,
  );
}
