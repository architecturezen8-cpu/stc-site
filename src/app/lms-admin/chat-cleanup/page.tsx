import { ChatCleanupPanel } from "@/components/lms-admin/chat-cleanup-panel";
import { LmsAdminShell } from "@/components/lms-admin/lms-admin-shell";
import { requireLmsAdmin } from "@/lib/lms-admin-auth";
import { ensureSchemaExtras } from "@/lib/schema-extras";

export const dynamic = "force-dynamic";

/**
 * v2.8.70.1 — Chat cleanup (LMS Admin Studio). The owner: "chat eka week
 * eken auto clear karanna… database eka aparade" — the studio picks the
 * durations for messages AND attachments; the sweep runs on chat traffic
 * (throttled) plus the manual "Clean up now" button.
 */
export default async function LmsAdminChatCleanupPage() {
  const session = await requireLmsAdmin();
  await ensureSchemaExtras();

  return (
    <LmsAdminShell
      session={session}
      active="chat-cleanup"
      title="Chat Cleanup"
      subtitle="Auto-clear chat messages and files after your chosen duration — keep the database lean"
    >
      <ChatCleanupPanel />
    </LmsAdminShell>
  );
}
