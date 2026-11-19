import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Crest } from "@/components/crest";
import { PortalChooserButtons } from "@/components/portal/portal-chooser";
import { PortalThemeToggle } from "@/components/portal/portal-theme-toggle";
import { OAUTH_CHOICE_COOKIE, isPortalRole } from "@/lib/portal-auth";
import { peekPortalChoiceToken } from "@/lib/portal-choice";
import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";

export const metadata: Metadata = {
  title: "Choose a portal | St. Thomas' College, Matale",
};

/**
 * Post-Google step. Two shapes:
 *
 * notice=wrong_portal — the visitor signed in from a portal they don't
 * hold. The page becomes a calm "no access here" notice that lists the
 * portals their account DOES have (one tap continues the session there).
 *
 * default — the classic multi-role picker (still used when the account
 * genuinely holds several roles and no single intent applies).
 */
export default async function ChoosePortalPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; selected?: string }>;
}) {
  const store = await cookies();
  const token = store.get(OAUTH_CHOICE_COOKIE)?.value ?? "";
  const choice = token ? await peekPortalChoiceToken(token) : null;

  if (!choice || choice.roles.length === 0) {
    redirect("/login");
  }

  const sp = await searchParams;
  const wrongPortal = sp.notice === "wrong_portal";
  const selectedLabel =
    wrongPortal && isPortalRole(sp.selected)
      ? sp.selected!.charAt(0).toUpperCase() + sp.selected!.slice(1)
      : "";

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
            {wrongPortal ? (
              <>
                <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-[var(--pt-heading)] sm:text-[28px]">
                  No access here.
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--pt-body)]">
                  This account isn&apos;t registered for the{" "}
                  <span className="font-medium text-[var(--pt-heading)]">
                    {selectedLabel || "that"}
                  </span>{" "}
                  portal. It signs in as{" "}
                  <span className="font-medium text-[var(--pt-heading)]">{choice.email}</span>{" "}
                  — continue to the portal below.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-[var(--pt-heading)] sm:text-[28px]">
                  Which portal?
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--pt-body)]">
                  Signed in as{" "}
                  <span className="font-medium text-[var(--pt-heading)]">{choice.email}</span>
                  . This account has more than one role — pick where to go.
                </p>
              </>
            )}
          </div>

          <div className="pt-rise pt-d1">
            <PortalChooserButtons allowed={choice.roles} />
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
