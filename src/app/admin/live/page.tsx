import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { HowThisWorks } from "@/components/admin/how-this-works";
import { LiveManager } from "@/components/admin/live-manager";
import { requirePermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLivePage() {
  const admin = await requirePermission("live", "read");
  return (
    <AdminShell
      user={admin}
      title="Live Streams"
      subtitle="YouTube · Facebook · Instagram · TikTok — live mode with a blinking navbar dot"
      actions={
        <a
          href="/live"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-medium text-white/60 transition-colors hover:border-white/35 hover:text-white"
        >
          <ExternalLink size={12} /> View /live page
        </a>
      }
    >
      <LiveManager />
      <HowThisWorks
        points={[
          "When the college is ON AIR, a red blinking dot appears in the site menu and the Live page opens the stream for visitors.",
          "Schedule a stream in advance and the dot turns green — visitors know exactly when to come back.",
          "Paste any YouTube, Facebook, Instagram or TikTok link — the site handles the embedding.",
        ]}
        tip="Turn the stream off when the event ends — the dots and the Live page switch off instantly."
      />
    </AdminShell>
  );
}
