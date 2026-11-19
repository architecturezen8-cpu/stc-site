"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { PhotoStudio } from "@/components/shared/photo-studio";

/**
 * v2.9.15.6 — the profile page's avatar, now a DOOR (the owner: "profile
 * photo ekata photo ekak danna giyama eka click karama popup ekak enna
 * one. eke profile photo eke size ekata logo eka crop karala, filter
 * ekak ehema dala photo eka danna option ekak danna one. aya photo eka
 * delete karanna ehema option ekak").
 *
 * Clicking the avatar (photo OR the initials disc) opens the shared
 * Photo Studio popup — WhatsApp-style circular crop, Instagram-style
 * filter chips, fine-tune sliders, rotate/flip — and posts the edited
 * square to /api/portal/profile/photo, which routes by role:
 *   · student / teacher → the office REGISTER row (photo_key);
 *   · parent / principal → the ACCOUNT row (avatar_key, portal-avatars/).
 * DELETE removes the custom photo (the blob really leaves the bucket —
 * the storage ledger is marked in the same breath); a Google picture
 * (external URL) hides the remove option, since there is nothing of
 * ours to delete.
 */
export function ProfileAvatarControl({
  photoUrl,
  name,
  photoBytes = null,
  photoWidth = null,
  photoHeight = null,
}: {
  /** Current display URL — register photo, account avatar (or the Google picture). */
  photoUrl: string | null;
  name: string;
  /** v2.9.15.10 — stored bytes (from the storage ledger) + dimensions for
      the Photo Studio's honest size badge. */
  photoBytes?: number | null;
  photoWidth?: number | null;
  photoHeight?: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(photoUrl);
  const inputRef = useRef<HTMLInputElement | null>(null);
  void inputRef; /* the file input lives inside PhotoStudio */

  /* Only OUR blobs are removable — an external Google picture has no
     bytes of ours to delete (nothing to free, nothing to mark). */
  const removable = Boolean(avatarUrl && avatarUrl.startsWith("/"));

  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "ST";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={avatarUrl ? "Edit profile photo" : "Add profile photo"}
        title={avatarUrl ? "Tap to edit your photo" : "Tap to add a photo"}
        className="group relative h-16 w-16 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--pt-accent)]"
      >
        {avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={avatarUrl}
            alt={`${name}'s profile photo`}
            className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--pt-accent)]/40 transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--pt-accent-soft)] font-display text-[20px] font-semibold text-[var(--pt-accent-text)] transition-transform duration-300 group-hover:scale-[1.03]">
            {initials}
          </span>
        )}
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] shadow transition-colors group-hover:border-[var(--pt-accent)] group-hover:text-[var(--pt-accent-text)]"
        >
          <Camera size={14} />
        </span>
      </button>

      <PhotoStudio
        open={open}
        onClose={() => setOpen(false)}
        ownerName={name}
        title="Profile photo"
        currentPhotoUrl={avatarUrl}
        initials={initials}
        photoMeta={{ bytes: photoBytes, width: photoWidth, height: photoHeight }}
        upload={{ endpoint: "/api/portal/profile/photo", method: "POST" }}
        remove={removable ? { endpoint: "/api/portal/profile/photo", method: "DELETE" } : null}
        onDone={(displayUrl) => {
          setAvatarUrl(displayUrl);
          /* The register row / account row changed — every surface
             (header, roster wall, profile) re-reads it on refresh. */
          router.refresh();
        }}
      />
    </>
  );
}
