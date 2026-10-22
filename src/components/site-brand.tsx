"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * v2.8.61.0 — the owner: "site eka reload karama nave bar eke logo eke
 * golden circal eke black S letter eka penila logo eka show wenne" — the
 * navbar/footer used to paint the golden "S" disc first and fetch the real
 * crest client-side, so EVERY reload flashed the placeholder.
 *
 * The root layout resolves the crest ON THE SERVER (same proven pattern
 * the portal layouts use) and hands it down through this context — the real
 * logo is inside the first HTML byte, nothing to flash.
 *
 * v2.8.62.0 — the owner reported the SAME golden-S moment AGAIN. Evidence:
 * the registry data is intact (all six brand rows published) and the theme
 * row is intact too — the flash only happens when the server-side crest
 * read hiccupped (a cold Supabase pooler on the first request after a
 * restart). Two hardenings, the same way the portal crest was hardened:
 *   1. The browser REMEMBERS the last good crest URL (localStorage), so a
 *      hiccuped render still paints the crest instead of the placeholder.
 *   2. While the crest value is genuinely UNKNOWN (server gave nothing and
 *      the check is still running) the navbar/footer show a NEUTRAL white
 *      circle — the golden "S" disc appears ONLY after the system confirms
 *      there truly is no crest configured.
 */

type SiteBrand = { schoolLogo: string };

const SiteBrandContext = createContext<SiteBrand>({ schoolLogo: "" });

export function SiteBrandProvider({
  schoolLogo,
  children,
}: {
  schoolLogo: string;
  children: ReactNode;
}) {
  return (
    <SiteBrandContext.Provider value={{ schoolLogo }}>
      {children}
    </SiteBrandContext.Provider>
  );
}

/** Server-delivered crest ("" when the registry has none / DB hiccup). */
export function useSiteBrand(): SiteBrand {
  return useContext(SiteBrandContext);
}

const CREST_CACHE_KEY = "stc-crest-url";

function readCrestCache(): string {
  try {
    return window.localStorage.getItem(CREST_CACHE_KEY) || "";
  } catch {
    return "";
  }
}

function writeCrestCache(url: string) {
  try {
    if (url) window.localStorage.setItem(CREST_CACHE_KEY, url);
    else window.localStorage.removeItem(CREST_CACHE_KEY);
  } catch {
    /* private mode — session-only memory */
  }
}

export type SiteCrest = {
  /** The best-known crest URL (server value first, then the browser's memory). */
  url: string;
  /**
   * "ready"    — the crest state is known: render the golden "S" disc when
   *              url is "" (the registry truly has none).
   * "unknown"  — the server sent nothing and the check is still running:
   *              render a NEUTRAL circle, never the "S" placeholder.
   */
  status: "ready" | "unknown";
  /** The <img> failed to load — drop to the honest fallback for THIS url. */
  failed: boolean;
};

/**
 * Crest resolver for the public chrome (navbar + footer). Merges the
 * server-delivered value, the browser's localStorage memory and one gentle
 * /api/site-settings refresh — and remembers every good crest URL it sees.
 */
export function useSiteCrest(): SiteCrest {
  const { schoolLogo: serverLogo } = useSiteBrand();
  const [state, setState] = useState<{
    url: string;
    status: "ready" | "unknown";
    failed: boolean;
  }>(() =>
    serverLogo
      ? { url: serverLogo, status: "ready", failed: false }
      : { url: "", status: "unknown", failed: false },
  );

  useEffect(() => {
    /* The server value always wins when it exists (freshest, stamped). */
    if (serverLogo) {
      writeCrestCache(serverLogo);
      setState({ url: serverLogo, status: "ready", failed: false });
      return;
    }
    /* Server hiccup — remember the last good crest from THIS browser. */
    const cached = readCrestCache();
    if (cached) {
      setState({ url: cached, status: "ready", failed: false });
    }
    let cancelled = false;
    fetch("/api/site-settings")
      .then((res) => res.json())
      .then((data: { schoolLogo?: string }) => {
        if (cancelled) return;
        const url = (data.schoolLogo || "").trim();
        if (url) {
          writeCrestCache(url);
          setState({ url, status: "ready", failed: false });
        } else if (!cached) {
          /* Confirmed: the registry really has no crest. */
          setState((prev) =>
            prev.url ? prev : { url: "", status: "ready", failed: prev.failed },
          );
        }
      })
      .catch(() => {
        if (!cancelled && !cached) {
          /* Network died mid-check — stay neutral, never fake the "S". */
          setState((prev) =>
            prev.url ? prev : { url: "", status: "unknown", failed: prev.failed },
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [serverLogo]);

  const markFailed = () => {
    setState((prev) => {
      if (prev.url) writeCrestCache("");
      return { url: "", status: "ready", failed: true };
    });
  };

  return { url: state.failed ? "" : state.url, status: state.status, failed: state.failed };
}

/**
 * The shared crest renderer for navbar + footer: real image → white circle
 * (state unknown) → golden "S" disc (confirmed empty). One component, so
 * every public surface falls back identically.
 */
export function SiteCrestImg({
  size = 40,
  alt,
  className = "",
}: {
  /** px size of the circle (40 navbar, 44 footer). */
  size?: number;
  alt: string;
  className?: string;
}) {
  const crest = useSiteCrest();
  /* A URL that fails to load (deleted blob, dead link) falls back honestly —
     but only for THIS browser session's render; the memory cache is cleared
     by useSiteCrest's consumers when a fresh good URL arrives. */
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  const url = failed ? "" : crest.url;

  if (url) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        style={box}
        className={`rounded-full border border-white/20 bg-white object-contain p-0.5 ${className}`}
      />
    );
  }
  if (crest.status === "unknown") {
    /* v2.8.62.0 — neutral circle while the crest state is unknown: the old
       behaviour painted the golden "S" here, which the owner read as a bug. */
    return (
      <span
        style={box}
        aria-hidden="true"
        className={`grid place-items-center rounded-full border border-white/25 bg-white/90 ${className}`}
      />
    );
  }
  return (
    <span
      style={box}
      aria-hidden="true"
      className={`grid place-items-center rounded-full bg-gold font-display text-xl font-semibold text-ink ${className}`}
    >
      S
    </span>
  );
}
