"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";

/**
 * v2.8.59.0 — the SELF-SERVICE profile photo control on the portal profile
 * page (the owner: "studentslatai option ekak danna wei ... teacherslage
 * profile walatath teachertai lms-admintai images danna option ekak danna
 * wei ne"). The avatar shows the register photo when one exists; the camera
 * badge opens the picker and POSTs to /api/portal/profile/photo, which pins
 * the bytes to the person's REGISTER row — the same row the teacher's
 * roster wall reads. A refresh swaps every surface to the new face.
 */
export function ProfilePhotoUpload({
  photoUrl,
  name,
  fallbackClassName,
}: {
  /** Current register photo (or null → the initials disc stands in). */
  photoUrl: string | null;
  name: string;
  /** Classes of the initials disc fallback. */
  fallbackClassName?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const shown = preview ?? photoUrl;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/portal/profile/photo", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        photoUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.photoUrl) {
        throw new Error(json.error || "Could not upload the photo.");
      }
      setPreview(json.photoUrl);
      /* The register row changed — every surface (header, roster wall,
         profile) should re-read it. */
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "ST";

  return (
    <div className="relative">
      {shown ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={shown}
          alt={`${name}'s profile photo`}
          className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--pt-accent)]/40"
        />
      ) : (
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full font-display text-[20px] font-semibold ${fallbackClassName ?? "bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]"}`}
        >
          {initials}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={shown ? "Change profile photo" : "Add profile photo"}
        title={shown ? "Change photo" : "Add photo"}
        className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-[var(--pt-border)] bg-[var(--pt-panel)] text-[var(--pt-body)] shadow transition-colors hover:border-[var(--pt-accent)] hover:text-[var(--pt-accent-text)] disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {error ? (
        <p
          role="status"
          className="absolute left-0 top-full z-10 mt-2 w-56 rounded-lg bg-[var(--pt-danger-bg)] px-3 py-2 text-[11px] text-[var(--pt-danger-text)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
