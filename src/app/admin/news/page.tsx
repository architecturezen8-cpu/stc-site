import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
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
      <HowThisWorks
        points={[
          "Write a story, add photos and press Publish — it appears on the public News page and the home page straight away.",
          "Save as a draft to keep working privately — drafts stay invisible to visitors.",
          "The newest story always sits at the top; older ones move down automatically.",
        ]}
        tip="The category list is managed in Filters & Categories — rename or add there and this page updates too."
      />
    </AdminShell>
  );
}
