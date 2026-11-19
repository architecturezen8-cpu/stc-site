import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { MediaLibrary } from "@/components/admin/media-library";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage() {
  const admin = await requirePermission("media", "read");
  return (
    <AdminShell
      user={admin}
      title="Media Library"
      subtitle="Categorised uploads · WebP variants · local, MinIO or R2 storage"
    >
      <MediaLibrary />
      <HowThisWorks
        points={[
          "Every photo, video and document on the website lives here — upload once, then use it anywhere.",
          "Files sit in folders, so each section of the site offers you exactly the right files when picking.",
          "Big photos are compressed automatically, so pages keep loading fast.",
        ]}
        tip="Deleting a file that is still used somewhere leaves an empty box — check first, or upload a replacement under the same name."
      />
    </AdminShell>
  );
}
