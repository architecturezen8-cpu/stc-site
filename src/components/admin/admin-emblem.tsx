"use client";

import { useEffect, useState } from "react";

/**
 * The Admin Studio emblem — v2.8.60.0.
 *
 * The emblem is now the SYNCED ADMIN LOGO: the `portal-logo-admin` entry in
 * the central registry (Admin → Logos & Crests), falling back to the
 * College Crest — the owner asked for "ekenma admin ekata sync wena ekath"
 * (one logo place that also dresses the admin). One save there updates the
 * studio sidebar, dashboard, login and request-access pages together; the
 * /api/site-settings response carries it version-stamped so a replaced
 * image can never render stale. No image → the gold STC initials disc.
 */

type AdminBrand = { src: string; scale: number } | null;

export function AdminEmblem({
  size = 40,
  className = "",
}: {
  /** Pixel diameter of the emblem circle. */
  size?: number;
  className?: string;
}) {
  const [brand, setBrand] = useState<AdminBrand>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/site-settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive || !json) return;
        const src = typeof json.adminLogo === "string" ? json.adminLogo.trim() : "";
        const scale = Math.min(240, Math.max(40, Number(json.adminLogoScale) || 100));
        setBrand(src ? { src, scale } : null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const src = brand && !failed ? brand.src : "";
  const scale = brand?.scale ?? 100;

  return (
    <span
      aria-label="College emblem"
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-white text-[#0b0b0a] shadow-[0_2px_14px_rgba(0,0,0,0.30)] ring-1 ring-black/10 ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full rounded-full object-contain"
          onError={() => setFailed(true)}
          style={scale !== 100 ? { transform: `scale(${scale / 100})` } : undefined}
        />
      ) : (
        <span
          className="font-display font-bold text-[#0b0b0a]"
          style={{ fontSize: Math.max(9, Math.round(size * 0.32)) }}
        >
          STC
        </span>
      )}
    </span>
  );
}
