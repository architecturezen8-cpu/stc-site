import "server-only";

import { randomBytes } from "node:crypto";
import { getStorage } from "@/lib/storage";
import { markStorageBlobDeleted, recordStorageBlob } from "@/lib/storage-ledger";
import { extForImageMime, optimizeProfileImage } from "@/lib/image-optimize";

/**
 * v2.9.15.0 — PRIVATE LMS-admin profile photos (clone of admin-avatar.ts
 * v2.8.87.0 for the LMS Admin Studio).
 *
 * The owner: "user kenek ekata eyage photo ekak ehema upload karoth
 * hamotama balanna puluwan — eke kisima privacy ekak na."
 *
 * Same contract as the website admins' photos:
 *
 *   · bytes go to the provider-neutral storage layer under
 *     `lms-admin-avatars/` — they never enter the shared Media Library
 *     and never get a public URL;
 *   · the row keeps the storage KEY (lms_portal_accounts.avatar_key)
 *     plus a RELATIVE display URL that is only served by the
 *     session-gated /api/lms-admin/avatar/[id] route — <img> tags are
 *     same-origin, so the LMS-admin session cookie rides along and
 *     anonymous callers get 404;
 *   · replacing/removing a photo deletes the old blob (best-effort);
 *     a Google account picture stays untouched until the LMS admin
 *     uploads over it (and is restored by the next Google sign-in when
 *     the upload is removed — see the clobber guard in lms-admin-auth).
 */

export const MAX_AVATAR_BYTES = 12 * 1024 * 1024; // 12 MB raw — the optimizer shrinks what lands

const AVATAR_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const AVATAR_ACCEPT = ".jpg,.jpeg,.png,.webp";

function extensionFor(name: string): string {
  const raw = name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(raw) ? raw : "";
}

export type StoredAvatar = { key: string; displayUrl: string };

/** Validate + store one private avatar upload for an LMS-admin account.
 *  v2.9.15.10 — rides the shared sharp optimizer (fit inside 1024², WebP
 *  q80) so raw phone shots stop landing byte-for-byte. */
export async function storeLmsAdminAvatar(
  accountId: number,
  file: File,
): Promise<StoredAvatar | { error: string }> {
  const ext = extensionFor(file.name || "");
  if (!ext || !AVATAR_MIME_BY_EXT[ext]) {
    return { error: "Photos must be JPG, PNG or WebP images." };
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    return { error: "Photos are limited to 12 MB — pick a smaller image." };
  }
  const raw = Buffer.from(await file.arrayBuffer());
  if (raw.length === 0 || raw.length > MAX_AVATAR_BYTES) {
    return { error: "Photos are limited to 12 MB — pick a smaller image." };
  }

  const optimized = await optimizeProfileImage(raw);
  const bytes = optimized?.bytes ?? raw;
  const mimeType = optimized?.contentType ?? AVATAR_MIME_BY_EXT[ext];
  const finalExt = optimized ? extForImageMime(mimeType) : ext;

  const key = `lms-admin-avatars/lms-admin-${accountId}-${randomBytes(8).toString("hex")}.${finalExt}`;
  try {
    await getStorage().putObject({
      key,
      body: bytes,
      contentType: mimeType,
    });
  } catch {
    return { error: "Could not store the photo — try again." };
  }
  /* v2.9.15.6 — the storage ledger row: avatars now carry their REAL size
     into the admin Storage page (owner: "okkoma storage hariyatama track
     wenna ona"). Best-effort — never blocks the upload. */
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
  return { key, displayUrl: lmsAdminAvatarUrlFor(accountId) };
}

/** Cache-busted display URL — only the gated route can resolve it. */
export function lmsAdminAvatarUrlFor(accountId: number): string {
  return `/api/lms-admin/avatar/${accountId}?v=${Date.now()}`;
}

/** Best-effort blob cleanup for a replaced/removed avatar. */
export async function deleteLmsAdminAvatarBlob(key: string | null | undefined) {
  if (!key) return;
  try {
    await getStorage().deleteObject(key);
  } catch {
    /* a storage hiccup must never block the profile update */
  }
  /* v2.9.15.6 — mark the ledger row so Storage stops counting these bytes. */
  try {
    await markStorageBlobDeleted(key);
  } catch {
    /* ledger hiccup must never block the profile update */
  }
}
