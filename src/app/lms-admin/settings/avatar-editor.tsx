"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { PhotoStudio } from "@/components/shared/photo-studio";

/**
 * v2.9.15.0 — self-service profile photo control on the LMS Admin Studio's
 * Profile page (the identity card's avatar slot, as a small client island).
 *
 * v2.9.15.6 — the avatar is now a DOOR into the shared Photo Studio popup
 * (the owner: "profile photo ekata photo ekak danna giyama eka click
 * karama popup ekak enna one ... eke crop, delete, filter, color edit
 * wage options danna"). WhatsApp-style circular crop, Instagram-style
 * filter chips, fine-tune sliders, rotate/flip — and the same private
 * endpoints: POST /api/lms-admin/profile/photo (bytes land in the PRIVATE
 * lms-admin-avatars/ prefix, previous blob really deleted) and DELETE
 * (remove — the storage ledger is marked in the same breath). A Google
 * picture cannot be removed, only uploaded over — same rule as before.
 */
export function LmsAdminAvatarEditor({
  avatarUrl,
  initial,
  ownerName,
}: {
  /** Gated display URL of the current photo (or null → gold initial). */
  avatarUrl: string | null;
  /** Single-letter fallback shown when no photo exists. */
  initial: string;
  /** The admin's display name (the studio's dialog caption). */
  ownerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /* Local preview makes the new photo visible INSTANTLY — before the
     router.refresh() re-render lands. "removed" pins the fallback so the
     old photo cannot flash back in the gap before the refresh completes. */
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [removed, setRemoved] = useState(false);

  const shown = removed ? null : (preview ?? avatarUrl);
  /* An uploaded photo always rides the gated /api/lms-admin/avatar/ route —
     that prefix is what distinguishes a custom upload from a Google-account
     picture (which cannot be removed here, only uploaded over). */
  const hasCustom = shown?.startsWith("/api/lms-admin/avatar/") ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={shown ? "Edit profile photo" : "Add profile photo"}
        title={shown ? "Tap to edit your photo — crop, filters, remove" : "Tap to add a photo"}
        className="group relative h-16 w-16 shrink-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--la-accent)]"
      >
        {shown ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={shown}
            alt=""
            className="h-16 w-16 rounded-2xl object-cover ring-1 ring-[var(--la-border)] transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#ffd444] text-xl font-bold text-black">
            {initial}
          </span>
        )}
        <span
          aria-hidden
          className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full border border-[var(--la-border)] bg-[var(--la-panel)] text-[var(--la-body)] shadow transition-colors group-hover:border-[var(--la-border-strong)] group-hover:text-[var(--la-heading)]"
        >
          <Camera size={13} />
        </span>
      </button>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--la-border)] bg-[var(--la-panel-soft)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--la-heading)] transition-colors hover:border-[var(--la-border-strong)]"
        >
          {hasCustom ? "Edit photo" : "Upload photo"}
        </button>
      </div>

      <PhotoStudio
        open={open}
        onClose={() => setOpen(false)}
        ownerName={ownerName}
        title="Profile photo"
        currentPhotoUrl={shown}
        initials={initial}
        upload={{ endpoint: "/api/lms-admin/profile/photo", method: "POST" }}
        remove={hasCustom ? { endpoint: "/api/lms-admin/profile/photo", method: "DELETE" } : null}
        onDone={(displayUrl) => {
          if (displayUrl) {
            setPreview(displayUrl);
            setRemoved(false);
          } else {
            setRemoved(true);
            setPreview(null);
          }
          router.refresh();
        }}
      />
    </>
  );
}
