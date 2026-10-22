import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert, UserRoundPlus } from "lucide-react";
import {
  PORTAL_META,
  type PortalRoleKey,
} from "@/components/portal/portal-meta";
import { PortalGoogleButton } from "@/components/portal/portal-login-cards";
import { PortalPasswordForm } from "@/components/portal/portal-sign-in";
import { PortalThemeToggle } from "@/components/portal/portal-theme-toggle";
import {
  getPortalSession,
  isPortalRole,
  PORTAL_HOME,
  PORTAL_LABEL,
} from "@/lib/portal-auth";

export const metadata: Metadata = {
  title: "Portal sign in | St. Thomas' College, Matale",
};

type SearchParams = Promise<{
  error?: string;
  email?: string;
}>;

/**
 * Per-portal sign-in: Google first, email & password beneath. Failures from
 * the OAuth callback arrive as calm, styled notices — never scary banners.
 */
export default async function PortalRoleLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: SearchParams;
}) {
  const { role: roleParam } = await params;
  if (!isPortalRole(roleParam)) redirect("/login");
  const role: PortalRoleKey = roleParam;

  /* v2.8.37.1 — bounce only when THIS portal's session is already open;
     other portals on this browser are independent. */
  const session = await getPortalSession(role);
  if (session) {
    redirect(PORTAL_HOME[role]);
  }

  const sp = await searchParams;
  const error = sp.error || "";
  const email = sp.email || "";

  const meta = PORTAL_META[role];
  const label = PORTAL_LABEL[role];
  const Icon = meta.icon;

  return (
    <main className="portal-scope relative flex min-h-screen flex-col">
      <PortalThemeToggle className="absolute right-4 top-4 sm:right-6 sm:top-6" />

      <div className="mx-auto w-full max-w-[440px] flex-1 px-4 py-8 sm:px-6">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--pt-body)] transition-colors hover:text-[var(--pt-heading)]"
        >
          <ArrowLeft size={15} />
          Other portals
        </Link>

        <div className="pt-rise pt-panel-shadow mt-8 rounded-3xl border border-[var(--pt-border)] bg-[var(--pt-panel)]/70 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-[var(--pt-border-strong)] sm:p-8">
          <div className="text-center">
            <div className="mb-5 flex justify-center">
              <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[var(--pt-accent-soft)] text-[var(--pt-accent-text)]">
                <Icon size={30} strokeWidth={1.6} />
              </span>
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pt-accent-text)]">
              {label} Portal
            </p>
            <h1 className="mt-1.5 font-display text-[26px] font-semibold tracking-[-0.02em] text-[var(--pt-heading)]">
              Welcome back.
            </h1>
          </div>

          {error === "not_registered" && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--pt-info-text)]"
            >
              {email ? (
                <>
                  <span className="font-semibold">{email}</span> isn&apos;t on
                  the {label} list yet.
                </>
              ) : (
                <>This Google account isn&apos;t on the {label} list yet.</>
              )}
              <span className="mt-2.5 block">
                <Link
                  href={`/register/${role}${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-accent)] px-4 py-2 text-[12.5px] font-semibold text-[var(--pt-on-accent)] transition-all duration-300 hover:-translate-y-px hover:bg-[var(--pt-accent-hover)]"
                >
                  <UserRoundPlus size={14} />
                  Create an account
                </Link>
              </span>
            </div>
          )}
          {error === "pending" && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-info-bg)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--pt-info-text)]"
            >
              Your registration is with the school office. Once they approve
              it, sign in here with the same details.
            </div>
          )}
          {(error === "oauth_failed" || error === "expired") && (
            <p
              role="status"
              className="mt-6 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-danger-bg)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--pt-danger-text)]"
            >
              <ShieldAlert size={14} className="mr-1.5 -mt-0.5 inline" />
              Google sign-in didn&apos;t finish. Nothing is wrong with your
              account — please try again.
            </p>
          )}

          <div className="pt-rise pt-d2 mt-6">
            <PortalGoogleButton role={role} />
            <PortalPasswordForm role={role} defaultEmail={email} />
          </div>
        </div>

        <p className="pt-rise pt-d3 mt-6 text-center text-[13px] text-[var(--pt-body)]">
          New to this portal?{" "}
          <Link
            href={`/register/${role}${email ? `?email=${encodeURIComponent(email)}` : ""}`}
            className="font-semibold text-[var(--pt-accent-text)] transition-colors hover:text-[var(--pt-accent-hover)]"
          >
            Create an account
          </Link>
        </p>

        <p className="pt-rise pt-d3 mt-4 text-center text-[11.5px] text-[var(--pt-faint)]">
          The school office can also add accounts for you — Admin → Portal
          Users.
        </p>
      </div>

      <footer className="mt-auto px-4 pb-6 pt-4 text-center">
        <p className="text-[11px] tracking-[0.08em] text-[var(--pt-faint)]">
          St. Thomas&apos; College, Matale · Est. 1873
        </p>
      </footer>
    </main>
  );
}
