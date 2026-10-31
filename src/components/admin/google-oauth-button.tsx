"use client";

import { useEffect, useRef } from "react";

/** Google "G" mark — shared by the login button, profile and role chips. */
export function GoogleIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C36.5 40.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

/**
 * "Continue with Google" — Phase 2.3.
 *
 * The browser is the only component that knows the public origin behind the
 * sandbox preview proxy (server-side Host headers are rewritten to
 * localhost:3000), so after hydration the start URL gains ?origin=… for the
 * OAuth redirect_to — set directly on the DOM node (no state churn, and every
 * click type gets the param). Before hydration (and without JS) the plain
 * href keeps the server-side header fallback working. v2.8.28.1.
 */
export function GoogleOauthButton() {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    linkRef.current?.setAttribute(
      "href",
      `/api/admin/auth/oauth?provider=google&origin=${encodeURIComponent(window.location.origin)}`,
    );
  }, []);

  return (
    <a
      ref={linkRef}
      href="/api/admin/auth/oauth?provider=google"
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl bg-white text-[13.5px] font-semibold text-[#1f1f1f] shadow-lg transition-all hover:bg-white/90 active:scale-[0.99]"
    >
      <GoogleIcon /> Continue with Google
    </a>
  );
}
