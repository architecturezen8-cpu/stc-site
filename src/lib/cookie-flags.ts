import { headers } from "next/headers";

/**
 * v2.9.14.1 — Cookie flags that survive the preview panel.
 *
 * The sandbox preview embeds the site inside a cross-origin IFRAME, and
 * browsers silently DROP SameSite=Lax cookies set in that third-party
 * context. The owner's bug report: "login wenawa wage pennanawa eth
 * lms-admin page ekata yanne na, errors mukuth pennaneth na" — the sign-in
 * POST returned ok:true (window.location.assign fired), but the session
 * cookie was never stored, so the studio guard bounced straight back to
 * the login page with no error anywhere.
 *
 * Rule: HTTPS requests (any standard forwarded-proto header, or an https
 * Origin) get SameSite=None; Secure — the only posture browsers accept in
 * a cross-site iframe. Plain HTTP (local dev on :3000) keeps Lax, because
 * SameSite=None is invalid without Secure and would break localhost.
 */
export type RequestCookieFlags = { sameSite: "none" | "lax"; secure: boolean };

export async function requestCookieFlags(): Promise<RequestCookieFlags> {
  const headerStore = await headers();
  const proto =
    headerStore
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase() ??
    headerStore.get("x-forwarded-scheme")?.trim().toLowerCase() ??
    "";
  if (proto === "https") return { sameSite: "none", secure: true };
  if (headerStore.get("x-forwarded-ssl")?.toLowerCase() === "on") {
    return { sameSite: "none", secure: true };
  }
  if (headerStore.get("origin")?.toLowerCase().startsWith("https://")) {
    return { sameSite: "none", secure: true };
  }
  return { sameSite: "lax", secure: false };
}
