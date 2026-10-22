import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { GalleryManager } from "@/components/admin/gallery-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const CATEGORIES = ["Campus", "Academics", "Sports", "Arts & Culture"];
const ASPECTS = ["landscape", "portrait", "square"];

export default async function AdminGalleryPage() {
  const admin = await requirePermission("gallery", "read");
  return (
    <AdminShell
      user={admin}
      title="Campus Gallery"
      subtitle="Visual grid editor · reorder frames with the arrows"
      actions={
        <a
          href="/gallery"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View gallery
        </a>
      }
    >
      <GalleryManager categories={CATEGORIES} aspects={ASPECTS} />
    </AdminShell>
  );
}
