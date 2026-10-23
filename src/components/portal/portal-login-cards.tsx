"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  PORTAL_ROLES,
  type PortalRoleKey,
} from "@/components/portal/portal-meta";

/**
 * The three role cards on /login (and /register). Each card opens that
 * portal's sign-in (or registration) page — errors and hints live there,
 * keeping this picker calm.
 */
export function PortalLoginCards({ register = false }: { register?: boolean }) {
  return (
    <div className="grid w-full gap-3 sm:gap-4">
      {PORTAL_ROLES.map((entry) => {
        const Icon = entry.icon;
        return (
          <Link
            key={entry.role}
            id={`portal-card-${entry.role}`}
            href={register ? `/register/${entry.role}` : entry.href}
            className="pt-hover-lift group flex items-center gap-4 rounded-2xl border border-[var(--pt-border)] bg-[var(--pt-panel)] p-4 text-left pt-panel-shadow hover:-translate-y-0.5 hover:border-[var(--pt-accent)]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pt-accent)] sm:p-5"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)] transition-colors duration-300 group-hover:bg-[var(--pt-accent)] group-hover:text-[var(--pt-on-accent)]">
              <Icon size={22} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[17px] font-semibold tracking-[-0.01em] text-[var(--pt-heading)]">
                {entry.title}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-[var(--pt-body)]">
                {register ? `Create a ${entry.title.toLowerCase()} account` : entry.blurb}
              </span>
            </span>
            <ArrowRight
              size={18}
              className="shrink-0 text-[var(--pt-faint)] transition-all duration-300 group-hover:translate-x-1 group-hover:text-[var(--pt-accent)]"
            />
          </Link>
        );
      })}
    </div>
  );
}

/** Official four-colour Google "G" — never recolour it. */
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Google button for a specific portal. The browser origin is appended at
 * click time so the OAuth callback returns to the real preview host (sandbox
 * proxies report localhost in Host headers). Without JS the plain href still
 * works — the server falls back to forwarded headers.
 */
export function PortalGoogleButton({ role }: { role: PortalRoleKey }) {
  return (
    <a
      href={`/api/portal/auth/oauth?role=${role}`}
      onClick={(event) => {
        event.preventDefault();
        const origin = encodeURIComponent(window.location.origin);
        window.location.href = `/api/portal/auth/oauth?role=${role}&origin=${origin}`;
      }}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--pt-input-border)] bg-[var(--pt-input-bg)] text-[14.5px] font-medium text-[var(--pt-heading)] transition-all duration-300 hover:-translate-y-px hover:border-[var(--pt-border-strong)] hover:shadow-[0_10px_24px_-16px_rgb(0_0_0/0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pt-accent)]"
    >
      <GoogleIcon />
      Continue with Google
    </a>
  );
}
