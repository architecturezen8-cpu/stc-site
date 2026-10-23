import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import {
  PORTAL_META,
  type PortalRoleKey,
} from "@/components/portal/portal-meta";
import { PortalRegisterForm } from "@/components/portal/portal-register-form";
import { PortalThemeToggle } from "@/components/portal/portal-theme-toggle";
import {
  getPortalSession,
  isPortalRole,
  PORTAL_HOME,
  PORTAL_LABEL,
} from "@/lib/portal-auth";

export const metadata: Metadata = {
  title: "Create an account | St. Thomas' College, Matale",
};

type SearchParams = Promise<{ email?: string }>;

/**
 * Per-portal registration: name + email + password. The account is active
 * immediately; the school office can pause or remove it from Admin →
 * Portal Users at any time.
 */
export default async function PortalRoleRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: SearchParams;
}) {
  const { role: roleParam } = await params;
  if (!isPortalRole(roleParam)) redirect("/register");
  const role: PortalRoleKey = roleParam;

  /* v2.8.37.1 — only THIS portal's session bounces; other portals are
     independent on the same browser. */
  const session = await getPortalSession(role);
  if (session) {
    redirect(PORTAL_HOME[role]);
  }

  const sp = await searchParams;
  const email = sp.email || "";

  const meta = PORTAL_META[role];
  const label = PORTAL_LABEL[role];
  const Icon = meta.icon;

  return (
    <main className="portal-scope relative flex min-h-screen flex-col">
      <PortalThemeToggle className="absolute right-4 top-4 sm:right-6 sm:top-6" />

      <div className="mx-auto w-full max-w-[440px] flex-1 px-4 py-8 sm:px-6">
        <Link
          href="/register"
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
              Create your account.
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--pt-body)]">
              {role === "student"
                ? "Register with your admission number — we verify it against the school register instantly."
                : role === "teacher"
                  ? "Register with your Teacher ID — we verify it against the staff register instantly."
                  : "Register with your child's admission number — we verify guardians against the school register."}
            </p>
          </div>

          <div className="pt-rise pt-d2 mt-6">
            <PortalRegisterForm role={role} defaultEmail={email} />
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--pt-border)] bg-[var(--pt-panel-soft)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--pt-body)]">
            <ShieldAlert size={15} className="shrink-0 text-[var(--pt-accent-text)]" />
            {role === "student"
              ? "Sign in later with your admission number and password. Your details are matched with the school register — anything that doesn't match goes to the office for a quick check."
              : "Your details are matched with the school register. Anything that doesn't match goes to the office for a quick approval before the account opens."}
          </div>
        </div>

        <p className="pt-rise pt-d3 mt-6 text-center text-[13px] text-[var(--pt-body)]">
          Already registered?{" "}
          <Link
            href={`/login/${role}${email ? `?email=${encodeURIComponent(email)}` : ""}`}
            className="font-semibold text-[var(--pt-accent-text)] transition-colors hover:text-[var(--pt-accent-hover)]"
          >
            Sign in instead
          </Link>
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
