import type { Metadata } from "next";
import Link from "next/link";
import { Crest } from "@/components/crest";
import { PortalLoginCards } from "@/components/portal/portal-login-cards";
import { PortalThemeToggle } from "@/components/portal/portal-theme-toggle";
import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";

export const metadata: Metadata = {
  title: "Sign in — Portals | St. Thomas' College, Matale",
  description:
    "Choose the Student, Parent or Teacher portal and sign in with Google or your school email.",
};

/**
 * Clean role picker — deliberately free of any error banners. Failed
 * attempts land on /login/[role] where a calm notice is shown instead.
 * v2.8.37.1: signed-in users still land here — each portal signs in
 * independently now, so the chooser must stay reachable (clicking a
 * portal whose session is already open bounces to that portal).
 * Themed via .portal-scope (dark "Obsidian & Gold" default, light opt-in).
 */
export default async function LoginPage() {
  /* v2.8.60.0 — the login portal draws the SAME synced brand logo as every
     other surface (the owner: "login page eke crest eka pennane na"): its
     own `portal-logo-login` registry entry, College Crest fallback, with
     the white-circle fill scale applied. */
  const brand = await getPortalBrandLogo("login").catch(() => null);
  const logoSrc = brand?.src ? stampLogoUrl(brand) : undefined;

  return (
    <main className="portal-scope relative flex min-h-screen flex-col">
      <PortalThemeToggle className="absolute right-4 top-4 sm:right-6 sm:top-6" />

      <div className="flex flex-1 items-center justify-center px-4 py-14 sm:px-6">
        <div className="w-full max-w-[400px]">
          <div className="pt-rise mb-8 text-center">
            <div className="mb-5 flex justify-center">
              <Crest
                initials="STC"
                label="St. Thomas' College crest"
                size="lg"
                logoSrc={logoSrc}
                logoScale={brand?.scale ?? 100}
                className="transition-transform duration-700 hover:scale-105"
              />
            </div>
            <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-[var(--pt-heading)] sm:text-[28px]">
              Who&apos;s signing in?
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--pt-body)]">
              St. Thomas&apos; College, Matale — portals for our students,
              parents and teachers.
            </p>
          </div>

          <div className="pt-rise pt-d1">
            <PortalLoginCards />
          </div>

          <div className="pt-rise pt-d2 mt-8 space-y-3 text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--pt-accent-text)] transition-colors hover:text-[var(--pt-accent-hover)]"
            >
              New here? Create an account
            </Link>
            <Link
              href="/admin/login"
              className="block text-[13px] font-medium text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)]"
            >
              School staff? Admin Studio login
            </Link>
          </div>
        </div>
      </div>

      <footer className="mt-auto px-4 pb-6 pt-4 text-center">
        <p className="text-[11px] tracking-[0.08em] text-[var(--pt-faint)]">
          St. Thomas&apos; College, Matale · Est. 1873
        </p>
      </footer>
    </main>
  );
}
