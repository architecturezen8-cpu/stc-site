import Link from "next/link";
import { GraduationCap } from "lucide-react";
import type { LmsAdminSession } from "@/lib/lms-admin-auth";
import { LMS_ADMIN_NAV, type LmsAdminNavKey } from "@/components/lms-admin/nav-items";
import { LmsAdminMobileNav } from "@/components/lms-admin/mobile-nav";
import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";

/**
 * LMS ADMIN STUDIO shell — the LMS team's separate back office. Deliberately
 * NOT the website Admin Studio (module isolation): different URL, different
 * accounts, different navigation. v2.8.38.0 redesign after the owner's
 * reference: every colour reads from the .lms-admin-scope --la-* token set
 * (pastel light + soft charcoal dark), the nav is a rounded pill track like
 * the reference's "Cases" pill, and the gold crest stays the single brand
 * accent. The scope class also activates the shared-manager theme remaps in
 * globals.css, so the light-styled managers follow the active theme.
 *
 * v2.8.39.0 — on MOBILE the pill strip is replaced by a slide-in side panel
 * (owner request, reference-style): a hamburger opens the drawer; md:+ keeps
 * the pill track. Both render from the shared LMS_ADMIN_NAV list.
 *
 * v2.8.41.1 — header contract now matches the portals on EVERY breakpoint:
 * the right side carries ONLY the side-panel button (profile, theme toggle
 * and sign-out live in that panel — owner: "mokada profile, dark theme light
 * theme togel ekai, sign out ekai side panel eke thiyanawa ne"). The md: pill
 * track stays as the always-visible section navigation.
 */

export type { LmsAdminNavKey };

export async function LmsAdminShell({
  session,
  title,
  subtitle,
  active,
  children,
}: {
  session: LmsAdminSession;
  title: string;
  subtitle?: string;
  active: LmsAdminNavKey;
  children: React.ReactNode;
}) {
  /* v2.8.60.0 — the synced ADMIN LOGO (Admin → Logos & Crests → "Admin
     Studio logo (synced)", College Crest fallback) dresses the studio
     tile too; the built-in GraduationCap stands in when nothing is set. */
  const brand = await getPortalBrandLogo("admin").catch(() => null);
  const adminLogoSrc = brand?.src ? stampLogoUrl(brand) : "";
  return (
    <div className="lms-admin-scope flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--la-border)] bg-[var(--la-header-bg)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* v2.8.41.0 — taller header row (owner: "header height eka poddak
              wadi karanawada") — now matches the portals' breathing room. */}
          <div className="flex h-[72px] items-center justify-between gap-3">
            <Link href="/lms-admin" className="flex min-w-0 items-center gap-3">
              {adminLogoSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={adminLogoSrc}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-2xl border border-white/15 bg-white object-contain p-1 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.5)]"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#ffd444] text-black shadow-[0_8px_20px_-10px_rgba(255,212,68,0.7)]">
                  <GraduationCap className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--la-heading)]">
                  LMS Admin Studio
                </span>
                <span className="block truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--la-muted)]">
                  St. Thomas&apos; College · Matale
                </span>
              </span>
            </Link>

            <div className="flex items-center gap-2">
              {/* v2.8.41.1 — the ONE header action on every breakpoint: the
                  side-panel button. Profile, theme toggle and sign-out are
                  panel content (drawer footer), exactly like the portals. */}
              <LmsAdminMobileNav
                active={active}
                name={session.fullName || ""}
                email={session.email}
              />
            </div>
          </div>

          <nav
            aria-label="LMS admin sections"
            className="hidden gap-1 overflow-x-auto pb-3 md:flex"
          >
            <span className="flex gap-1 rounded-full border border-[var(--la-border)] bg-[var(--la-nav-track)] p-1">
              {LMS_ADMIN_NAV.map((item) => {
                const isActive = item.key === active;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-300 ${
                      isActive
                        ? "bg-[var(--la-nav-active-bg)] font-semibold text-[var(--la-nav-active-text)] shadow-[var(--la-nav-glow)]"
                        : "font-medium text-[var(--la-body)] hover:text-[var(--la-heading)]"
                    }`}
                  >
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-[var(--la-heading)] sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-3xl text-sm text-[var(--la-body)]">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </main>

      <footer className="mt-auto border-t border-[var(--la-border)] bg-[var(--la-panel)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-xs text-[var(--la-muted)] sm:px-6">
          LMS Admin Studio · Learning-management back office · website content lives in the
          separate Admin Studio at <span className="font-semibold text-[var(--la-body)]">/admin</span>
        </div>
      </footer>
    </div>
  );
}
