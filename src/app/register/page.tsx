import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Crest } from "@/components/crest";
import { PortalLoginCards } from "@/components/portal/portal-login-cards";
import { PortalThemeToggle } from "@/components/portal/portal-theme-toggle";
import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";

export const metadata: Metadata = {
  title: "Create an account — Portals | St. Thomas' College, Matale",
  description:
    "Create your Student, Parent or Teacher portal account for St. Thomas' College, Matale.",
};

/**
 * Registration role picker — mirrors the calm /login picker.
 * v2.8.37.1: stays reachable for signed-in users (independent portals).
 */
export default async function RegisterPage() {
  /* v2.8.60.0 — the same synced login brand logo as /login. */
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
              />
            </div>
            <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-[var(--pt-heading)] sm:text-[28px]">
              Create your account
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--pt-body)]">
              Pick your portal and register with your name, email and a
              password. You can add Google sign-in later.
            </p>
          </div>

          <div className="pt-rise pt-d1">
            <PortalLoginCards register />
          </div>

          <div className="pt-rise pt-d2 mt-8 space-y-3 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)]"
            >
              <ArrowLeft size={14} />
              Already have an account? Sign in
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
