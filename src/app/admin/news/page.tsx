import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { NewsManager } from "@/components/admin/news-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "Achievements",
  "Sports",
  "Culture",
  "Academics",
  "Ceremony",
  "Notice",
];

export default async function AdminNewsPage() {
  const admin = await requirePermission("news", "read");
  return (
    <AdminShell
      user={admin}
      title="News & Stories"
      subtitle="Blog-style editor · every change is live on publish"
      actions={
        <a
          href="/news"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View blog
        </a>
      }
    >
      <NewsManager categories={CATEGORIES} />
    </AdminShell>
  );
}
