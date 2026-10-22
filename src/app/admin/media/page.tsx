import { AdminShell } from "@/components/admin/admin-shell";
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
    </AdminShell>
  );
}
