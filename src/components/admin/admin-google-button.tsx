"use client";

import { GoogleIcon } from "@/components/portal/portal-login-cards";

/**
 * Google button for the admin login page. The browser origin is appended at
 * click time so the OAuth callback returns to the real preview host (sandbox
 * proxies report localhost in Host headers). Without JS the plain href still
 * works — the server falls back to forwarded headers.
 */
export function AdminGoogleButton() {
  return (
    <a
      href="/api/admin/auth/google"
      onClick={(event) => {
        event.preventDefault();
        const origin = encodeURIComponent(window.location.origin);
        window.location.href = `/api/admin/auth/google?origin=${origin}`;
      }}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-white/[0.05] text-[13.5px] font-medium text-white transition-colors hover:border-white/35 hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd444]"
    >
      <GoogleIcon />
      Continue with Google
    </a>
  );
}
