import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LmsAdminLoginForm } from "@/components/lms-admin/login-form";
import {
  getLmsAdminSession,
  lmsAdminSetupAvailable,
} from "@/lib/lms-admin-auth";
import { supabaseAuthConfigured } from "@/lib/supabase-auth";
import { getPortalBrandLogo, stampLogoUrl } from "@/lib/logos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LMS Admin Sign-in · St. Thomas' College Matale",
};

export default async function LmsAdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getLmsAdminSession();
  if (session) redirect("/lms-admin");

  const params = await searchParams;
  const rawError = typeof params.error === "string" ? params.error : undefined;
  const rawEmail = typeof params.email === "string" ? params.email : undefined;

  /* v2.8.60.0 — the synced admin logo rides the sign-in card too. */
  const brand = await getPortalBrandLogo("admin").catch(() => null);
  const logoSrc = brand?.src ? stampLogoUrl(brand) : undefined;

  return (
    <div className="lms-admin-scope flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <LmsAdminLoginForm
        googleEnabled={supabaseAuthConfigured()}
        setupAvailable={await lmsAdminSetupAvailable()}
        initialError={rawError}
        initialEmail={rawEmail}
        logoSrc={logoSrc}
      />
    </div>
  );
}
