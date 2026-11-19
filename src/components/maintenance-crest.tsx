"use client";

import { useState } from "react";

/**
 * Crest disc for the /maintenance screen (v2.8.40.1). The CMS crest URL can
 * 404 — e.g. a local-driver upload wiped from disk by a sandbox restart —
 * and a broken-image icon inside the white circle looks terrible (the owner
 * hit exactly that). This client disc renders the <img> and silently falls
 * back to the same inked-shield mark the preloader draws when the image
 * fails to load. Server components can't do onError, hence this one tiny
 * client island.
 */
export function MaintenanceCrest({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = src !== "" && !failed;

  return showImage ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="mtc-crest"
      onError={() => setFailed(true)}
    />
  ) : (
    <svg viewBox="0 0 64 64" className="mtc-crest" fill="none" aria-hidden="true">
      <path
        d="M32 6 L54 16 V34 C54 47 44 55 32 58 C20 55 10 47 10 34 V16 Z"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M32 18 L43 23 V33 C43 40 38 44.5 32 46.5 C26 44.5 21 40 21 33 V23 Z"
        fill="currentColor"
        opacity=".92"
      />
      <path d="M32 6 V58" stroke="currentColor" strokeWidth="1" opacity=".2" />
    </svg>
  );
}
