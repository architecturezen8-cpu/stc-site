"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Supabase Auth bounces failed OAuth/invite round-trips to the configured
 * Site URL with ?error=…&error_code=…&error_description=… query params.
 * When that Site URL is this site's home page, route the visitor to the admin
 * login screen with a friendly message instead of leaving them on a
 * confusing public page (v2.8.28.1 — "State has already been used" bounce).
 *
 * Window-only parsing (no useSearchParams) so no Suspense boundary is needed
 * and SSR output is identical to a normal home render.
 */
export function OAuthBounceHandler() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const errorCode = params.get("error_code") ?? "";
    const description = params.get("error_description") ?? "";
    if (!error || !description) return;

    const isAuthBounce =
      errorCode.startsWith("flow_state") ||
      errorCode === "access_denied" ||
      errorCode === "otp_expired" ||
      /oauth|google|state|consent|login/i.test(description);
    if (!isAuthBounce) return;

    router.replace("/admin/login?error=oauth_failed");
  }, [router]);

  return null;
}
