import "server-only";

import { randomBytes } from "node:crypto";
import { getStorage } from "@/lib/storage";

/**
 * v2.8.87.0 — PRIVATE admin profile photos.
 *
 * The owner: "admin eke profile eke profile image update karaddi enne
 * [media picker] eka. user kenek ekata eyage photo ekak ehema upload
 * karoth hamotama balanna puluwan — eke kisima privacy ekak na."
 *
 * The old flow dropped the photo into the shared Media Library
 * (site-assets), whose URLs are public by design — any visitor holding the
 * link could view an admin's face. The new flow mirrors the portal register
 * photos (v2.8.59.0):
 *
 *   · bytes go to the provider-neutral storage layer under `admin-avatars/`
 *     — they never enter the Media Library and never get a public URL;
 *   · the row keeps the storage KEY (admin_users.avatar_key) plus a
 *     RELATIVE display URL that is only served by the session-gated
 *     /api/admin/avatar/[id] route — <img> tags are same-origin, so the
 *     admin session cookie rides along and anonymous callers get 404;
 *   · replacing/removing a photo deletes the old blob (best-effort).
 */

export const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 MB

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

/** Validate + store one private avatar upload for an admin account. */
export async function storeAdminAvatar(
  userId: number,
  file: File,
): Promise<StoredAvatar | { error: string }> {
  const ext = extensionFor(file.name || "");
  if (!ext || !AVATAR_MIME_BY_EXT[ext]) {
    return { error: "Photos must be JPG, PNG or WebP images." };
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    return { error: "Photos are limited to 3 MB — pick a smaller image." };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) {
    return { error: "Photos are limited to 3 MB — pick a smaller image." };
  }

  const key = `admin-avatars/admin-${userId}-${randomBytes(8).toString("hex")}.${ext}`;
  try {
    await getStorage().putObject({
      key,
      body: bytes,
      contentType: AVATAR_MIME_BY_EXT[ext],
    });
  } catch {
    return { error: "Could not store the photo — try again." };
  }
  return { key, displayUrl: avatarUrlFor(userId) };
}

/** Cache-busted display URL — only the gated route can resolve it. */
export function avatarUrlFor(userId: number): string {
  return `/api/admin/avatar/${userId}?v=${Date.now()}`;
}

/** Best-effort blob cleanup for a replaced/removed avatar. */
export async function deleteAvatarBlob(key: string | null | undefined) {
  if (!key) return;
  try {
    await getStorage().deleteObject(key);
  } catch {
    /* a storage hiccup must never block the profile update */
  }
}
