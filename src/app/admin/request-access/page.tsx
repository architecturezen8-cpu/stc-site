import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminEmblem } from "@/components/admin/admin-emblem";
import { AccessRequestForm } from "@/components/admin/access-request-form";
import { adminSetupAvailable, getAdminSession } from "@/lib/admin-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Request Admin Access — St. Thomas' College",
  robots: { index: false, follow: false },
};

export default async function RequestAccessPage() {
  if (await getAdminSession()) redirect("/admin");
  if (await adminSetupAvailable()) redirect("/admin/setup");

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
        <p className="text-[10px] uppercase tracking-[0.3em] text-[#ffd444]">Access request</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em]">Request admin access.</h1>
        <p className="mb-8 mt-2 text-[13.5px] leading-relaxed text-white/50">
          Accounts are invite-only. Send a request and a Super Admin will review it.
        </p>
        <AccessRequestForm />
        <Link
          href="/admin/login"
          className="mt-6 inline-flex items-center gap-2 text-[12px] text-white/40 transition-colors hover:text-white"
        >
          <ArrowLeft size={13} /> Back to sign in
        </Link>
      </div>
    </main>
  );
}
