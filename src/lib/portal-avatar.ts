import "server-only";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lmsPortalAccounts } from "@/db/schema-lms";
import { getStorage } from "@/lib/storage";
import { markStorageBlobDeleted, recordStorageBlob } from "@/lib/storage-ledger";
import { extForImageMime, optimizeProfileImage } from "@/lib/image-optimize";

/**
 * v2.9.15.6 — SELF-SERVICE profile photos for the account-level roles
 * (the owner: "dan admin,parent,lms-admin,student,teacher,principal acc
 * wala profile photo eka daddi nikanma upload karala danna witharai
 * thiyenne. eka mehema wenna one").
 *
 * PARENTS and PRINCIPALS have no office register row, so their photo hangs
 * on the ACCOUNT row (lms_portal_accounts) — the same place the LMS
 * admin's photo already lives — under its own bucket prefix:
 *
 *   · bytes go to the provider-neutral storage layer under
 *     `portal-avatars/` — never the shared Media Library, never public;
 *   · the row keeps the storage KEY (avatar_key) while avatar_url keeps
 *     the Google picture — a custom upload wins for display until it is
 *     removed, then the Google picture steps back in automatically;
 *   · the display URL rides the session-gated /api/portal/my-avatar route
 *     (same-origin <img>, anonymous callers get 404);
 *   · replacing/removing deletes the old blob AND marks the storage
 *     ledger, so the admin Storage page stays truthful;
 *   · a Google sign-in's clobber guard: loginPortalViaSupabase writes
 *     avatar_url only — avatar_key is NEVER touched by login, so an
 *     uploaded photo survives every sign-in.
 */

const AVATAR_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const PORTAL_AVATAR_ACCEPT = ".jpg,.jpeg,.png,.webp";

function extensionFor(name: string): string {
  const raw = name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "";
}

export type StoredPortalAvatar = { key: string; displayUrl: string; sizeBytes: number };

/** Cache-busted display URL — only the gated route can resolve it. */
export function portalAvatarDisplayUrl(key: string): string {
  /* The key's random tail changes on every upload, so the URL busts the
     browser cache without touching the row. */
  return `/api/portal/my-avatar?v=${encodeURIComponent(key.slice(-16))}`;
}

/** Validate + store one private avatar upload for a portal ACCOUNT row.
 *  v2.9.15.10 — rides the shared sharp optimizer (fit inside 1024², WebP
 *  q80) so raw phone shots stop landing byte-for-byte. */
export async function storePortalAvatar(
  accountId: number,
  file: File,
): Promise<StoredPortalAvatar | { error: string }> {
  const ext = extensionFor(file.name || "");
  if (!ext || !AVATAR_MIME_BY_EXT[ext]) {
    return { error: "Photos must be JPG, PNG or WebP images." };
  }
  if (file.size <= 0 || file.size > 12 * 1024 * 1024) {
    return { error: "Photos are limited to 12 MB — pick a smaller image." };
  }
  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.length === 0 || raw.length > 12 * 1024 * 1024) {
    return { error: "Photos are limited to 12 MB — pick a smaller image." };
  }

  const optimized = await optimizeProfileImage(raw);
  const bytes = optimized?.bytes ?? raw;
  const mimeType = optimized?.contentType ?? AVATAR_MIME_BY_EXT[ext];
  const finalExt = optimized ? extForImageMime(mimeType) : ext;

  const key = `portal-avatars/portal-${accountId}-${randomBytes(8).toString("hex")}.${finalExt}`;
  try {
    await getStorage().putObject({
      key,
      body: bytes,
      contentType: mimeType,
    });
  } catch {
    return { error: "Could not store the photo — try again." };
  }

  /* The ledger row — real size, real owner (best-effort). */
  try {
    await recordStorageBlob({
      key,
      bytes: bytes.length,
      contentType: mimeType,
      kind: "avatar",
      ownerKind: "portal_account",
      ownerId: accountId,
    });
  } catch {
    /* ledger hiccup must never block the avatar */
  }

  await db
    .update(lmsPortalAccounts)
    .set({ avatarKey: key })
    .where(eq(lmsPortalAccounts.id, accountId));

  return { key, displayUrl: portalAvatarDisplayUrl(key), sizeBytes: bytes.length };
}

/**
 * Remove the account's custom photo: clears avatar_key (the Google
 * picture steps back in), deletes the blob and marks the ledger.
 * Idempotent — no custom photo is still a success.
 */
export async function deletePortalAvatar(accountId: number): Promise<void> {
  const [row] = await db
    .select({ avatarKey: lmsPortalAccounts.avatarKey })
    .from(lmsPortalAccounts)
    .where(eq(lmsPortalAccounts.id, accountId))
    .limit(1);
  const key = row?.avatarKey ?? null;

  await db
    .update(lmsPortalAccounts)
    .set({ avatarKey: null })
    .where(eq(lmsPortalAccounts.id, accountId));

  if (!key) return;
  try {
    await getStorage().deleteObject(key);
  } catch {
    /* a storage hiccup must never block the profile update */
  }
  try {
    await markStorageBlobDeleted(key);
  } catch {
    /* ledger hiccup must never block the profile update */
  }
}
