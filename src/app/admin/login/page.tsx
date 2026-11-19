import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, UserPlus } from "lucide-react";
import { AdminAuthForm } from "@/components/admin/auth-form";
import { AdminEmblem } from "@/components/admin/admin-emblem";
import { AdminGoogleButton } from "@/components/admin/admin-google-button";
import { adminSetupAvailable, getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Calm, specific notices for the Google sign-in outcomes. */
function GoogleNotice({ error, email }: { error: string; email?: string }) {
  let text = "";
  if (error === "google_not_admin") {
    text = email
      ? `${email} isn't an admin account in this studio. Admins are added by a Super Admin or via "Request access".`
      : "That Google account isn't an admin in this studio. Ask a Super Admin to add you, or use \"Request access\".";
  } else if (error === "google_disabled") {
    text = "This admin account is disabled right now. Please ask a Super Admin to re-enable it.";
  } else if (error === "google_unavailable") {
    text = "Google sign-in isn't configured yet — please use your email and password.";
  } else {
    text = "Google sign-in didn't finish. Nothing is wrong with your account — please try again.";
  }
  return (
    <p
      role="status"
      className="mb-6 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 text-[13px] leading-relaxed text-amber-200/90"
    >
      <ShieldAlert size={14} className="mr-1.5 -mt-0.5 inline" />
      {text}
    </p>
  );
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  if (await getAdminSession()) redirect("/admin");
  if (await adminSetupAvailable()) redirect("/admin/setup");
  const sp = await searchParams;
  const error = sp.error || "";
  const email = sp.email || "";
  const googleNotice =
    error === "google_not_admin" ||
    error === "google_disabled" ||
    error === "google_unavailable" ||
    error === "google_failed";

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-[#090908] px-4 py-10 text-white">
      <div className="grain pointer-events-none absolute inset-0 opacity-70" />
      <span className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#ffd444]/10 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur-sm sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <AdminEmblem size={44} />
          <div>
            <p className="font-display text-lg font-semibold">St. Thomas&apos; College</p>
            <p className="text-[8px] uppercase tracking-[0.32em] text-white/45">Admin Studio · Matale</p>
          </div>
        </div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#ffd444]">Secure sign in</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em]">Welcome back.</h1>
        <p className="mb-8 mt-2 text-[13.5px] leading-relaxed text-white/50">Edit, preview and publish the college website.</p>

        {googleNotice && <GoogleNotice error={error} email={email} />}

        <AdminAuthForm mode="login" />

        <div className="my-6 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.22em] text-white/30">
          <span className="h-px flex-1 bg-white/10" />
          or
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <AdminGoogleButton />

        <div className="mt-6 flex items-center justify-between text-[12px]">
          <Link
            href="/admin/request-access"
            className="inline-flex items-center gap-1.5 text-white/40 transition-colors hover:text-[#ffd444]"
          >
            <UserPlus size={13} /> Request access
          </Link>
          <span className="text-white/25">Invite-only studio</span>
        </div>
      </div>
    </main>
  );
}
