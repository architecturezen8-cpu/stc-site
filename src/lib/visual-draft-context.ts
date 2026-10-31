import "server-only";

import { headers } from "next/headers";
import { getAdminSession } from "@/lib/admin-auth";

/**
 * v2.8.98.0 — draft-preview context for the visual editor.
 *
 * The middleware stamps `x-visual-draft: 1` on every page request whose URL
 * carries one of the editor/preview flags (?visualEditor=1, ?cmsPreview=1,
 * ?cmsEditor=1). Server components — VisualBlockSections in particular —
 * read this header + the admin session to decide whether DRAFT content
 * (freshly added blocks, unpublished edits) should render. Without it, a
 * block added from the visual editor appeared NOWHERE until Publish — the
 * owner's exact report: "add karana ewa site eke show wenne na".
 */
export async function visualDraftRequested(): Promise<boolean> {
  try {
    const store = await headers();
    return store.get("x-visual-draft") === "1";
  } catch {
    return false;
  }
}

/** True only when the draft flag is present AND the visitor is a signed-in admin. */
export async function isVisualDraftContext(): Promise<boolean> {
  if (!(await visualDraftRequested())) return false;
  try {
    return Boolean(await getAdminSession());
  } catch {
    return false;
  }
}
